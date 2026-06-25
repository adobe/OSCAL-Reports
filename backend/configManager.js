/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { atomicWriteJSON } from './utils/atomicWrite.js';
import { resolvePassPointers, passShow, isPassPointer } from './utils/passResolver.js';
import { mergePassBundlePartial } from './utils/passBundle.js';
import {
  isAwsSmMode,
  isSmPointer,
  entryKeyToConfigPointer,
  mergeAndPutBundle,
  reloadSecretsFromAws,
  ensureSmCacheReady,
  resolveSmPointers,
  isSecretCached,
  getSecret,
} from './utils/secretsManager.js';
import {
  SENSITIVE_CONFIG_KEYS,
  getByPath,
  setByPath,
  isMaskedOrEmpty,
  isSecretPointer,
} from './utils/sensitiveConfigKeys.js';
import { applyDefaultOidcGroupMappingsToConfig, mergeDefaultOidcGroupToRoleMapping } from './utils/defaultOidcGroupRoleMapping.js';
import { resolveCfgEncPointers, isCfgEncPointer, decryptConfigSecret } from './utils/configFieldCrypto.js';
import { DEFAULT_GENERIC_OIDC_REDIRECT_PATTERNS } from './auth/genericOidc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Config file path priority:
// 1. CONFIG_PATH env (always wins when set — saves go here even if file missing yet)
// 2. /data/config.json (Docker volume)
// 3. Same directory as USERS_PATH (pair config + users in one folder, e.g. OSCAL_Reports_data)
// 4. OSCAL_DATA_DIR/config.json
// 5. Repo sibling OSCAL_Reports_data/config.json (local dev convention next to OSCAL_Reports)
// 6. config/app/config.json (repo canonical)
// 7. Default /data/config.json
const VOLUME_CONFIG_FILE = '/data/config.json';
const CONFIG_DIR = path.join(__dirname, '..', 'config', 'app');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const REPO_ROOT = path.join(__dirname, '..');
const SIBLING_DATA_DIR = path.join(REPO_ROOT, '..', 'OSCAL_Reports_data');

function resolveExistingDir(p) {
  try {
    if (p && fs.existsSync(p) && fs.statSync(p).isDirectory()) return path.resolve(p);
  } catch (_) {}
  return null;
}

/**
 * Get the config file path based on priority
 * @returns {string} - Path to config file
 */
function getConfigPath() {
  // 1. CONFIG_PATH — use whenever set so reads/writes stay in one place
  const envConfig = (process.env.CONFIG_PATH || '').trim();
  if (envConfig) {
    return path.resolve(envConfig);
  }

  // 2. Docker volume
  if (fs.existsSync(VOLUME_CONFIG_FILE)) {
    return VOLUME_CONFIG_FILE;
  }

  // 3. Same folder as USERS_PATH (e.g. .../OSCAL_Reports_data/users.json -> .../config.json)
  const envUsers = (process.env.USERS_PATH || '').trim();
  if (envUsers) {
    const usersDir = path.dirname(path.resolve(envUsers));
    if (resolveExistingDir(usersDir)) {
      return path.join(usersDir, 'config.json');
    }
  }

  // 4. OSCAL_DATA_DIR
  const envDataDir = (process.env.OSCAL_DATA_DIR || '').trim();
  if (envDataDir) {
    const dir = resolveExistingDir(envDataDir) || envDataDir;
    return path.join(path.resolve(dir), 'config.json');
  }

  // 5. Sibling OSCAL_Reports_data (config.json or users.json present => use that dir for both)
  if (resolveExistingDir(SIBLING_DATA_DIR)) {
    const cfg = path.join(SIBLING_DATA_DIR, 'config.json');
    const usr = path.join(SIBLING_DATA_DIR, 'users.json');
    if (fs.existsSync(cfg) || fs.existsSync(usr)) {
      return cfg; // saveConfig/loadConfig will create cfg if missing
    }
  }

  // 6. Repo config/app
  if (fs.existsSync(CONFIG_FILE)) {
    return CONFIG_FILE;
  }

  // 7. Default volume path
  return VOLUME_CONFIG_FILE;
}

