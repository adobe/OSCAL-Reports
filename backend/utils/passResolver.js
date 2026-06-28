/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import { spawnSync } from 'child_process';
import { getPassBundleSecret, isLogicalBundleKey, rawPassShow } from './passBundle.js';
import {
  extractOAuthPassClientSecret,
  isOAuthClientSecretPassEntry,
  normalizePassValue,
} from './passOAuthSecret.js';

export { extractOAuthPassClientSecret, normalizePassValue };

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

/**
 * Run `pass show <entry>` and return the secret line.
 * OSCAL logical keys (OSCAL/smtp-password, etc.) resolve from PROD/OSCAL/AWS_SM bundle.
 * Other pass paths (e.g. AWS/...) use legacy per-entry pass show.
 *
 * @param {string} entry - Pass entry name (e.g. OSCAL/smtp-password)
 * @returns {string}
 */
export function passShow(entry) {
  if (PASS_DISABLED) {
    return '';
  }
  if (isLogicalBundleKey(entry)) {
    return getPassBundleSecret(entry);
  }
  try {
    const out = rawPassShow(entry);
    if (!out) return '';
    const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) return '';
    if (isOAuthClientSecretPassEntry(entry)) {
      return extractOAuthPassClientSecret(lines);
    }
    return normalizePassValue(lines[0]);
  } catch (err) {
    if (err.status !== 1 && err.code !== 'ENOENT') {
      // Do not log err.message or entry in clear text — gpg/pass stderr may contain paths or hints.
      console.warn('[pass] pass show failed', {
        'service.name': 'oscal-report-generator',
        'event.action': 'pass_show_failed',
        'event.outcome': 'failure',
        'event.category': 'configuration',
        'error.type': err?.name || 'Error',
        'error.code': err?.code,
        exitStatus: err?.status,
        entryLeaf: typeof entry === 'string' && entry ? (entry.split('/').pop() || entry) : 'unknown',
      });
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
        'event.category': 'configuration',
        entryLeaf: typeof entry === 'string' && entry ? (entry.split('/').pop() || entry) : 'unknown',
        exitCode: proc.status,
        stderrLength: (proc.stderr || '').length,
        hasPasswordStoreDir: !!process.env.PASSWORD_STORE_DIR,
        hasStoreDirInEnv: !!storeDir,
      });
      return { success: false, error: err };
    }
    return { success: true };
  } catch (err) {
    console.warn('[pass] insert threw', {
      'service.name': 'oscal-report-generator',
      'event.action': 'pass_insert_error',
      'event.outcome': 'failure',
      'event.category': 'configuration',
      'error.type': err?.name || 'Error',
      'error.code': err?.code,
      entryLeaf: typeof entry === 'string' && entry ? (entry.split('/').pop() || entry) : 'unknown',
      hasPasswordStoreDir: !!process.env.PASSWORD_STORE_DIR,
    });
    return { success: false, error: err.message };
  }
}
