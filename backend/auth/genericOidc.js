/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Generic_OIDC provider: discovery, PKCE, signed state, redirect allowlist, token exchange helpers.
 */
import crypto from 'crypto';
import axios from '../utils/safeAxios.js';
import { validateUrl } from '../utils/urlValidator.js';
import { isCfgEncPointer, decryptConfigSecret } from '../utils/configFieldCrypto.js';
import { isSecretPointer } from '../utils/sensitiveConfigKeys.js';
import { resolveSecretPointer } from '../utils/secretsManager.js';
import { isGenericOidcTlsRelaxed, oidcAxiosRequestOptions } from '../utils/oidcHttpsAgent.js';
import {
  getDockerBootstrapFieldSecret,
  isDockerRuntime,
} from '../utils/dockerBootstrapSecrets.js';
import fs from 'fs';

export const GENERIC_OIDC_PROVIDER_ID = 'Generic_OIDC';
export const GENERIC_OIDC_STATE_TTL_MS = 15 * 60 * 1000;

function base64UrlEncode(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice(0, (4 - (str.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

/** @returns {string} */
export function generateCodeVerifier() {
  return base64UrlEncode(crypto.randomBytes(32));
}

/** @param {string} codeVerifier */
export function computeCodeChallenge(codeVerifier) {
  const hash = crypto.createHash('sha256').update(codeVerifier, 'utf8').digest();
  return base64UrlEncode(hash);
}

/**
 * @param {string} redirectUri
 * @param {string} clientSecret
 * @param {string} codeVerifier
 */
export function createSignedOidcState(redirectUri, clientSecret, codeVerifier) {
  const payload = {
    redirectUri: redirectUri || '',
    createdAt: Date.now(),
    rnd: crypto.randomBytes(8).toString('hex'),
    ...(codeVerifier ? { codeVerifier } : {}),
  };
  const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sig = crypto.createHmac('sha256', clientSecret || '').update(payloadB64).digest();
  return `${payloadB64}.${base64UrlEncode(sig)}`;
}

/**
 * @param {string} state
 * @param {string} clientSecret
 * @returns {{ redirectUri: string, codeVerifier?: string }|null}
 */
export function verifySignedOidcState(state, clientSecret) {
  if (!state || typeof state !== 'string' || !clientSecret) return null;
  const dot = state.indexOf('.');
  if (dot <= 0 || dot === state.length - 1) return null;
  const payloadB64 = state.slice(0, dot);
  const sigB64 = state.slice(dot + 1);
  try {
    const expectedSig = crypto.createHmac('sha256', clientSecret).update(payloadB64).digest();
    const expectedB64 = base64UrlEncode(expectedSig);
    if (sigB64 !== expectedB64) return null;
    const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
    if (!payload || typeof payload.createdAt !== 'number') return null;
    if (Date.now() - payload.createdAt > GENERIC_OIDC_STATE_TTL_MS) return null;
    return {
      redirectUri: payload.redirectUri || '',
      ...(payload.codeVerifier ? { codeVerifier: payload.codeVerifier } : {}),
    };
  } catch (_) {
    return null;
  }
}

/** Strip trailing slashes in linear time. */
export function stripTrailingSlashes(str) {
  if (str == null || typeof str !== 'string') return '';
  let end = str.length;
  while (end > 0 && str.charCodeAt(end - 1) === 47) end -= 1;
  return end === str.length ? str : str.slice(0, end);
}

/**
 * @param {string} redirectUri
 * @param {Array<{ matchingMode?: string, url?: string }>} patterns
 */
export function isRedirectUriAllowed(redirectUri, patterns) {
  const normalized = stripTrailingSlashes((redirectUri || '').trim());
  if (!normalized || !Array.isArray(patterns)) return false;
  for (const entry of patterns) {
    const mode = (entry?.matchingMode || 'strict').toLowerCase();
    const pattern = (entry?.url || '').trim();
    if (!pattern) continue;
    if (mode === 'strict') {
      if (stripTrailingSlashes(pattern) === normalized) return true;
    } else if (mode === 'regex') {
      try {
        const re = new RegExp(`^${pattern}$`);
        if (re.test(normalized)) return true;
      } catch (_) {
        // skip invalid regex
      }
    }
  }
  return false;
}

/**
 * @param {import('express').Request} req
 * @param {Object} provider
 */
export function resolveGenericOidcRedirectUri(req, provider) {
  if (!req || !provider) return '';
  const callbackPath = (provider.callbackPath || '/auth/callback').trim() || '/auth/callback';
  const forwardedHost = String(req.get('X-Forwarded-Host') || '')
    .split(',')[0]
    .trim();
  const forwardedProto = String(req.get('X-Forwarded-Proto') || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const backendHost = (req.get('host') || '').toLowerCase();
  const useForwarded =
    forwardedHost &&
    /^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9](:\d+)?$/.test(forwardedHost) &&
    (backendHost.startsWith('localhost:') || backendHost.startsWith('127.0.0.1:'));
  let proto = useForwarded && (forwardedProto === 'https' || forwardedProto === 'http') ? forwardedProto : req.protocol;
  let hostForCallback = useForwarded ? forwardedHost : req.get('host');
  if ((!hostForCallback || backendHost === 'localhost:3020' || backendHost.startsWith('127.0.0.1:')) && !useForwarded) {
    const ref = (req.get('Referer') || '').trim();
    if (ref) {
      try {
        const u = new URL(ref);
        if (u.host && u.protocol) {
          hostForCallback = u.host;
          proto = u.protocol.replace(':', '') || proto;
        }
      } catch (_) {
        // ignore
      }
    }
  }
  if (hostForCallback && !hostForCallback.includes(':')) {
    if (forwardedProto === 'https') {
      proto = 'https';
    } else {
      const ref = (req.get('Referer') || '').trim();
      if (ref.toLowerCase().startsWith('https://')) {
        try {
          const ru = new URL(ref);
          if (ru.host === hostForCallback || hostForCallback.startsWith(ru.hostname)) {
            proto = 'https';
          }
        } catch (_) {
          // ignore
        }
      }
    }
  }
  if (!proto || !hostForCallback) return '';
  const pathPart = callbackPath.startsWith('/') ? callbackPath : `/${callbackPath}`;
  return stripTrailingSlashes(`${proto}://${hostForCallback}${pathPart}`);
}

/**
 * @param {string} discoveryUrl
 * @param {boolean} [tlsRelaxed]
 * @returns {Promise<{ discovery: Object|null, error?: string }>}
 */
export async function probeOidcDiscovery(discoveryUrl, tlsRelaxed = false) {
  const url = (discoveryUrl || '').trim();
  if (!url) {
    return { discovery: null, error: 'Discovery URL is empty' };
  }
  const validation = await validateUrl(url, { allowPrivateIPs: true, allowLocalhost: true });
  if (!validation.valid) {
    return { discovery: null, error: validation.error || 'Discovery URL failed validation' };
  }
  try {
    const res = await axios.get(
      validation.url,
      oidcAxiosRequestOptions(validation.url, tlsRelaxed, { timeout: 8000, validateStatus: () => true }),
    );
    if (res.status === 200 && res.data?.authorization_endpoint) {
      return {
        discovery: {
          authorization_endpoint: res.data.authorization_endpoint,
          token_endpoint: res.data.token_endpoint,
          userinfo_endpoint: res.data.userinfo_endpoint,
          issuer: typeof res.data.issuer === 'string' ? res.data.issuer : '',
          scopes_supported: Array.isArray(res.data.scopes_supported) ? res.data.scopes_supported : [],
          claims_supported: Array.isArray(res.data.claims_supported) ? res.data.claims_supported : [],
          discovery_url: validation.url,
        },
      };
    }
    return {
      discovery: null,
      error: `Discovery URL returned HTTP ${res.status} or missing authorization_endpoint`,
    };
  } catch (err) {
    const code = err?.code || '';
    const msg = err?.message || String(err);
    let detail = msg;
    if (
      code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' ||
      code === 'CERT_HAS_EXPIRED' ||
      /certificate/i.test(msg)
    ) {
      detail = `${msg}. The IdP may be serving an incomplete TLS chain. Enable Generic_OIDC.tlsRelaxed in config or set OSCAL_GENERIC_OIDC_TLS_RELAXED=1, or fix the full certificate chain on the IdP.`;
    }
    return { discovery: null, error: detail };
  }
}

/**
 * @param {string} discoveryUrl
 * @param {{ tlsRelaxed?: boolean }|boolean} [options]
 */
export async function fetchOidcDiscovery(discoveryUrl, options = {}) {
  const tlsRelaxed =
    typeof options === 'boolean' ? options : (options?.tlsRelaxed ?? isGenericOidcTlsRelaxed(options?.provider));
  const { discovery } = await probeOidcDiscovery(discoveryUrl, tlsRelaxed);
  return discovery;
}

export { isGenericOidcTlsRelaxed };

/**
 * @param {{ _cfgenc?: string }|string} enc
 * @param {string} [fieldSecret]
 * @returns {string}
 */
function decryptCfgEncWithFieldSecret(enc, fieldSecret) {
  if (!isCfgEncPointer(enc)) return '';
  const prev = process.env.OSCAL_CONFIG_FIELD_SECRET;
  if (fieldSecret) process.env.OSCAL_CONFIG_FIELD_SECRET = fieldSecret;
  try {
    return decryptConfigSecret(enc).trim();
  } catch (_) {
    return '';
  } finally {
    if (prev === undefined) delete process.env.OSCAL_CONFIG_FIELD_SECRET;
    else process.env.OSCAL_CONFIG_FIELD_SECRET = prev;
  }
}

/**
 * Docker bundled config fallback when volume _cfgenc was encrypted with a mismatched field key.
 * @returns {string}
 */
function resolveDockerBundledGenericOidcSecret() {
  if (!isDockerRuntime()) return '';
  const bundledPath = (process.env.DOCKER_BUNDLED_CONFIG || '/app/config/app/config.json').trim();
  try {
    if (!fs.existsSync(bundledPath)) return '';
    const bundled = JSON.parse(fs.readFileSync(bundledPath, 'utf8'));
    const enc = bundled?.ssoConfig?.oauth?.providers?.Generic_OIDC?.clientSecret;
    return decryptCfgEncWithFieldSecret(enc, getDockerBootstrapFieldSecret());
  } catch (_) {
    return '';
  }
}

/**
 * @param {Object|null|undefined} provider
 */
export function getEffectiveGenericOidcClientSecret(provider) {
  if (!provider) return '';
  if (provider.clientSecret != null && typeof provider.clientSecret === 'string') {
    return provider.clientSecret.trim();
  }
  if (isCfgEncPointer(provider.clientSecret)) {
    const direct = decryptCfgEncWithFieldSecret(provider.clientSecret);
    if (direct) return direct;
    const withBootstrap = decryptCfgEncWithFieldSecret(
      provider.clientSecret,
      getDockerBootstrapFieldSecret(),
    );
    if (withBootstrap) return withBootstrap;
    const bundled = resolveDockerBundledGenericOidcSecret();
    if (bundled) return bundled;
    return '';
  }
  if (isSecretPointer(provider.clientSecret)) {
    return resolveSecretPointer(provider.clientSecret);
  }
  const fromEnv = (process.env.GENERIC_OIDC_CLIENT_SECRET || process.env.OSCAL_GENERIC_OIDC_CLIENT_SECRET || '').trim();
  if (fromEnv) return fromEnv;
  return resolveDockerBundledGenericOidcSecret();
}

/**
 * Decode JWT payload groups claim (no signature verification).
 * @param {string} jwtString
 */
export function decodeGroupsFromJwt(jwtString) {
  if (!jwtString || typeof jwtString !== 'string') return null;
  const parts = jwtString.trim().split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '==='.slice(0, (4 - (payload.length % 4)) % 4);
    const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    const groups = decoded.groups;
    if (Array.isArray(groups)) return groups;
    if (typeof groups === 'string') return [groups];
    return null;
  } catch (_) {
    return null;
  }
}

/**
 * @param {string} tokenUrl
 */
export async function postAuthorizationCodeToken(
  tokenUrl,
  { clientId, clientSecret, code, redirectUri, codeVerifier, tlsRelaxed = false },
) {
  const formHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };
  const axiosOpts = oidcAxiosRequestOptions(tokenUrl, tlsRelaxed, {
    headers: formHeaders,
    timeout: 10000,
    validateStatus: () => true,
  });

  const bodyPost = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });
  if (codeVerifier) {
    bodyPost.set('code_verifier', codeVerifier);
  }

  let response = await axios.post(tokenUrl, bodyPost.toString(), axiosOpts);
  if (response.data?.access_token) {
    return { response, retriedWithBasic: false };
  }

  const err = response.data?.error;
  const desc = typeof response.data?.error_description === 'string' ? response.data.error_description : '';
  const descLc = desc.toLowerCase();
  const isInvalidGrant = err === 'invalid_grant';
  const shouldTryBasic =
    (response.status === 401 || response.status === 400) &&
    !isInvalidGrant &&
    (err === 'invalid_client' || (descLc.includes('client secret') && descLc.includes('invalid')));

  if (!shouldTryBasic) {
    return { response, retriedWithBasic: false };
  }

  const bodyBasic = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });
  if (codeVerifier) {
    bodyBasic.set('code_verifier', codeVerifier);
  }
  response = await axios.post(tokenUrl, bodyBasic.toString(), {
    headers: {
      ...formHeaders,
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')}`,
    },
    timeout: 10000,
    validateStatus: () => true,
  });
  return { response, retriedWithBasic: true };
}

