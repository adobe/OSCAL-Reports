/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Scan config.json for plaintext or legacy _pass secrets; migrate to _sm (EC2) or _cfgenc (local/Docker).
 */
import fs from 'fs';
import {
  SENSITIVE_CONFIG_KEYS,
  getByPath,
  setByPath,
} from './sensitiveConfigKeys.js';
import {
  isCfgEncPointer,
  encryptConfigSecret,
  canResolveCfgEnc,
  decryptConfigSecret,
} from './configFieldCrypto.js';
import {
  isAwsSmMode,
  mergeAndPutBundle,
  reloadSecretsFromAws,
  entryKeyToConfigPointer,
  isSmPointer,
  ensureSmCacheReady,
} from './secretsManager.js';
import { isPassPointer, passShow } from './passResolver.js';
import { atomicWriteJSON } from './atomicWrite.js';

/**
 * @param {*} value
 * @returns {'plaintext'|'masked'|'empty'|'_sm'|'_pass'|'_cfgenc'|'other'}
 */
export function getSecretStorageShape(value) {
  if (value == null) return 'empty';
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return 'empty';
    if (t === '********') return 'masked';
    return 'plaintext';
  }
  if (isSmPointer(value)) return '_sm';
  if (isPassPointer(value)) return '_pass';
  if (isCfgEncPointer(value)) return '_cfgenc';
  return 'other';
}

/**
 * @param {string} keyPath
 * @param {Object} config
 * @returns {boolean}
 */
export function shouldSkipSecretMigration(keyPath, config) {
  if (keyPath === 'databaseConfig.password' && getByPath(config, 'databaseConfig.authMode') === 'iam') {
    return true;
  }
  const bedrockAuthMode = getByPath(config, 'aiConfig.bedrockAuthMode');
  if (
    (keyPath === 'aiConfig.awsAccessKeyId' || keyPath === 'aiConfig.awsSecretAccessKey') &&
    bedrockAuthMode === 'iam-role'
  ) {
    return true;
  }
  return false;
}

/**
 * Extract plaintext secret from stored value (string, _pass, _cfgenc).
 * Resolving a legacy _pass pointer requires the pass CLI and is opt-in via
 * allowPassResolution — only the standalone operator migration tools set it,
 * never the running server. Without it, _pass pointers are left untouched.
 * @param {*} value
 * @param {{ allowPassResolution?: boolean }} [options]
 * @returns {string|null}
 */
export function extractPlaintextSecret(value, options = {}) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t || t === '********') return null;
    return t;
  }
  if (isSmPointer(value)) return null;
  if (isPassPointer(value)) {
    if (!options.allowPassResolution) return null;
    const resolved = (passShow(value._pass) || '').trim();
    return resolved || null;
  }
  if (isCfgEncPointer(value)) {
    try {
      const plain = decryptConfigSecret(value).trim();
      return plain || null;
    } catch (_) {
      return null;
    }
  }
  return null;
}

/**
 * List sensitive paths that hold non-empty plaintext strings.
 * @param {Object} config
 * @returns {string[]}
 */
export function findPlaintextSecretPaths(config) {
  const paths = [];
  for (const { path: keyPath } of SENSITIVE_CONFIG_KEYS) {
    if (shouldSkipSecretMigration(keyPath, config)) continue;
    const value = getByPath(config, keyPath);
    if (getSecretStorageShape(value) === 'plaintext') {
      paths.push(keyPath);
    }
  }
  return paths;
}

/**
 * Migrate secrets in a mutable config clone. Does not write to disk.
 * @param {Object} config - mutable config object
 * @param {{ logger?: Function, allowPassResolution?: boolean }} [options]
 * @returns {Promise<{ changed: boolean, migrated: string[], errors: string[] }>}
 */
