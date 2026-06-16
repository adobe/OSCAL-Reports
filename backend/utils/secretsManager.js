/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * AWS Secrets Manager bundle for EC2 (single JSON secret). In-memory cache only — no process.env.
 * Local/Docker uses OSCAL_SECRETS_MODE=config (default) and config.json / optional pass.
 */
import {
  GetSecretValueCommand,
  PutSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import { passShow } from './passResolver.js';

const OAUTH_CLIENT_SECRET_ENTRIES = new Set([
  'OSCAL/sso-oauth-okta-client-secret',
  'OSCAL/sso-oauth-azure-client-secret',
  'OSCAL/sso-oauth-google-client-secret',
  'OSCAL/sso-oauth-github-client-secret',
]);

/** @type {Map<string, string>} */
let cache = new Map();
let cacheLoaded = false;
let loadPromise = null;

/**
 * @returns {'aws-sm'|'config'}
 */
export function getSecretsMode() {
  const mode = (process.env.OSCAL_SECRETS_MODE || 'config').trim().toLowerCase();
  return mode === 'aws-sm' ? 'aws-sm' : 'config';
}

export function isAwsSmMode() {
  return getSecretsMode() === 'aws-sm';
}

export function getSecretsManagerArn() {
  return (process.env.OSCAL_SECRETS_MANAGER_ARN || process.env.PASS_SECRETS_SYNC_SECRET_ARN || '').trim();
}

/**
 * @param {*} v
 * @returns {boolean}
 */
export function isSmPointer(v) {
  return v && typeof v === 'object' && typeof v._sm === 'string' && v._sm.trim() !== '';
}

/**
 * @param {string} entryKey
 * @returns {{ _sm: string }}
 */
export function entryKeyToConfigPointer(entryKey) {
  return { _sm: String(entryKey).trim() };
}

function normalizeSecretValue(entryKey, value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return '';
  if (OAUTH_CLIENT_SECRET_ENTRIES.has(entryKey) && trimmed.includes('\n')) {
    const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines.length ? lines[lines.length - 1] : trimmed;
  }
  return trimmed;
}

function parseBundle(secretString) {
  if (!secretString || typeof secretString !== 'string') {
    return { entries: {}, _meta: { keys: {} } };
  }
  try {
    const parsed = JSON.parse(secretString);
    if (!parsed || typeof parsed !== 'object' || !parsed.entries || typeof parsed.entries !== 'object') {
      return { entries: {}, _meta: { keys: {} } };
    }
    return {
      entries: { ...parsed.entries },
      _meta: parsed._meta && typeof parsed._meta === 'object' ? { ...parsed._meta, keys: { ...(parsed._meta.keys || {}) } } : { keys: {} },
    };
  } catch {
    return { entries: {}, _meta: { keys: {} } };
  }
}

function applyBundleToCache(bundle) {
  cache = new Map();
  for (const [key, val] of Object.entries(bundle.entries || {})) {
    if (val != null && String(val).trim() !== '') {
      cache.set(key, normalizeSecretValue(key, String(val)));
    }
  }
  cacheLoaded = true;
}

function createSmClient() {
  const region = (process.env.AWS_DEFAULT_REGION || process.env.AWS_REGION || 'us-east-1').trim();
  return new SecretsManagerClient({ region });
}

/**
 * @param {SecretsManagerClient} [client]
 */
export async function loadBundleFromAws(client) {
  const arn = getSecretsManagerArn();
  if (!arn) {
    console.warn('[secrets] AWS SM mode but OSCAL_SECRETS_MANAGER_ARN is empty', {
      'service.name': 'oscal-report-generator',
      'event.action': 'secrets_load_skipped',
      'event.outcome': 'failure',
    });
    cacheLoaded = true;
    return { success: false, error: 'missing_arn' };
  }
  const sm = client || createSmClient();
  try {
    const resp = await sm.send(new GetSecretValueCommand({ SecretId: arn }));
    const bundle = parseBundle(resp.SecretString);
    applyBundleToCache(bundle);
    return { success: true, versionId: resp.VersionId };
  } catch (err) {
    console.warn('[secrets] GetSecretValue failed', {
      'service.name': 'oscal-report-generator',
      'event.action': 'secrets_load_failed',
      'event.outcome': 'failure',
      'error.type': err?.name || 'Error',
    });
    cacheLoaded = true;
    return { success: false, error: err?.message || 'get_failed' };
  }
}

export async function initializeSecretsCache() {
  if (!isAwsSmMode()) {
    return { success: true, skipped: true };
  }
  if (loadPromise) return loadPromise;
  loadPromise = loadBundleFromAws().finally(() => {
    loadPromise = null;
  });
  return loadPromise;
}

export async function reloadSecretsFromAws() {
  if (!isAwsSmMode()) return { success: true, skipped: true };
  cacheLoaded = false;
  return loadBundleFromAws();
}

/**
 * @param {string} entryKey
 * @returns {string}
 */
export function getSecret(entryKey) {
  if (!entryKey) return '';
  return cache.get(String(entryKey).trim()) || '';
}

export function isSecretCached(entryKey) {
  return cache.has(String(entryKey || '').trim());
}

function mergePartialIntoBundle(remote, partialEntries) {
  const now = Math.floor(Date.now() / 1000);
  const merged = {
    entries: { ...(remote.entries || {}) },
    _meta: { keys: { ...(remote._meta?.keys || {}) } },
  };
  for (const [key, value] of Object.entries(partialEntries)) {
    const k = String(key).trim();
    if (!k) continue;
    if (value == null || String(value).trim() === '') {
      delete merged.entries[k];
      if (merged._meta.keys[k]) delete merged._meta.keys[k];
    } else {
      merged.entries[k] = String(value).trim();
      merged._meta.keys[k] = { t: now };
    }
  }
  return merged;
}

function canonicalJson(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}

/**
 * Merge partial entries into the SM bundle (CAS). Updates in-memory cache on success.
 * @param {Record<string, string>} partialEntries
 * @param {SecretsManagerClient} [client]
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function mergeAndPutBundle(partialEntries, client) {
  const arn = getSecretsManagerArn();
  if (!arn) {
    return { success: false, error: 'OSCAL_SECRETS_MANAGER_ARN not set' };
  }
  const sm = client || createSmClient();
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let v1;
    let remote;
    try {
      const get1 = await sm.send(new GetSecretValueCommand({ SecretId: arn }));
      v1 = get1.VersionId;
      remote = parseBundle(get1.SecretString);
    } catch (err) {
      return { success: false, error: err?.message || 'get_failed' };
    }

    const merged = mergePartialIntoBundle(remote, partialEntries);

    let v2;
    let remote2;
    try {
      const get2 = await sm.send(new GetSecretValueCommand({ SecretId: arn }));
      v2 = get2.VersionId;
      remote2 = parseBundle(get2.SecretString);
    } catch (err) {
      return { success: false, error: err?.message || 'cas_get_failed' };
    }

    if (v1 && v2 && v1 !== v2) {
      continue;
    }

    const canonRemote = canonicalJson(remote2);
    const canonMerged = canonicalJson(merged);
    if (canonRemote === canonMerged) {
      applyBundleToCache(merged);
      return { success: true };
    }

    try {
      await sm.send(
        new PutSecretValueCommand({
          SecretId: arn,
          SecretString: JSON.stringify(merged),
        }),
      );
      applyBundleToCache(merged);
      return { success: true };
    } catch (err) {
      const msg = err?.message || 'put_failed';
      if (attempt < maxAttempts - 1 && /Precondition|conflict|version/i.test(msg)) {
        continue;
      }
      return { success: false, error: msg };
    }
  }
  return { success: false, error: 'cas_retry_exhausted' };
}

/**
 * Resolve { _sm: "OSCAL/..." } pointers from in-memory cache (mutates obj).
 * Legacy { _pass } is left for passResolver when mode is config.
 * @param {Object|Array} obj
 */
export async function ensureSmCacheReady() {
  if (!isAwsSmMode()) return;
  if (!cacheLoaded) {
    await initializeSecretsCache();
  }
}

export function resolveSmPointers(obj) {
  if (obj == null) return obj;

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (isSmPointer(obj[i])) {
        obj[i] = getSecret(obj[i]._sm);
      } else if (obj[i] && typeof obj[i] === 'object') {
        resolveSmPointers(obj[i]);
      }
    }
    return obj;
  }

  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      const v = obj[key];
      if (isSmPointer(v)) {
        obj[key] = getSecret(v._sm);
      } else if (v && typeof v === 'object') {
        resolveSmPointers(v);
      }
    }
  }
  return obj;
}

export function resolveSecretPointer(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v.trim();
  if (isSmPointer(v)) return getSecret(v._sm);
  if (v && typeof v === 'object' && typeof v._pass === 'string' && v._pass.trim()) {
    return (passShow(v._pass) || '').trim();
  }
  return '';
}

/** Test-only: reset module state */
export function __resetSecretsCacheForTests() {
  cache = new Map();
  cacheLoaded = false;
  loadPromise = null;
}

/** Test-only: seed cache without AWS */
export function __setSecretsCacheForTests(entries) {
  cache = new Map(Object.entries(entries || {}));
  cacheLoaded = true;
}
