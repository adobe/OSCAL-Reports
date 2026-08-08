/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */

/**
 * Merge Bearer session headers for authenticated API calls (fetch or axios).
 * @param {() => object} getAuthConfig
 * @param {Record<string, string>} [extraHeaders]
 * @returns {Record<string, string>}
 */
export function buildAuthenticatedJsonHeaders(getAuthConfig, extraHeaders = {}) {
  const authConfig = typeof getAuthConfig === 'function' ? getAuthConfig() : {};
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(authConfig.headers || {}),
    ...extraHeaders,
  };
}
