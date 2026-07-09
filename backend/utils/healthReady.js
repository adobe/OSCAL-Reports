/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Readiness checks for ALB and deploy verification (SPA, config, secrets).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getSecretsManagerArn,
  getSecret,
  isAwsSmMode,
  isSecretsCacheLoaded,
  isSmPointer,
} from './secretsManager.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '..');
const PUBLIC_INDEX = path.join(BACKEND_ROOT, 'public', 'index.html');

const CONFIG_MIN_BYTES = 256;
const SSO_SECRET_KEYS = {
  okta: 'OSCAL/sso-oauth-okta-client-secret',
  Generic_OIDC: 'OSCAL/sso-oauth-generic-oidc-client-secret',
};

function configPath() {
  return (process.env.CONFIG_PATH || '/opt/oscal/data/config.json').trim();
}

function configShapeOk(parsed) {
  return parsed
    && typeof parsed === 'object'
    && (parsed.ssoConfig != null || parsed.messagingConfig != null || parsed.aiConfig != null);
}

function readConfigJson() {
  const file = configPath();
  if (!fs.existsSync(file)) {
    return { ok: false, reason: 'config_missing', file };
  }
  const stat = fs.statSync(file);
  if (stat.size < CONFIG_MIN_BYTES) {
    return { ok: false, reason: 'config_too_small', file, size: stat.size };
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { ok: false, reason: 'config_invalid_json', file };
  }
  if (!configShapeOk(parsed)) {
    return { ok: false, reason: 'config_invalid_shape', file };
  }
  return { ok: true, file, parsed };
}

function spaIndexOk() {
  if (!fs.existsSync(PUBLIC_INDEX)) {
    return { ok: false, reason: 'index_missing', path: PUBLIC_INDEX };
  }
  const size = fs.statSync(PUBLIC_INDEX).size;
  if (size <= 0) {
    return { ok: false, reason: 'index_empty', path: PUBLIC_INDEX };
  }
  return { ok: true, path: PUBLIC_INDEX, size };
}

function providerNeedsSecret(providerCfg) {
  return providerCfg?.enabled === true;
}

function secretPointerResolvable(providerCfg, smKey) {
  const secret = providerCfg?.clientSecret;
  if (typeof secret === 'string' && secret.trim() !== '') {
    return true;
  }
  if (isSmPointer(secret)) {
    if (!isAwsSmMode()) {
      return true;
    }
    const fromSm = getSecret(secret._sm || smKey);
    return Boolean(fromSm && fromSm.trim());
  }
  if (secret && typeof secret === 'object' && (secret._pass || secret._cfgenc)) {
    return true;
  }
  return false;
}

function secretsReady(config) {
  if (!isAwsSmMode()) {
    return { ok: true, skipped: true };
  }
  const arn = getSecretsManagerArn();
  if (!arn) {
    return { ok: false, reason: 'sm_arn_missing' };
  }
  if (!isSecretsCacheLoaded()) {
    return { ok: false, reason: 'sm_cache_not_loaded' };
  }
  const providers = config?.ssoConfig?.oauth?.providers || {};
  const missing = [];
  for (const [name, smKey] of Object.entries(SSO_SECRET_KEYS)) {
    const providerCfg = providers[name];
    if (!providerNeedsSecret(providerCfg)) {
      continue;
    }
    if (!secretPointerResolvable(providerCfg, smKey)) {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    return { ok: false, reason: 'sso_secrets_unresolved', providers: missing };
  }
  return { ok: true };
}

function isIamRoleBedrockMode(aiConfig) {
  const raw = (aiConfig?.bedrockAuthMode || '').trim().toLowerCase();
  return raw === 'iam-role' || raw === 'iam' || raw === 'role' || raw === 'assume-role';
}

/** Warn-only: cross-account Bedrock needs assume-role ARN or BEDROCK_ASSUME_ROLE_ARN env. */
function bedrockIamConfigured(config) {
  const ai = config?.aiConfig;
  if (!ai?.enabled || ai.provider !== 'aws-bedrock') {
    return { ok: true, skipped: true };
  }
  if (!isIamRoleBedrockMode(ai)) {
    return { ok: true, skipped: true };
  }
  const envArn = (process.env.BEDROCK_ASSUME_ROLE_ARN && String(process.env.BEDROCK_ASSUME_ROLE_ARN).trim()) || '';
  const configArn = (ai.bedrockAssumeRoleArn && String(ai.bedrockAssumeRoleArn).trim()) || '';
  if (envArn || configArn) {
    return { ok: true };
  }
  return { ok: false, reason: 'bedrock_assume_role_missing' };
}

/**
 * @returns {{ ready: boolean, checks: Record<string, unknown> }}
 */
export function evaluateReadiness() {
  const checks = {};
  const spa = spaIndexOk();
  checks.spa = spa;

  const configResult = readConfigJson();
  checks.config = configResult.ok
    ? { ok: true, file: configResult.file }
    : { ok: false, reason: configResult.reason, file: configResult.file };

  let secrets = { ok: true, skipped: true };
  let bedrock = { ok: true, skipped: true };
  if (configResult.ok) {
    secrets = secretsReady(configResult.parsed);
    bedrock = bedrockIamConfigured(configResult.parsed);
  } else if (isAwsSmMode()) {
    secrets = { ok: false, reason: 'config_unavailable_for_secrets_check' };
  }
  checks.secrets = secrets;
  checks.bedrock = bedrock;

  const ready = Boolean(spa.ok && configResult.ok && secrets.ok);
  return { ready, checks };
}
