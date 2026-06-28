/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Resolve a stored secret value (plaintext, _cfgenc, _sm, _pass) to a plain string.
 */
import { isCfgEncPointer, decryptConfigSecret } from './configFieldCrypto.js';
import { isSmPointer, resolveSecretPointer } from './secretsManager.js';
import { isPassPointer } from './passResolver.js';
import { MASK, SENSITIVE_CONFIG_KEYS, getByPath, setByPath } from './sensitiveConfigKeys.js';

/**
 * @param {*} value
 * @returns {string}
 */
export function resolveStoredSecretValue(value) {
  if (value == null) return '';
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t || t === MASK || t === '********') return '';
    return t;
  }
  if (isCfgEncPointer(value)) {
    try {
      return decryptConfigSecret(value).trim();
    } catch (_) {
      return '';
    }
  }
  if (isSmPointer(value) || isPassPointer(value)) {
    return (resolveSecretPointer(value) || '').trim();
  }
  return '';
}

/**
 * Whether a value is a stored secret envelope (not plaintext).
 * @param {*} value
 * @returns {boolean}
 */
export function isStoredSecretEnvelope(value) {
  return isCfgEncPointer(value) || isSmPointer(value) || isPassPointer(value);
}

/**
 * Pick secret for test/preview endpoints: form plaintext, masked placeholder, or stored envelope.
 * @param {*} formValue - Value from UI request body
 * @param {*} resolvedValue - Value from getResolvedConfig() at same path
 * @param {*} rawStoredValue - Raw value from loadConfig() at same path
 * @returns {string}
 */
export function coalesceSecretForTest(formValue, resolvedValue, rawStoredValue) {
  if (typeof formValue === 'string') {
    const t = formValue.trim();
    if (t && t !== MASK && t !== '********') return t;
  }
  const fromFormEnvelope = resolveStoredSecretValue(formValue);
  if (fromFormEnvelope) return fromFormEnvelope;
  if (typeof resolvedValue === 'string') {
    const t = resolvedValue.trim();
    if (t && t !== MASK && t !== '********') return t;
  }
  return resolveStoredSecretValue(rawStoredValue ?? formValue) || '';
}

/**
 * Replace sensitive config paths with MASK (or empty) for client-facing GET /api/settings.
 * @param {Object} config - Mutable config clone
 * @param {{ skipPaths?: string[] }} [options]
 */
export function maskSensitiveConfigForClient(config, options = {}) {
  const skip = new Set(options.skipPaths || []);
  for (const { path: keyPath } of SENSITIVE_CONFIG_KEYS) {
    if (skip.has(keyPath)) continue;
    const v = getByPath(config, keyPath);
    if (typeof v === 'string' && v.trim() && v !== MASK) {
      setByPath(config, keyPath, MASK);
    } else if (isStoredSecretEnvelope(v)) {
      const resolved = resolveStoredSecretValue(v);
      setByPath(config, keyPath, resolved ? MASK : '');
    }
  }
}
