/**
 * Resolve _pass pointers from config via `pass show` and insert secrets into pass.
 * Env: PASSWORD_STORE_DIR (pass store location), OSCAL_PASS_DISABLED=1 (skip resolution).
 *
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license GPL-3.0-or-later
 */

import { execSync, spawnSync } from 'child_process';

const PASS_DISABLED = process.env.OSCAL_PASS_DISABLED === '1' || process.env.OSCAL_PASS_DISABLED === 'true';

/** Default pass store for OSCAL service user on EC2/Linux when systemd does not set HOME/PASSWORD_STORE_DIR */
const LINUX_SVC_HOME = '/var/lib/svc_ams-oscal';
const LINUX_PASS_STORE = `${LINUX_SVC_HOME}/.password-store`;

/**
 * Check if a value is a _pass pointer object.
 * @param {*} v
 * @returns {boolean}
 */
export function isPassPointer(v) {
  return v && typeof v === 'object' && typeof v._pass === 'string' && v._pass.trim() !== '';
}

/** Pass entries that are OAuth client secrets: often stored with label on first line, secret on last. */
const OAUTH_CLIENT_SECRET_ENTRIES = ['OSCAL/sso-oauth-okta-client-secret', 'OSCAL/sso-oauth-azure-client-secret', 'OSCAL/sso-oauth-google-client-secret', 'OSCAL/sso-oauth-github-client-secret'];

/**
 * Run `pass show <entry>` and return the secret line.
 * For OAuth client secret entries, uses the last non-empty line if multiple lines (label + secret).
 * Otherwise returns the first line. Does not log the secret.
 *
 * @param {string} entry - Pass entry name (e.g. OSCAL/smtp-password)
 * @returns {string}
 */
/** Strip UTF-8 BOM and trim (pass / editors sometimes leave BOM on first line). */
function normalizePassValue(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/^\uFEFF/, '').trim();
}

export function passShow(entry) {
  if (PASS_DISABLED) {
    return '';
  }
  const env = { ...process.env };
  let storeDir = process.env.PASSWORD_STORE_DIR;
  if (!storeDir && process.platform === 'linux') {
    env.HOME = process.env.HOME || LINUX_SVC_HOME;
    env.PASSWORD_STORE_DIR = LINUX_PASS_STORE;
  } else if (storeDir) {
    env.PASSWORD_STORE_DIR = storeDir;
  }
  try {
    const out = execSync(`pass show ${JSON.stringify(entry)}`, {
      encoding: 'utf8',
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return '';
    if (lines.length > 1 && OAUTH_CLIENT_SECRET_ENTRIES.includes(entry)) {
      return normalizePassValue(lines[lines.length - 1]);
    }
    return normalizePassValue(lines[0]);
  } catch (err) {
    if (err.status !== 1 && err.code !== 'ENOENT') {
      console.warn(`[pass] Failed to resolve entry "${entry}": ${err.message}`);
    }
    return '';
  }
}

/**
 * Recursively resolve all _pass pointers in an object (in place).
 * Replaces { _pass: "OSCAL/..." } with the secret string from pass.
 *
 * @param {Object|Array} obj - Config (or any nested object). Mutated in place.
 * @returns {Object|Array} Same object with pointers resolved
 */
export function resolvePassPointers(obj) {
  if (obj == null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      if (isPassPointer(obj[i])) {
        obj[i] = passShow(obj[i]._pass);
      } else if (obj[i] && typeof obj[i] === 'object') {
        resolvePassPointers(obj[i]);
      }
    }
    return obj;
  }

  if (typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      const v = obj[key];
      if (isPassPointer(v)) {
        obj[key] = passShow(v._pass);
      } else if (v && typeof v === 'object') {
        resolvePassPointers(v);
      }
    }
    return obj;
  }

  return obj;
}

/**
 * Insert or update a pass entry with the given secret.
 * Uses `pass insert -m` so the value is the only line.
 * Newlines are stripped (not replaced with space) so the stored value is a single line;
 * passShow() returns the first line, so this ensures we store exactly what we'll read.
 *
 * @param {string} entry - Pass entry name (e.g. OSCAL/smtp-password)
 * @param {string} value - Secret value (single line; newlines are stripped)
 * @returns {{ success: boolean, error?: string }}
 */
export function passInsert(entry, value) {
  if (PASS_DISABLED) {
    return { success: false, error: 'Pass is disabled (OSCAL_PASS_DISABLED)' };
  }
  const env = { ...process.env };
  let storeDir = process.env.PASSWORD_STORE_DIR;
  // On Linux (e.g. EC2 systemd), if PASSWORD_STORE_DIR not set, use service user's store so GUI save works
  if (!storeDir && process.platform === 'linux') {
    env.HOME = process.env.HOME || LINUX_SVC_HOME;
    env.PASSWORD_STORE_DIR = LINUX_PASS_STORE;
    storeDir = LINUX_PASS_STORE;
  } else if (storeDir) {
    env.PASSWORD_STORE_DIR = storeDir;
  }
  // Strip newlines so we store one line; avoids corrupting secrets when pasted with trailing newline
  const singleLine = (value || '').replace(/\r?\n/g, '').trim();
  try {
    const proc = spawnSync('pass', ['insert', '-m', entry], {
      input: singleLine,
      encoding: 'utf8',
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    if (proc.status !== 0) {
      const err = (proc.stderr || proc.error?.message || 'Unknown error').trim();
      console.warn('[pass] insert failed', {
        'service.name': 'oscal-report-generator',
        'event.action': 'pass_insert_failed',
        'event.outcome': 'failure',
        entry,
        error: err,
        hasPasswordStoreDir: !!process.env.PASSWORD_STORE_DIR,
        hasStoreDirInEnv: !!storeDir
      });
      return { success: false, error: err };
    }
    return { success: true };
  } catch (err) {
    console.warn('[pass] insert threw', {
      'service.name': 'oscal-report-generator',
      'event.action': 'pass_insert_error',
      'event.outcome': 'failure',
      entry,
      error: err.message,
      hasPasswordStoreDir: !!process.env.PASSWORD_STORE_DIR
    });
    return { success: false, error: err.message };
  }
}
