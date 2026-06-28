#!/usr/bin/env node
/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * EC2 repair: rebuild config.json from local backups, push secrets to AWS SM, write _sm pointers.
 * Run on instance as svc_ams-oscal with OSCAL_SECRETS_MODE=aws-sm and OSCAL_SECRETS_MANAGER_ARN set.
 *
 *   cd /opt/oscal/app && node scripts/debug/repair-ec2-config-from-backups.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
process.chdir(repoRoot);

const CONFIG_PATH = process.env.CONFIG_PATH || '/opt/oscal/data/config.json';
const DATA_DIR = path.dirname(CONFIG_PATH);
const MIN_CONFIG_BYTES = 256;

const { SENSITIVE_CONFIG_KEYS, getByPath, setByPath, isMaskedOrEmpty } = await import(
  path.join(repoRoot, 'backend/utils/sensitiveConfigKeys.js')
);
const { isCfgEncPointer, decryptConfigSecret, canResolveCfgEnc } = await import(
  path.join(repoRoot, 'backend/utils/configFieldCrypto.js')
);
const { isPassPointer, passShow } = await import(path.join(repoRoot, 'backend/utils/passResolver.js'));
const {
  isAwsSmMode,
  getSecretsManagerArn,
  mergeAndPutBundle,
  reloadSecretsFromAws,
  initializeSecretsCache,
  getSecret,
  entryKeyToConfigPointer,
  isSmPointer,
} = await import(path.join(repoRoot, 'backend/utils/secretsManager.js'));
const { atomicWriteJSON } = await import(path.join(repoRoot, 'backend/utils/atomicWrite.js'));

function readJsonFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size < 32) return null;
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function listCandidatePaths() {
  const names = new Set([CONFIG_PATH, `${CONFIG_PATH}.backup`]);
  try {
    for (const name of fs.readdirSync(DATA_DIR)) {
      if (name.startsWith('config.json')) {
        names.add(path.join(DATA_DIR, name));
      }
    }
  } catch {
    /* ignore */
  }
  return [...names].filter((p) => {
    try {
      return fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });
}

function scoreConfig(cfg) {
  if (!cfg) return 0;
  let score = 0;
  const okta = cfg?.ssoConfig?.oauth?.providers?.okta;
  const generic = cfg?.ssoConfig?.oauth?.providers?.Generic_OIDC;
  const smtp = cfg?.messagingConfig?.email;
  if (okta?.enabled) score += 10;
  if (okta?.domain) score += 20;
  if (okta?.clientId) score += 10;
  if (generic?.enabled) score += 10;
  if (generic?.issuerUrl || generic?.discoveryUrl) score += 30;
  if (generic?.clientId) score += 10;
  if (smtp?.smtpHost) score += 15;
  if (smtp?.smtpUser) score += 5;
  score += Math.min(JSON.stringify(cfg).length / 200, 40);
  return score;
}

function deepMerge(base, overlay) {
  if (!overlay || typeof overlay !== 'object') return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(overlay)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else if (v !== undefined && v !== null) {
      out[k] = v;
    }
  }
  return out;
}

function extractPlainSecret(value) {
  if (value == null) return '';
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t || t === '********') return '';
    return t;
  }
  if (isSmPointer(value)) return '';
  if (isPassPointer(value)) {
    return (passShow(value._pass) || '').trim();
  }
  if (isCfgEncPointer(value)) {
    if (!canResolveCfgEnc()) return '';
    try {
      return decryptConfigSecret(value).trim();
    } catch {
      return '';
    }
  }
  return '';
}

function pickBestProvider(candidates, providerKey, preferFn) {
  let best = null;
  let bestScore = -1;
  for (const cfg of candidates) {
    const p = cfg?.ssoConfig?.oauth?.providers?.[providerKey];
    if (!p) continue;
    const s = preferFn(p);
    if (s > bestScore) {
      bestScore = s;
      best = p;
    }
  }
  return best;
}