// Default configuration
const DEFAULT_CONFIG = {
  apiGateways: {
    aws: {
      enabled: false,
      url: '',
      region: 'ap-southeast-2'
    },
    azure: {
      enabled: false,
      url: ''
    }
  },
  publishedSoaUrl: '',
  messagingConfig: {
    enabled: false,
    channel: 'email', // 'email' or 'slack'
    email: {
      enabled: false,
      smtpHost: '',
      smtpPort: 587,
      smtpSecure: false, // true for 465, false for other ports
      smtpUser: '',
      smtpPassword: '',
      fromEmail: '',
      fromName: 'OSCAL Report Generator',
      loginUrl: ''
    },
    slack: {
      enabled: false,
      webhookUrl: '',
      channel: '#general'
    }
  },
  aiConfig: {
    enabled: false,
    url: '',
    apiToken: '',
    model: 'mistral:7b',
    timeout: 180000, // 180 seconds (3 minutes) to allow for model loading and processing
    organizationName: 'Adobe', // Default organization name
    extensiveLogging: false,    // When true, append AI telemetry to logs/ (e.g. ai-telemetry-*.jsonl)
    allowedUsersForAI: '',      // Comma-separated patterns for Get Suggestions (mistral-api/aws-bedrock only), max 5, e.g. *@adobe.com, mkesharw
    bedrockAuthMode: 'access-keys', // 'access-keys' | 'iam-role' (instance profile / STS assume role)
    bedrockAssumeRoleArn: '',
    bedrockExternalId: '',
    maxTokens: {
      connectionTest: 10,        // Minimal response for testing connectivity
      controlGeneration: 150,    // Short responses for control implementations (~250 chars)
      general: 512               // Standard responses for general operations
    }
  },
  databaseConfig: {
    enabled: false,
    host: '',
    port: 5432,
    database: '',
    user: '',
    password: '',
    authMode: 'password', // 'password' | 'iam' (RDS IAM DB authentication; token from instance/task role)
    sslMode: 'disable', // 'disable' | 'prefer' | 'require'
    connectionTimeout: 10000     // 10 seconds
  },
  ssoConfig: {
    oauth: {
      enabled: true,
      jitProvisioning: true,
      jitDefaultRole: 'User',
      syncRoleFromGroups: true,
      groupToRoleMapping: {
        Assessor: 'Assessor',
        'Platform Admin': 'Platform Admin',
      },
      providers: {
        Generic_OIDC: {
          enabled: true,
          displayName: 'Generic SSO',
          issuerUrl: 'https://sso.keekar.au/application/o/oscal-report-generator/',
          discoveryUrl:
            'https://sso.keekar.au/application/o/oscal-report-generator/.well-known/openid-configuration',
          clientId: 'oscal-report-generator',
          clientSecret: '',
          callbackPath: '/auth/callback',
          scope: 'openid profile email',
          endSessionUrl: 'https://sso.keekar.au/application/o/oscal-report-generator/end-session/',
          redirectUriPatterns: DEFAULT_GENERIC_OIDC_REDIRECT_PATTERNS,
          tlsRelaxed: true,
        },
        okta: {
          enabled: false,
        },
      },
    },
  },
  lastModified: new Date().toISOString(),
  version: '1.0.0'
};

/**
 * Load configuration from file (raw: _pass pointers are not resolved).
 * Creates default config if file doesn't exist.
 */
function loadConfig() {
  try {
    const configPath = getConfigPath();
    
    // Ensure parent directory exists
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    // Check if config file exists
    if (!fs.existsSync(configPath)) {
      console.log(`📝 Config file not found at ${configPath}, creating default configuration...`);
      saveConfig(DEFAULT_CONFIG);
      return DEFAULT_CONFIG;
    }

    const data = fs.readFileSync(configPath, 'utf8');
    const loaded = JSON.parse(data);
    // Merge with defaults so new keys (e.g. aiConfig.allowedUsersForAI) exist when missing from file
    const loadedOauth = loaded.ssoConfig?.oauth || {};
    const loadedProviders = loadedOauth.providers && typeof loadedOauth.providers === 'object' ? loadedOauth.providers : {};
    const config = {
      ...DEFAULT_CONFIG,
      ...loaded,
      aiConfig: { ...DEFAULT_CONFIG.aiConfig, ...(loaded.aiConfig || {}) },
      databaseConfig: { ...DEFAULT_CONFIG.databaseConfig, ...(loaded.databaseConfig || {}) },
      ssoConfig: {
        ...DEFAULT_CONFIG.ssoConfig,
        ...(loaded.ssoConfig || {}),
        oauth: {
          ...DEFAULT_CONFIG.ssoConfig.oauth,
          ...loadedOauth,
          groupToRoleMapping: mergeDefaultOidcGroupToRoleMapping(loadedOauth.groupToRoleMapping),
          providers: {
            ...DEFAULT_CONFIG.ssoConfig.oauth.providers,
            ...loadedProviders,
            Generic_OIDC: {
              ...DEFAULT_CONFIG.ssoConfig.oauth.providers.Generic_OIDC,
              ...(loadedProviders.Generic_OIDC || {}),
            },
          },
        },
      },
    };
    applyDefaultOidcGroupMappingsToConfig(config);
    console.log(`✅ Configuration loaded successfully from ${configPath}`);
    return config;
  } catch (error) {
    console.error('❌ Error loading configuration:', error.message);
    console.log('🔄 Returning default configuration');
    return DEFAULT_CONFIG;
  }
}

