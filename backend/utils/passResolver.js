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

/**
 * Check if a value is a _pass pointer object.
 * @param {*} v
 * @returns {boolean}
 */
function isPassPointer(v) {
  return v && typeof v === 'object' && typeof v._pass === 'string' && v._pass.trim() !== '';
}

/**
 * Run `pass show <entry>` and return first line of output, or empty string on failure.
 * Does not log the secret. Logs only "resolved pass entry" or "missing entry" (no value).
 *
 * @param {string} entry - Pass entry name (e.g. OSCAL/smtp-password)
 * @returns {string}
 */
function passShow(entry) {
  if (PASS_DISABLED) {
    return '';
  }
  const storeDir = process.env.PASSWORD_STORE_DIR;
  const env = { ...process.env };
  if (storeDir) {
    env.PASSWORD_STORE_DIR = storeDir;
  }
  try {
    const out = execSync(`pass show ${JSON.stringify(entry)}`, {
      encoding: 'utf8',
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const firstLine = out.split('\n')[0] || '';
    return firstLine.trim();
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
 * Uses `pass insert -m` so the value is the only line (no trailing newline from echo).
 *
 * @param {string} entry - Pass entry name (e.g. OSCAL/smtp-password)
 * @param {string} value - Secret value (single line; avoid newlines)
 * @returns {{ success: boolean, error?: string }}
 */
export function passInsert(entry, value) {
  if (PASS_DISABLED) {
    return { success: false, error: 'Pass is disabled (OSCAL_PASS_DISABLED)' };
  }
  const storeDir = process.env.PASSWORD_STORE_DIR;
  const env = { ...process.env };
  if (storeDir) {
    env.PASSWORD_STORE_DIR = storeDir;
  }
  try {
    const proc = spawnSync('pass', ['insert', '-m', entry], {
      input: (value || '').replace(/\r?\n/g, ' ').trim(),
      encoding: 'utf8',
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    if (proc.status !== 0) {
      const err = (proc.stderr || proc.error?.message || 'Unknown error').trim();
      return { success: false, error: err };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
