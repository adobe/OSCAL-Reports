#!/usr/bin/env node
/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * One-time EC2 repair: store Generic OIDC client secret in AWS SM and point config at _sm.
 * Usage (on instance as svc_ams-oscal with service env):
 *   OSCAL_FIX_GENERIC_OIDC_SECRET='...' node scripts/debug/fix-ec2-generic-oidc-secret.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
process.chdir(repoRoot);

const SM_ENTRY = 'OSCAL/sso-oauth-generic-oidc-client-secret';
const CONFIG_PATH = process.env.CONFIG_PATH || '/opt/oscal/data/config.json';

const { mergeAndPutBundle, reloadSecretsFromAws, getSecret } = await import(
  path.join(repoRoot, 'backend/utils/secretsManager.js')
);
const { atomicWriteJSON } = await import(path.join(repoRoot, 'backend/utils/atomicWrite.js'));
const { entryKeyToConfigPointer } = await import(path.join(repoRoot, 'backend/utils/secretsManager.js'));

const plain = (process.env.OSCAL_FIX_GENERIC_OIDC_SECRET || '').trim();
if (!plain) {
  console.error('Set OSCAL_FIX_GENERIC_OIDC_SECRET to the Generic OIDC client secret (non-empty).');
  process.exit(1);
}

const put = await mergeAndPutBundle({ [SM_ENTRY]: plain });
if (!put.success) {
  console.error('SM put failed:', put.error || 'unknown');
  process.exit(1);
}
await reloadSecretsFromAws();

const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
cfg.ssoConfig = cfg.ssoConfig || {};
cfg.ssoConfig.oauth = cfg.ssoConfig.oauth || {};
cfg.ssoConfig.oauth.providers = cfg.ssoConfig.oauth.providers || {};
cfg.ssoConfig.oauth.providers.Generic_OIDC = cfg.ssoConfig.oauth.providers.Generic_OIDC || {};

const smResolved = (getSecret(SM_ENTRY) || '').trim();
if (smResolved) {
  cfg.ssoConfig.oauth.providers.Generic_OIDC.clientSecret = entryKeyToConfigPointer(SM_ENTRY);
} else {
  // SM bundle may omit this key despite put success (IAM/CAS); keep plaintext so login works.
  cfg.ssoConfig.oauth.providers.Generic_OIDC.clientSecret = plain;
}
cfg.ssoConfig.oauth.providers.Generic_OIDC.tlsRelaxed = true;

await atomicWriteJSON(CONFIG_PATH, cfg, { backup: true });

const resolvedLen = smResolved.length || plain.length;
console.log(
  JSON.stringify({
    success: true,
    configPath: CONFIG_PATH,
    smEntry: SM_ENTRY,
    smResolvedLen: smResolved.length,
    storedPlaintextFallback: !smResolved,
    storedPointer: !!smResolved,
  }),
);