/**
 * Merge process env OSCAL_DATABASE_* over databaseConfig (Terraform EC2 / container injection).
 * IAM mode clears static password so connections use RDS Signer only.
 * @param {Object} config - Mutable config object (e.g. clone of loaded config)
 */
export function applyDatabaseEnvOverrides(config) {
  if (!config?.databaseConfig) return;
  const db = config.databaseConfig;
  if (process.env.OSCAL_DATABASE_AUTH === 'iam' || process.env.OSCAL_DATABASE_IAM === '1') {
    db.authMode = 'iam';
    db.password = '';
    // IAM to RDS requires TLS; avoid "no pg_hba.conf entry ... no encryption" if config.json still has sslMode disable.
    if (!db.sslMode || db.sslMode === 'disable') {
      db.sslMode = 'require';
    }
  }
  if (process.env.OSCAL_DATABASE_HOST && String(process.env.OSCAL_DATABASE_HOST).trim()) {
    db.host = String(process.env.OSCAL_DATABASE_HOST).trim();
  }
  if (process.env.OSCAL_DATABASE_PORT && String(process.env.OSCAL_DATABASE_PORT).trim()) {
    const p = parseInt(String(process.env.OSCAL_DATABASE_PORT).trim(), 10);
    if (!Number.isNaN(p)) db.port = p;
  }
  if (process.env.OSCAL_DATABASE_NAME && String(process.env.OSCAL_DATABASE_NAME).trim()) {
    db.database = String(process.env.OSCAL_DATABASE_NAME).trim();
  }
  if (process.env.OSCAL_DATABASE_USER && String(process.env.OSCAL_DATABASE_USER).trim()) {
    db.user = String(process.env.OSCAL_DATABASE_USER).trim();
  }
  if (process.env.OSCAL_DATABASE_SSL === 'require') {
    db.sslMode = 'require';
  }
  if (process.env.OSCAL_DATABASE_ENABLED === '1') {
    db.enabled = true;
  }
}

/**
 * Effective databaseConfig for POST /api/database/test-connection when the client sends
 * the current Platform Settings form. Does not apply OSCAL_DATABASE_AUTH=iam from the
 * environment, so admins can test the RDS admin user (e.g. oscalmaster) and password.
 * Terraform OSCAL_DATABASE_HOST / PORT / NAME / SSL / ENABLED still fill blanks only.
 *
 * @param {Object|null|undefined} formDatabaseConfig - Fields from the UI (same shape as databaseConfig)
 * @returns {Object}
 */
