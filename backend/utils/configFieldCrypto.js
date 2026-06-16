/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Reversible config-embedded secret envelope (_cfgenc) using PBKDF2-SHA256 + AES-256-GCM.
 * Same crypto stack as password hashing in userManager (FIPS-aligned KDF); reversible for OAuth client secrets.
 */
import crypto from 'crypto';

const VERSION = 'v1';
const ITERATIONS = 100000;
const KEY_LENGTH = 32;
const DIGEST = 'sha256';
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

function getMasterSecret() {
  const fromEnv = (process.env.OSCAL_CONFIG_FIELD_SECRET || '').trim();
  if (fromEnv) return fromEnv;
  const session = (process.env.SESSION_SECRET || '').trim();
  if (session) return session;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('OSCAL_CONFIG_FIELD_SECRET or SESSION_SECRET is required for _cfgenc in production');
  }
  return 'oscal-config-field-dev-key-change-me';
}

/**
 * @param {*} value
 * @returns {boolean}
 */
export function isCfgEncPointer(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return typeof value._cfgenc === 'string' && value._cfgenc.trim() !== '';
}

/**
 * @param {string} plaintext
 * @returns {{ _cfgenc: string }}
 */
export function encryptConfigSecret(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.trim() === '') {
    throw new Error('encryptConfigSecret requires a non-empty string');
  }
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = crypto.pbkdf2Sync(getMasterSecret(), salt, ITERATIONS, KEY_LENGTH, DIGEST);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const envelope = [
    VERSION,
    salt.toString('base64url'),
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('$');
  return { _cfgenc: envelope };
}

/**
 * @param {string|{ _cfgenc: string }} input
 * @returns {string}
 */
export function decryptConfigSecret(input) {
  const envelope = typeof input === 'string' ? input : input?._cfgenc;
  if (typeof envelope !== 'string' || !envelope.startsWith(`${VERSION}$`)) {
    throw new Error('Invalid _cfgenc envelope version or format');
  }
  const parts = envelope.split('$');
  if (parts.length !== 5 || parts[0] !== VERSION) {
    throw new Error('Invalid _cfgenc envelope structure');
  }
  const [, saltB64, ivB64, tagB64, ctB64] = parts;
  const salt = Buffer.from(saltB64, 'base64url');
  const iv = Buffer.from(ivB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');
  const ciphertext = Buffer.from(ctB64, 'base64url');
  const key = crypto.pbkdf2Sync(getMasterSecret(), salt, ITERATIONS, KEY_LENGTH, DIGEST);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

/**
 * Walk config tree and replace { _cfgenc } objects with decrypted strings (in place).
 * @param {Object} root
 */
export function resolveCfgEncPointers(root) {
  if (!root || typeof root !== 'object') return;
  if (Array.isArray(root)) {
    for (let i = 0; i < root.length; i += 1) {
      const item = root[i];
      if (isCfgEncPointer(item)) {
        root[i] = decryptConfigSecret(item);
      } else {
        resolveCfgEncPointers(item);
      }
    }
    return;
  }
  for (const key of Object.keys(root)) {
    const val = root[key];
    if (isCfgEncPointer(val)) {
      root[key] = decryptConfigSecret(val);
    } else if (val && typeof val === 'object') {
      resolveCfgEncPointers(val);
    }
  }
}
