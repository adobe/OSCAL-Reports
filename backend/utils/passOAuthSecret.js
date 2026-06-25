/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * OAuth client secret parsing for pass / bundle values.
 */

/** Pass entries that are OAuth client secrets: often stored with label on first line, secret on last. */
const OAUTH_CLIENT_SECRET_ENTRIES = [
  'OSCAL/sso-oauth-okta-client-secret',
  'OSCAL/sso-oauth-azure-client-secret',
  'OSCAL/sso-oauth-google-client-secret',
  'OSCAL/sso-oauth-github-client-secret',
  'OSCAL/sso-oauth-generic-oidc-client-secret',
];

/** @param {string} entry */
export function isOAuthClientSecretPassEntry(entry) {
  if (typeof entry !== 'string' || !entry.trim()) return false;
  if (OAUTH_CLIENT_SECRET_ENTRIES.includes(entry.trim())) return true;
  return /\/sso-oauth-(okta|azure|google|github|generic-oidc)-client-secret$/.test(entry.trim());
}

/** Strip UTF-8 BOM and trim (pass / editors sometimes leave BOM on first line). */
export function normalizePassValue(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/^\uFEFF/, '').trim();
}

/**
 * Parse multi-line pass output for OAuth client secrets (bare secret or key=value lines).
 * @param {string[]} lines - Non-empty trimmed lines from pass show
 * @returns {string}
 */
export function extractOAuthPassClientSecret(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return '';
  const parseKv = (line) => {
    const normalized = normalizePassValue(line);
    const kv = normalized.match(/^(?:okta-)?client-secret=(.+)$/i);
    return kv ? normalizePassValue(kv[1]) : normalized;
  };
  if (lines.length === 1) return parseKv(lines[0]);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const normalized = normalizePassValue(lines[i]);
    if (/^(?:okta-)?client-secret=/i.test(normalized)) {
      return parseKv(normalized);
    }
  }
  return parseKv(lines[lines.length - 1]);
}

/**
 * Normalize a bundle entry value (may be multi-line OAuth format).
 * @param {string} entryKey
 * @param {string} value
 * @returns {string}
 */
export function normalizeBundleSecretValue(entryKey, value) {
  if (typeof value !== 'string') return '';
  const trimmed = normalizePassValue(value);
  if (!trimmed) return '';
  if (isOAuthClientSecretPassEntry(entryKey) && trimmed.includes('\n')) {
    const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return extractOAuthPassClientSecret(lines);
  }
  return trimmed;
}