function getResolvedDatabaseConfigForTest(formDatabaseConfig) {
  const raw = loadConfig();
  const clone = JSON.parse(JSON.stringify(raw));
  resolveSecretsInConfig(clone);
  const base = { ...DEFAULT_CONFIG.databaseConfig, ...(clone.databaseConfig || {}) };
  const f = formDatabaseConfig && typeof formDatabaseConfig === 'object' ? formDatabaseConfig : {};

  const db = { ...base };

  if (f.enabled === true || f.enabled === false) db.enabled = f.enabled;
  if (f.host !== undefined && String(f.host).trim()) db.host = String(f.host).trim();
  if (f.port !== undefined && f.port !== null && f.port !== '') {
    const pn = Number(f.port);
    if (!Number.isNaN(pn)) db.port = pn;
  }
  if (f.database !== undefined && String(f.database).trim()) db.database = String(f.database).trim();
  if (f.user !== undefined) db.user = String(f.user || '').trim();
  if (f.authMode === 'iam' || f.authMode === 'password') db.authMode = f.authMode;
  if (f.sslMode === 'disable' || f.sslMode === 'prefer' || f.sslMode === 'require') db.sslMode = f.sslMode;
  if (f.connectionTimeout !== undefined) {
    const t = parseInt(String(f.connectionTimeout), 10);
    if (!Number.isNaN(t)) db.connectionTimeout = t;
  }
  if (typeof f.password === 'string' && f.password.trim() !== '' && f.password.trim() !== '********') {
    db.password = f.password.trim();
  }

  if ((!db.host || !String(db.host).trim()) && process.env.OSCAL_DATABASE_HOST?.trim()) {
    db.host = String(process.env.OSCAL_DATABASE_HOST).trim();
  }
  if (process.env.OSCAL_DATABASE_PORT?.trim()) {
    const p = parseInt(String(process.env.OSCAL_DATABASE_PORT).trim(), 10);
    if (!Number.isNaN(p) && (!db.port || Number.isNaN(Number(db.port)))) db.port = p;
  }
  if ((!db.database || !String(db.database).trim()) && process.env.OSCAL_DATABASE_NAME?.trim()) {
    db.database = String(process.env.OSCAL_DATABASE_NAME).trim();
  }
  if ((!db.user || !String(db.user).trim()) && process.env.OSCAL_DATABASE_USER?.trim()) {
    db.user = String(process.env.OSCAL_DATABASE_USER).trim();
  }
  if (process.env.OSCAL_DATABASE_SSL === 'require') {
    if (!db.sslMode || db.sslMode === 'disable') db.sslMode = 'require';
  }
  if (process.env.OSCAL_DATABASE_ENABLED === '1') {
    db.enabled = true;
  }

  if (db.authMode === 'iam' && (!db.sslMode || db.sslMode === 'disable')) {
    db.sslMode = 'require';
  }

  return db;
}

/**
 * Merge Bedrock IAM / assume-role settings from process env (Terraform systemd on EC2).
 * @param {Object} config - Mutable config object
 */
export function applyBedrockEnvOverrides(config) {
  if (!config?.aiConfig) return;
  const ai = config.aiConfig;
  const roleArn = process.env.BEDROCK_ASSUME_ROLE_ARN && String(process.env.BEDROCK_ASSUME_ROLE_ARN).trim();
  if (roleArn) {
    ai.bedrockAuthMode = 'iam-role';
    ai.bedrockAssumeRoleArn = roleArn;
  }
  const externalId = process.env.BEDROCK_EXTERNAL_ID && String(process.env.BEDROCK_EXTERNAL_ID).trim();
  if (externalId) {
    ai.bedrockExternalId = externalId;
  }
}

/**
 * Resolve secret pointers in a mutable config clone (pass and/or SM per mode).
 * @param {Object} clone
 */
function resolveSecretsInConfig(clone) {
  resolveCfgEncPointers(clone);
  if (isAwsSmMode()) {
    resolveSmPointers(clone);
    resolvePassPointers(clone);
  } else {
    resolvePassPointers(clone);
    resolveSmPointers(clone);
  }
}

/**
 * Load config and resolve all secret pointers (for server-side use only).
 * Returns a deep clone with secrets resolved; do not send to client.
 */
async function getResolvedConfigAsync() {
  const raw = loadConfig();
  const clone = JSON.parse(JSON.stringify(raw));
  if (isAwsSmMode()) {
    await ensureSmCacheReady();
  }
  resolveSecretsInConfig(clone);
  applyDatabaseEnvOverrides(clone);
  applyBedrockEnvOverrides(clone);
  return clone;
}

function getResolvedConfig() {
  const raw = loadConfig();
  const clone = JSON.parse(JSON.stringify(raw));
  resolveSecretsInConfig(clone);
  applyDatabaseEnvOverrides(clone);
  applyBedrockEnvOverrides(clone);
  return clone;
}

function shouldSkipSensitiveKey(keyPath, configToSave) {
  if (keyPath === 'databaseConfig.password' && getByPath(configToSave, 'databaseConfig.authMode') === 'iam') {
    return true;
  }
  const bedrockAuthMode = getByPath(configToSave, 'aiConfig.bedrockAuthMode');
  if (
    (keyPath === 'aiConfig.awsAccessKeyId' || keyPath === 'aiConfig.awsSecretAccessKey') &&
    bedrockAuthMode === 'iam-role'
  ) {
    return true;
  }
  return false;
}

