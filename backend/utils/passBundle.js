/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Single Pass entry (PROD/OSCAL/AWS_SM) holding the same JSON bundle as AWS Secrets Manager.
 */
import { execSync, spawnSync } from 'child_process';
import { SENSITIVE_CONFIG_KEYS } from './sensitiveConfigKeys.js';
import { mergePartialIntoBundle, parseBundle } from './bundleSchema.js';
import { normalizeBundleSecretValue } from './passOAuthSecret.js';

const DEFAULT_BUNDLE_ENTRY = 'PROD/OSCAL/AWS_SM';
const LINUX_SVC_HOME = '/var/lib/svc_ams-oscal';
const LINUX_PASS_STORE = `${LINUX_SVC_HOME}/.password-store`;

const LOGICAL_KEYS = new Set(SENSITIVE_CONFIG_KEYS.map((k) => k.smEntry));

function isPassDisabled() {
  return process.env.OSCAL_PASS_DISABLED === '1' || process.env.OSCAL_PASS_DISABLED === 'true';
}

/** @type {{ entries: Record<string, string>, _meta: object } | null} */
let bundleCache = null;

export function getPassBundleEntry() {
  return (process.env.OSCAL_PASS_BUNDLE_ENTRY || DEFAULT_BUNDLE_ENTRY).trim();
}

export function isLogicalBundleKey(entry) {
  if (typeof entry !== 'string' || !entry.trim()) return false;
  return LOGICAL_KEYS.has(entry.trim());
}

function passEnv() {
  const env = { ...process.env };
  const storeDir = process.env.PASSWORD_STORE_DIR;
  if (!storeDir && process.platform === 'linux') {
    env.HOME = process.env.HOME || LINUX_SVC_HOME;
    env.PASSWORD_STORE_DIR = LINUX_PASS_STORE;
  } else if (storeDir) {
    env.PASSWORD_STORE_DIR = storeDir;
  }
  return env;
}

/**
 * Raw pass show for any entry path (bundle or legacy).
 * @param {string} entry
 * @returns {string}
 */
export function rawPassShow(entry) {
  if (isPassDisabled() || !entry) return '';
  try {
    return execSync(`pass show ${JSON.stringify(entry)}`, {
      encoding: 'utf8',
      env: passEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    if (err.status !== 1 && err.code !== 'ENOENT') {
      console.warn('[pass] bundle raw show failed', {
        'service.name': 'oscal-report-generator',
        'event.action': 'pass_bundle_show_failed',
        'event.outcome': 'failure',
        'event.category': 'configuration',
        'error.type': err?.name || 'Error',
        exitStatus: err?.status,
        entryLeaf: entry.split('/').pop() || 'unknown',
      });
    }
    return '';
  }
}

/**
 * @param {boolean} [useCache]
 * @returns {{ entries: Record<string, string>, _meta: object }}
 */
export function readPassBundle(useCache = true) {
  if (isPassDisabled()) {
    return { entries: {}, _meta: { keys: {} } };
  }
  if (useCache && bundleCache) {
    return bundleCache;
  }
  const raw = rawPassShow(getPassBundleEntry());
  const bundle = parseBundle(raw);
  bundleCache = bundle;
  return bundle;
}

export function clearPassBundleCache() {
  bundleCache = null;
}

/**
 * @param {string} logicalKey - e.g. OSCAL/smtp-password
 * @returns {string}
 */
export function getPassBundleSecret(logicalKey) {
  if (isPassDisabled() || !logicalKey) return '';
  const key = String(logicalKey).trim();
  const bundle = readPassBundle(true);
  const raw = bundle.entries[key];
  if (raw == null || String(raw).trim() === '') return '';
  return normalizeBundleSecretValue(key, String(raw));
}

/**
 * Merge partial logical keys into PROD/OSCAL/AWS_SM and write via pass insert.
 * @param {Record<string, string>} partialEntries
 * @returns {{ success: boolean, error?: string }}
 */
export function mergePassBundlePartial(partialEntries) {
  if (isPassDisabled()) {
    return { success: false, error: 'Pass is disabled (OSCAL_PASS_DISABLED)' };
  }
  if (!partialEntries || Object.keys(partialEntries).length === 0) {
    return { success: true };
  }
  const remote = readPassBundle(false);
  const merged = mergePartialIntoBundle(remote, partialEntries);
  const payload = JSON.stringify(merged);
  const entry = getPassBundleEntry();
  try {
    const proc = spawnSync('pass', ['insert', '-m', '-f', entry], {
      input: payload,
      encoding: 'utf8',
      env: passEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (proc.status !== 0) {
      const err = (proc.stderr || proc.error?.message || 'Unknown error').trim();
      console.warn('[pass] bundle insert failed', {
        'service.name': 'oscal-report-generator',
        'event.action': 'pass_bundle_insert_failed',
        'event.outcome': 'failure',
        'event.category': 'configuration',
        exitCode: proc.status,
        stderrLength: (proc.stderr || '').length,
      });
      return { success: false, error: err };
    }
    bundleCache = merged;
    return { success: true };
  } catch (err) {
    return { success: false, error: err?.message || 'insert_failed' };
  }
}