async function main() {
  if (!isAwsSmMode()) {
    console.error('OSCAL_SECRETS_MODE must be aws-sm');
    process.exit(1);
  }
  if (!getSecretsManagerArn()) {
    console.error('OSCAL_SECRETS_MANAGER_ARN is required');
    process.exit(1);
  }

  const candidatePaths = listCandidatePaths();
  const candidates = candidatePaths.map((p) => ({ path: p, cfg: readJsonFile(p) })).filter((c) => c.cfg);
  if (candidates.length === 0) {
    console.error('No valid config.json backups found under', DATA_DIR);
    process.exit(1);
  }

  candidates.sort((a, b) => scoreConfig(b.cfg) - scoreConfig(a.cfg));
  let merged = JSON.parse(JSON.stringify(candidates[0].cfg));

  const oktaBest = pickBestProvider(
    candidates.map((c) => c.cfg),
    'okta',
    (p) => (p.enabled ? 10 : 0) + (p.domain ? 30 : 0) + (p.clientId ? 10 : 0),
  );
  const genericBest = pickBestProvider(
    candidates.map((c) => c.cfg),
    'Generic_OIDC',
    (p) =>
      (p.enabled ? 10 : 0)
      + (p.issuerUrl || p.discoveryUrl ? 40 : 0)
      + (p.clientId ? 10 : 0)
      + (extractPlainSecret(p.clientSecret).length > 0 ? 20 : 0),
  );
  const smtpBest = pickBestProvider(
    candidates.map((c) => c.cfg),
    null,
    () => 0,
  );
  void smtpBest; // smtp merged below from first cfg with smtpHost

  merged.ssoConfig = merged.ssoConfig || {};
  merged.ssoConfig.oauth = merged.ssoConfig.oauth || {};
  merged.ssoConfig.oauth.providers = merged.ssoConfig.oauth.providers || {};

  if (oktaBest) {
    merged.ssoConfig.oauth.providers.okta = deepMerge(
      merged.ssoConfig.oauth.providers.okta || {},
      { ...oktaBest, clientSecret: oktaBest.clientSecret },
    );
  }
  if (genericBest) {
    merged.ssoConfig.oauth.providers.Generic_OIDC = deepMerge(
      merged.ssoConfig.oauth.providers.Generic_OIDC || {},
      { ...genericBest, clientSecret: genericBest.clientSecret, tlsRelaxed: true },
    );
  }

  for (const cfg of candidates.map((c) => c.cfg)) {
    const smtp = cfg?.messagingConfig?.email;
    if (smtp?.smtpHost) {
      merged.messagingConfig = merged.messagingConfig || {};
      merged.messagingConfig.email = deepMerge(merged.messagingConfig.email || {}, smtp);
      break;
    }
  }

  await initializeSecretsCache();

  const smPartial = {};
  for (const { path: keyPath, smEntry } of SENSITIVE_CONFIG_KEYS) {
    const current = getByPath(merged, keyPath);
    const plain = extractPlainSecret(current);
    if (plain) {
      smPartial[smEntry] = plain;
    }
  }

  if (Object.keys(smPartial).length > 0) {
    const put = await mergeAndPutBundle(smPartial);
    if (!put.success) {
      console.error('SM merge failed:', put.error || 'unknown');
      process.exit(1);
    }
    await reloadSecretsFromAws();
  }

  for (const { path: keyPath, smEntry } of SENSITIVE_CONFIG_KEYS) {
    const current = getByPath(merged, keyPath);
    const inSm = (getSecret(smEntry) || '').trim();
    if (inSm) {
      setByPath(merged, keyPath, entryKeyToConfigPointer(smEntry));
    } else if (!isMaskedOrEmpty(current) && !isSmPointer(current)) {
      /* keep plaintext only when SM has no value yet */
    }
  }

  merged.lastModified = new Date().toISOString();
  const serialized = JSON.stringify(merged, null, 2);
  if (serialized.length < MIN_CONFIG_BYTES) {
    console.error(`Refusing to write config smaller than ${MIN_CONFIG_BYTES} bytes`);
    process.exit(1);
  }

  await atomicWriteJSON(CONFIG_PATH, merged, { backup: true });

  console.log(
    JSON.stringify(
      {
        success: true,
        configPath: CONFIG_PATH,
        sources: candidates.map((c) => ({ path: c.path, score: scoreConfig(c.cfg) })),
        smMergedKeys: Object.keys(smPartial),
        oktaEnabled: merged?.ssoConfig?.oauth?.providers?.okta?.enabled ?? false,
        oktaDomain: merged?.ssoConfig?.oauth?.providers?.okta?.domain ?? null,
        genericEnabled: merged?.ssoConfig?.oauth?.providers?.Generic_OIDC?.enabled ?? false,
        genericIssuer: merged?.ssoConfig?.oauth?.providers?.Generic_OIDC?.issuerUrl ?? null,
        smtpHost: merged?.messagingConfig?.email?.smtpHost ?? null,
        oktaSecretLen: (getSecret('OSCAL/sso-oauth-okta-client-secret') || '').length,
        genericSecretLen: (getSecret('OSCAL/sso-oauth-generic-oidc-client-secret') || '').length,
        smtpSecretLen: (getSecret('OSCAL/smtp-password') || '').length,
        configBytes: serialized.length,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