function pointerFromExisting(existing, smEntry, passEntry) {
  if (existing === undefined || existing === null) {
    return isAwsSmMode() ? entryKeyToConfigPointer(smEntry) : { _pass: passEntry };
  }
  if (isSmPointer(existing)) return existing;
  if (existing && typeof existing === 'object' && existing._pass) {
    return isAwsSmMode() ? entryKeyToConfigPointer(smEntry) : existing;
  }
  return existing;
}

/**
 * Prepare config for save: secrets go to AWS SM (EC2) or pass/config (local).
 * @returns {{ config: Object, passErrors: string[], smErrors: string[] }}
 */
async function prepareConfigForSave(configToSave, existingRaw) {
  const result = JSON.parse(JSON.stringify(configToSave));
  const passErrors = [];
  const smErrors = [];
  const smPartial = {};
  const passPartial = {};

  for (const { path: keyPath, smEntry, passEntry } of SENSITIVE_CONFIG_KEYS) {
    if (shouldSkipSensitiveKey(keyPath, configToSave)) {
      setByPath(result, keyPath, '');
      continue;
    }
    const incoming = getByPath(configToSave, keyPath);
    const existing = getByPath(existingRaw, keyPath);

    if (isMaskedOrEmpty(incoming)) {
      const pointer = pointerFromExisting(existing, smEntry, passEntry);
      if (isAwsSmMode() && !isSecretCached(smEntry)) {
        if (isPassPointer(existing)) {
          const fromPass = passShow(existing._pass) || '';
          if (fromPass.trim()) smPartial[smEntry] = fromPass.trim();
        } else if (typeof existing === 'string' && !isMaskedOrEmpty(existing)) {
          smPartial[smEntry] = existing.trim();
        }
      }
      setByPath(result, keyPath, pointer);
      continue;
    }

    if (typeof incoming === 'string' && incoming.trim() !== '') {
      const trimmed = incoming.trim();
      if (isAwsSmMode()) {
        smPartial[smEntry] = trimmed;
        setByPath(result, keyPath, entryKeyToConfigPointer(smEntry));
      } else {
        passPartial[passEntry] = trimmed;
        setByPath(result, keyPath, { _pass: passEntry });
      }
      continue;
    }

    if (isSecretPointer(incoming)) {
      setByPath(result, keyPath, pointerFromExisting(incoming, smEntry, passEntry));
    }
  }

  migrateGenericOidcSecretForAwsSm(result, configToSave, existingRaw, smPartial);

  if (!isAwsSmMode() && Object.keys(passPartial).length > 0) {
    const bundleResult = mergePassBundlePartial(passPartial);
    if (!bundleResult.success) {
      for (const [passEntry, secretVal] of Object.entries(passPartial)) {
        const keyDef = SENSITIVE_CONFIG_KEYS.find((k) => k.passEntry === passEntry);
        if (keyDef && secretVal != null && String(secretVal).trim() !== '') {
          setByPath(result, keyDef.path, String(secretVal).trim());
          passErrors.push(`${keyDef.path}: pass bundle unavailable (${bundleResult.error}); secret stored in config`);
        }
      }
    }
  }

  if (isAwsSmMode() && Object.keys(smPartial).length > 0) {
    const putResult = await mergeAndPutBundle(smPartial);
    if (!putResult.success) {
      smErrors.push(`secrets_manager: ${putResult.error || 'put_failed'}`);
      for (const [entryKey, secretVal] of Object.entries(smPartial)) {
        const keyDef = SENSITIVE_CONFIG_KEYS.find((k) => k.smEntry === entryKey);
        if (keyDef && secretVal != null && String(secretVal).trim() !== '') {
          setByPath(result, keyDef.path, String(secretVal).trim());
        }
      }
    } else {
      await reloadSecretsFromAws();
    }
  }

  preserveGenericOidcClientSecretOnSave(result, configToSave, existingRaw);

  return { config: result, passErrors, smErrors };
}

const GENERIC_OIDC_SECRET_PATH = 'ssoConfig.oauth.providers.Generic_OIDC.clientSecret';
const GENERIC_OIDC_SM_ENTRY = 'OSCAL/sso-oauth-generic-oidc-client-secret';

function tryDecryptCfgEncSecret(value) {
  if (!isCfgEncPointer(value)) return '';
  try {
    return decryptConfigSecret(value).trim();
  } catch (_) {
    return '';
  }
}