export async function migrateConfigSecretsInPlace(config, options = {}) {
  const log = options.logger || (() => {});
  const allowPassResolution = options.allowPassResolution === true;
  const migrated = [];
  const errors = [];
  let changed = false;

  if (isAwsSmMode()) {
    await ensureSmCacheReady();
  } else if (!canResolveCfgEnc()) {
    return {
      changed: false,
      migrated: [],
      errors: ['OSCAL_CONFIG_FIELD_SECRET or SESSION_SECRET required for _cfgenc migration in production'],
    };
  }

  const smPartial = {};
  const pendingSmPaths = [];

  for (const { path: keyPath, smEntry } of SENSITIVE_CONFIG_KEYS) {
    if (shouldSkipSecretMigration(keyPath, config)) {
      if (getByPath(config, keyPath) !== '') {
        setByPath(config, keyPath, '');
        changed = true;
      }
      continue;
    }

    const current = getByPath(config, keyPath);
    const shape = getSecretStorageShape(current);

    if (shape === '_sm' || shape === '_cfgenc' || shape === 'empty' || shape === 'masked') {
      continue;
    }

    const plain = extractPlaintextSecret(current, { allowPassResolution });
    if (!plain) {
      if (shape === '_pass' && allowPassResolution) {
        errors.push(`${keyPath}: _pass pointer could not be resolved (pass unavailable)`);
      }
      continue;
    }

    if (isAwsSmMode()) {
      smPartial[smEntry] = plain;
      pendingSmPaths.push({ keyPath, smEntry, prior: current });
      migrated.push(keyPath);
    } else {
      try {
        setByPath(config, keyPath, encryptConfigSecret(plain));
        migrated.push(keyPath);
        changed = true;
      } catch (err) {
        errors.push(`${keyPath}: encrypt failed (${err.message || 'unknown'})`);
      }
    }
  }

  if (isAwsSmMode() && Object.keys(smPartial).length > 0) {
    const put = await mergeAndPutBundle(smPartial);
    if (!put.success) {
      errors.push(`secrets_manager: ${put.error || 'put_failed'}`);
      return { changed: false, migrated: [], errors };
    }
    await reloadSecretsFromAws();
    for (const { keyPath, smEntry } of pendingSmPaths) {
      setByPath(config, keyPath, entryKeyToConfigPointer(smEntry));
    }
    changed = true;
    log('info', 'Migrated secrets to AWS Secrets Manager', {
      'event.action': 'config_secrets_migrated',
      'event.category': 'configuration',
      'secrets.count': Object.keys(smPartial).length,
      'secrets.mode': 'aws-sm',
    });
  } else if (migrated.length > 0) {
    log('info', 'Migrated secrets to _cfgenc', {
      'event.action': 'config_secrets_migrated',
      'event.category': 'configuration',
      'secrets.count': migrated.length,
      'secrets.mode': 'cfgenc',
    });
  }

  return { changed, migrated, errors };
}

/**
 * Load config from path, migrate if needed, atomic write when changed.
 * @param {string} configPath
 * @param {{ logger?: Function, refusePlaintext?: boolean, allowPassResolution?: boolean }} [options]
 * @returns {Promise<{ ok: boolean, migrated: string[], errors: string[], plaintextPaths: string[] }>}
 */
export async function ensureConfigSecretsProtected(configPath, options = {}) {
  const log = options.logger || (() => {});
  const allowPassResolution = options.allowPassResolution === true;

  if (!configPath || !fs.existsSync(configPath)) {
    return { ok: true, migrated: [], errors: [], plaintextPaths: [] };
  }

  let stat;
  try {
    stat = fs.statSync(configPath);
  } catch (_) {
    return { ok: true, migrated: [], errors: [], plaintextPaths: [] };
  }

  if (stat.size < 256) {
    return { ok: true, migrated: [], errors: [], plaintextPaths: [] };
  }

  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const plaintextBefore = findPlaintextSecretPaths(raw);

  // Legacy _pass pointers only trigger migration when pass resolution is
  // explicitly enabled (operator CLI tools). The running server leaves them
  // untouched — pass is no longer a runtime dependency.
  const hasPassToMigrate = allowPassResolution && SENSITIVE_CONFIG_KEYS.some(({ path: p }) => {
    const v = getByPath(raw, p);
    return getSecretStorageShape(v) === '_pass';
  });

  if (plaintextBefore.length === 0 && !hasPassToMigrate) {
    return { ok: true, migrated: [], errors: [], plaintextPaths: [] };
  }

  const clone = JSON.parse(JSON.stringify(raw));
  const { changed, migrated, errors } = await migrateConfigSecretsInPlace(clone, {
    logger: log,
    allowPassResolution,
  });

  if (errors.length > 0 && options.refusePlaintext) {
    log('error', 'Config contains plaintext secrets that could not be migrated', {
      'event.action': 'secrets_plaintext_detected',
      'event.category': 'security',
      'event.outcome': 'failure',
      'secrets.error_count': errors.length,
    });
    return { ok: false, migrated, errors, plaintextPaths: findPlaintextSecretPaths(raw) };
  }

  if (changed) {
    await atomicWriteJSON(configPath, clone, { backup: true });
  }

  const plaintextAfter = findPlaintextSecretPaths(changed ? clone : raw);
  const ok = plaintextAfter.length === 0 || !options.refusePlaintext;

  if (!ok) {
    log('error', 'Plaintext secrets remain after migration attempt', {
      'event.action': 'secrets_plaintext_detected',
      'event.category': 'security',
      'event.outcome': 'failure',
      'secrets.plaintext_paths': plaintextAfter.length,
    });
  }

  return { ok, migrated, errors, plaintextPaths: plaintextAfter };
}

/**
 * Validate config object has no plaintext sensitive values (for S3 upload guard).
 * @param {Object} config
 * @returns {{ ok: boolean, paths: string[] }}
 */
export function validateConfigSecretsProtected(config) {
  const paths = findPlaintextSecretPaths(config);
  return { ok: paths.length === 0, paths };
}
