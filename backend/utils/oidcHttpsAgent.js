/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * HTTPS agent for outbound OIDC calls (discovery, token, userinfo).
 * Homelab IdPs (e.g. Authentik behind nginx) may serve an incomplete chain that
 * Node rejects while browsers/curl succeed — use tlsRelaxed on the provider or env override.
 */
import https from 'https';

/**
 * @param {boolean|undefined} tlsRelaxed - When true, skip TLS certificate verification.
 * @returns {import('https').Agent|undefined}
 */
export function createOidcHttpsAgent(tlsRelaxed) {
  if (!tlsRelaxed) {
    return undefined;
  }
  return new https.Agent({ rejectUnauthorized: false });
}

/**
 * @param {Object|null|undefined} provider - Generic_OIDC provider config
 * @returns {boolean}
 */
export function isGenericOidcTlsRelaxed(provider) {
  const env = (process.env.OSCAL_GENERIC_OIDC_TLS_RELAXED || process.env.OSCAL_OIDC_TLS_RELAXED || '').trim();
  if (env === '1' || env.toLowerCase() === 'true') return true;
  if (env === '0' || env.toLowerCase() === 'false') return false;
  if (provider?.tlsRelaxed === true) return true;
  if (provider?.tlsRelaxed === false) return false;
  return false;
}

/**
 * @param {string} url
 * @param {boolean} tlsRelaxed
 * @param {Object} [extra]
 */
export function oidcAxiosRequestOptions(url, tlsRelaxed, extra = {}) {
  const opts = { ...extra };
  if (typeof url === 'string' && url.startsWith('https://')) {
    const agent = createOidcHttpsAgent(tlsRelaxed);
    if (agent) {
      opts.httpsAgent = agent;
    }
  }
  return opts;
}