/**
 * On EC2 (aws-sm), migrate Generic_OIDC secret from _cfgenc / plaintext into SM bundle.
 * @param {Object} result
 * @param {Object} configToSave
 * @param {Object} existingRaw
 * @param {Record<string, string>} smPartial
 */
function migrateGenericOidcSecretForAwsSm(result, configToSave, existingRaw, smPartial) {
  if (!isAwsSmMode()) return;
  const incoming = getByPath(configToSave, GENERIC_OIDC_SECRET_PATH);
  const existing = getByPath(existingRaw, GENERIC_OIDC_SECRET_PATH);
  const current = getByPath(result, GENERIC_OIDC_SECRET_PATH);
  let plain = '';
  if (typeof incoming === 'string' && !isMaskedOrEmpty(incoming)) {
    plain = incoming.trim();
  } else {
    plain = tryDecryptCfgEncSecret(incoming)
      || tryDecryptCfgEncSecret(existing)
      || tryDecryptCfgEncSecret(current);
  }
  if (plain && !Object.prototype.hasOwnProperty.call(smPartial, GENERIC_OIDC_SM_ENTRY)) {
    smPartial[GENERIC_OIDC_SM_ENTRY] = plain;
  }
  const cachedSecret = (getSecret(GENERIC_OIDC_SM_ENTRY) || '').trim();
  const willHaveInSm =
    !!plain
    || !!cachedSecret
    || Object.prototype.hasOwnProperty.call(smPartial, GENERIC_OIDC_SM_ENTRY);
  if (willHaveInSm) {
    setByPath(result, GENERIC_OIDC_SECRET_PATH, entryKeyToConfigPointer(GENERIC_OIDC_SM_ENTRY));
    return;
  }
  // Orphan _sm pointer (SM empty) breaks login-providers — keep resolvable plaintext/_cfgenc.
  if (isSmPointer(current) || isSmPointer(incoming)) {
    if (typeof existing === 'string' && !isMaskedOrEmpty(existing)) {
      setByPath(result, GENERIC_OIDC_SECRET_PATH, existing.trim());
    } else if (isCfgEncPointer(existing)) {
      setByPath(result, GENERIC_OIDC_SECRET_PATH, existing);
    } else if (typeof current === 'string' && !isMaskedOrEmpty(current)) {
      setByPath(result, GENERIC_OIDC_SECRET_PATH, current.trim());
    }
  }
}

/**
 * Generic_OIDC client secret uses _cfgenc in local/config mode; preserve on masked UI saves.
 * @param {Object} result
 * @param {Object} configToSave
 * @param {Object} existingRaw
 */
function preserveGenericOidcClientSecretOnSave(result, configToSave, existingRaw) {
  if (isAwsSmMode()) return;
  const incoming = getByPath(configToSave, GENERIC_OIDC_SECRET_PATH);
  const existing = getByPath(existingRaw, GENERIC_OIDC_SECRET_PATH);
  if (isMaskedOrEmpty(incoming) && (isCfgEncPointer(existing) || (typeof existing === 'string' && existing.trim()))) {
    setByPath(result, GENERIC_OIDC_SECRET_PATH, existing);
    return;
  }
  if (isCfgEncPointer(incoming)) {
    setByPath(result, GENERIC_OIDC_SECRET_PATH, incoming);
  }
}

function prepareConfigWithPassPointers(configToSave, existingRaw) {
  if (isAwsSmMode()) {
    throw new Error('prepareConfigWithPassPointers is sync; use prepareConfigForSave in aws-sm mode');
  }
  const result = JSON.parse(JSON.stringify(configToSave));
  const passErrors = [];
  const passPartial = {};
  for (const { path: keyPath, passEntry } of SENSITIVE_CONFIG_KEYS) {
    if (shouldSkipSensitiveKey(keyPath, configToSave)) {
      setByPath(result, keyPath, '');
      continue;
    }
    const incoming = getByPath(configToSave, keyPath);
    if (isMaskedOrEmpty(incoming)) {
      const existing = getByPath(existingRaw, keyPath);
      setByPath(result, keyPath, existing !== undefined ? existing : { _pass: passEntry });
    } else if (typeof incoming === 'string' && incoming.trim() !== '') {
      passPartial[passEntry] = incoming.trim();
      setByPath(result, keyPath, { _pass: passEntry });
    }
  }
  if (Object.keys(passPartial).length > 0) {
    const bundleResult = mergePassBundlePartial(passPartial);
    if (!bundleResult.success) {
      for (const [passEntry, secretVal] of Object.entries(passPartial)) {
        const keyDef = SENSITIVE_CONFIG_KEYS.find((k) => k.passEntry === passEntry);
        if (keyDef) {
          setByPath(result, keyDef.path, secretVal);
          passErrors.push(`${keyDef.path}: pass bundle unavailable (${bundleResult.error}); secret stored in config`);
        }
      }
    }
  }
  return { config: result, passErrors };
}

