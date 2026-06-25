/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Shared AWS SM / Pass bundle JSON shape ({ entries, _meta }).
 */
const OAUTH_CLIENT_SECRET_ENTRIES = new Set([
  'OSCAL/sso-oauth-okta-client-secret',
  'OSCAL/sso-oauth-azure-client-secret',
  'OSCAL/sso-oauth-google-client-secret',
  'OSCAL/sso-oauth-github-client-secret',
  'OSCAL/sso-oauth-generic-oidc-client-secret',
]);

/**
 * @param {string} entryKey
 * @param {string} value
 * @returns {string}
 */
export function normalizeSecretValueForKey(entryKey, value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return '';
  if (OAUTH_CLIENT_SECRET_ENTRIES.has(entryKey) && trimmed.includes('\n')) {
    const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines.length ? lines[lines.length - 1] : trimmed;
  }
  return trimmed;
}

/**
 * @param {string} secretString
 * @returns {{ entries: Record<string, string>, _meta: { keys: Record<string, { t: number }> } }}
 */
export function parseBundle(secretString) {
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
      _meta: parsed._meta && typeof parsed._meta === 'object'
        ? { ...parsed._meta, keys: { ...(parsed._meta.keys || {}) } }
        : { keys: {} },
    };
  } catch {
    return { entries: {}, _meta: { keys: {} } };
  }
}

/**
 * @param {{ entries: Record<string, string>, _meta: { keys: Record<string, { t: number }> } }} remote
 * @param {Record<string, string>} partialEntries
 * @returns {{ entries: Record<string, string>, _meta: { keys: Record<string, { t: number }> } }}
 */
export function mergePartialIntoBundle(remote, partialEntries) {
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

export function canonicalBundleJson(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort());
}
