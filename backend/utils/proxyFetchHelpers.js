/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * SSRF-safe helpers for /api/proxy-fetch.
 */

const ALLOWED_PROXY_REQUEST_HEADERS = new Set([
  'accept',
  'content-type',
]);

const BLOCKED_PROXY_HEADER_PREFIXES = [
  'x-aws-ec2-metadata-token',
  'x-aws-ec2-metadata-token-ttl-seconds',
];

const ALLOWED_PROXY_METHODS = new Set(['GET', 'HEAD']);

/**
 * @param {unknown} method
 * @returns {boolean}
 */
export function isAllowedProxyFetchMethod(method) {
  return ALLOWED_PROXY_METHODS.has(String(method || 'GET').toUpperCase());
}

/**
 * Build outbound headers for proxy-fetch — allowlist only; never forward cookies or IMDS tokens.
 * @param {Record<string, unknown>} [userHeaders]
 * @returns {Record<string, string>}
 */
export function buildProxyFetchHeaders(userHeaders = {}) {
  const requestHeaders = {
    Accept: 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (compatible; OSCAL-Report-Generator/1.0)',
  };

  if (!userHeaders || typeof userHeaders !== 'object') {
    return requestHeaders;
  }

  for (const [key, value] of Object.entries(userHeaders)) {
    if (value === undefined || value === null) {
      continue;
    }
    const lower = String(key).toLowerCase();
    if (BLOCKED_PROXY_HEADER_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
      continue;
    }
    if (!ALLOWED_PROXY_REQUEST_HEADERS.has(lower)) {
      continue;
    }
    requestHeaders[key] = Array.isArray(value) ? value.map(String).join(', ') : String(value);
  }

  return requestHeaders;
}

/**
 * @param {import('axios').AxiosResponseHeaders} headers
 * @returns {Record<string, string>}
 */
export function sanitizeProxyResponseHeaders(headers) {
  if (!headers || typeof headers !== 'object') {
    return {};
  }
  const contentType = headers['content-type'] || headers['Content-Type'];
  return contentType ? { 'content-type': String(contentType) } : {};
}