/**
 * Save configuration to file
 * 
 * Uses atomic write operations to prevent config corruption on crashes.
 * Returns verification object with save status and disk verification.
 */
async function saveConfig(config) {
  try {
    const configPath = getConfigPath();
    
    // Ensure parent directory exists
    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    
    // Ensure all required fields are present (merge with defaults)
    const configToSave = {
      ...DEFAULT_CONFIG,
      ...config,
      // Ensure apiGateways structure is complete
      apiGateways: {
        ...DEFAULT_CONFIG.apiGateways,
        ...config.apiGateways,
        aws: {
          ...DEFAULT_CONFIG.apiGateways.aws,
          ...config.apiGateways?.aws
        },
        azure: {
          ...DEFAULT_CONFIG.apiGateways.azure,
          ...config.apiGateways?.azure
        }
      },
      // Ensure messagingConfig structure is complete
      messagingConfig: {
        ...DEFAULT_CONFIG.messagingConfig,
        ...config.messagingConfig,
        email: {
          ...DEFAULT_CONFIG.messagingConfig.email,
          ...config.messagingConfig?.email
        },
        slack: {
          ...DEFAULT_CONFIG.messagingConfig.slack,
          ...config.messagingConfig?.slack
        }
      },
      // Ensure aiConfig structure is complete
      aiConfig: {
        ...DEFAULT_CONFIG.aiConfig,
        ...config.aiConfig,
        maxTokens: {
          ...DEFAULT_CONFIG.aiConfig.maxTokens,
          ...config.aiConfig?.maxTokens
        }
      },
      // Ensure databaseConfig structure is complete
      databaseConfig: {
        ...DEFAULT_CONFIG.databaseConfig,
        ...config.databaseConfig
      },
      // Explicitly preserve publishedSoaUrl (even if empty string)
      publishedSoaUrl: config.publishedSoaUrl !== undefined 
        ? config.publishedSoaUrl 
        : DEFAULT_CONFIG.publishedSoaUrl
    };
    
    // Add metadata
    const saveTimestamp = new Date().toISOString();
    configToSave.lastModified = saveTimestamp;
    
    // Preserve version if it exists
    if (config.version) {
      configToSave.version = config.version;
    }
    
    console.log('💾 Saving config - publishedSoaUrl:', configToSave.publishedSoaUrl);
    console.log(`💾 Saving config to: ${configPath}`);
    
    // Write to file with atomic operations (crash-resistant)
    // Creates backup automatically and uses temp file + rename pattern
    await atomicWriteJSON(configPath, configToSave, { backup: true });
    
    console.log('✅ Configuration saved successfully (atomic write)');
    
    // DISK VERIFICATION: Read back from disk to ensure save was successful
    console.log('🔍 Verifying config was written to disk...');
    const verifiedConfig = verifyConfigOnDisk(configPath, configToSave);
    
    if (verifiedConfig.success) {
      console.log('✅ Disk verification successful - config matches what was saved');
      return {
        success: true,
        verified: true,
        timestamp: saveTimestamp,
        configPath: configPath,
        message: 'Configuration saved and verified on disk'
      };
    } else {
      console.warn('⚠️ Disk verification found discrepancies:', verifiedConfig.discrepancies);
      return {
        success: true,
        verified: false,
        timestamp: saveTimestamp,
        configPath: configPath,
        discrepancies: verifiedConfig.discrepancies,
        message: 'Configuration saved but verification found discrepancies'
      };
    }
  } catch (error) {
    console.error('❌ Error saving configuration:', error.message);
    return {
      success: false,
      verified: false,
      error: error.message,
      message: 'Failed to save configuration'
    };
  }
}

/**
 * Verify that config on disk matches what was intended to be saved
 * Reads back from disk and compares critical fields
 */