/** Default redirect URI patterns from Authentik app registration. */
export const DEFAULT_GENERIC_OIDC_REDIRECT_PATTERNS = [
  { matchingMode: 'strict', url: 'http://localhost:3021/auth/callback' },
  { matchingMode: 'strict', url: 'http://127.0.0.1:3020/auth/callback' },
  { matchingMode: 'strict', url: 'http://192.168.1.200:3020/auth/callback' },
  { matchingMode: 'strict', url: 'https://oscal.keekar.au/auth/callback' },
  { matchingMode: 'strict', url: 'http://oscal.keekar.au/auth/callback' },
  { matchingMode: 'strict', url: 'https://blue.oscal.keekar.au/auth/callback' },
  { matchingMode: 'strict', url: 'http://blue.oscal.keekar.au/auth/callback' },
  { matchingMode: 'strict', url: 'https://oscal.amsgovcloud.com.au/auth/callback' },
  { matchingMode: 'strict', url: 'http://oscal.amsgovcloud.com.au/auth/callback' },
  { matchingMode: 'regex', url: 'http://localhost:\\d+/auth/callback' },
  { matchingMode: 'regex', url: 'http://127\\.0\\.0\\.1:\\d+/auth/callback' },
  { matchingMode: 'regex', url: 'http://192\\.168\\.\\d+\\.\\d+:\\d+/auth/callback' },
  { matchingMode: 'regex', url: 'https?://([a-z0-9-]+\\.)*keekar\\.au(:\\d+)?/auth/callback' },
  { matchingMode: 'regex', url: 'https?://([a-z0-9-]+\\.)*oscal\\.keekar\\.au(:\\d+)?/auth/callback' },
  { matchingMode: 'regex', url: 'https?://oscal\\.amsgovcloud\\.com\\.au(:\\d+)?/auth/callback' },
];