function verifyConfigOnDisk(configPath, expectedConfig) {
  try {
    if (!fs.existsSync(configPath)) {
      return {
        success: false,
        discrepancies: ['Config file does not exist on disk']
      };
    }
    
    const diskData = fs.readFileSync(configPath, 'utf8');
    const diskConfig = JSON.parse(diskData);
    const discrepancies = [];
    
    // Verify critical email settings
    if (expectedConfig.messagingConfig?.email) {
      const expected = expectedConfig.messagingConfig.email;
      const actual = diskConfig.messagingConfig?.email || {};
      
      if (expected.enabled !== actual.enabled) {
        discrepancies.push('email.enabled mismatch');
      }
      if (expected.smtpHost !== actual.smtpHost) {
        discrepancies.push('email.smtpHost mismatch');
      }
      if (expected.smtpPort !== actual.smtpPort) {
        discrepancies.push('email.smtpPort mismatch');
      }
      if (expected.smtpUser !== actual.smtpUser) {
        discrepancies.push('email.smtpUser mismatch');
      }
    }
    
    // Verify critical AI settings
    if (expectedConfig.aiConfig) {
      const expected = expectedConfig.aiConfig;
      const actual = diskConfig.aiConfig || {};
      
      if (expected.enabled !== actual.enabled) {
        discrepancies.push('aiConfig.enabled mismatch');
      }
      if (expected.url !== actual.url) {
        discrepancies.push('aiConfig.url mismatch');
      }
    }
    
    // Verify publishedSoaUrl
    if (expectedConfig.publishedSoaUrl !== diskConfig.publishedSoaUrl) {
      discrepancies.push('publishedSoaUrl mismatch');
    }
    
    return {
      success: discrepancies.length === 0,
      discrepancies: discrepancies.length > 0 ? discrepancies : undefined
    };
  } catch (error) {
    return {
      success: false,
      discrepancies: [`Verification error: ${error.message}`]
    };
  }
}

/**
 * Update specific configuration section
 */
async function updateConfig(updates) {
  try {
    const currentConfig = loadConfig();
    const newConfig = {
      ...currentConfig,
      ...updates
    };
    
    return await saveConfig(newConfig);
  } catch (error) {
    console.error('❌ Error updating configuration:', error.message);
    return false;
  }
}

/**
 * Get specific configuration value
 */
function getConfigValue(key) {
  const config = loadConfig();
  return config[key];
}

/**
 * Reset configuration to defaults
 */
async function resetConfig() {
  console.log('🔄 Resetting configuration to defaults...');
  return await saveConfig(DEFAULT_CONFIG);
}

/**
 * Validate configuration structure
 */
function validateConfig(config) {
  const errors = [];
  
  // Validate AWS gateway URL if enabled
  if (config.apiGateways?.aws?.enabled && config.apiGateways.aws.url) {
    try {
      new URL(config.apiGateways.aws.url);
    } catch (e) {
      errors.push('Invalid AWS API Gateway URL');
    }
  }
  
  // Validate Azure gateway URL if enabled
  if (config.apiGateways?.azure?.enabled && config.apiGateways.azure.url) {
    try {
      new URL(config.apiGateways.azure.url);
    } catch (e) {
      errors.push('Invalid Azure API Gateway URL');
    }
  }
  
  // Validate Published SOA URL if provided (allow internal /api/published-soa/ path or external URL)
  if (config.publishedSoaUrl && config.publishedSoaUrl.trim() !== '') {
    const url = config.publishedSoaUrl.trim();
    if (url.startsWith('/api/published-soa/')) {
      // Internal stored file path – no URL parse needed
    } else {
      try {
        new URL(url);
      } catch (e) {
        errors.push('Invalid Published SOA/CCM URL');
      }
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get configuration directory (parent of config.json). Used for published-soa storage etc.
 */
function getConfigDir() {
  return path.dirname(getConfigPath());
}

/**
 * Get configuration file path (for backup/restore)
 */
function getConfigFilePath() {
  return getConfigPath();
}

/**
 * Check if config file exists
 */
function configExists() {
  const configPath = getConfigPath();
  return fs.existsSync(configPath);
}

export {
  loadConfig,
  getResolvedConfig,
  getResolvedConfigAsync,
  getResolvedDatabaseConfigForTest,
  prepareConfigForSave,
  prepareConfigWithPassPointers,
  saveConfig,
  updateConfig,
  getConfigValue,
  resetConfig,
  validateConfig,
  getConfigDir,
  getConfigFilePath,
  configExists,
  DEFAULT_CONFIG
};

