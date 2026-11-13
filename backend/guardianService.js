/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import axios from 'axios';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { createHash, randomUUID } from 'node:crypto';
import { URL } from 'node:url';
import ipaddr from 'ipaddr.js';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { validateWithSchema } from './oscalValidatorAJV.js';
import { getDelegatedToken, retainDelegatedToken } from './auth/delegatedTokens.js';

const MAX_SSP_BYTES = 2 * 1024 * 1024;
const GUARDIAN_HOST = 'guardian.amsgovcloud.com.au';

export class GuardianError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const unavailable = () => new GuardianError(503, 'guardian_unavailable', 'Guardian integration is disabled or not configured.');
const reauthenticate = () => new GuardianError(401, 'guardian_reauthentication_required', 'Sign in again with Okta to obtain a valid Guardian access token.');

function httpsUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (url.port && url.port !== '443')) { throw unavailable(); }
  return url;
}

export function readGuardianIdentityConfig(env = process.env) {
  try {
    const issuer = httpsUrl(env.OSCAL_GUARDIAN_ISSUER);
    // Okta org-server tokens must not be repurposed for this custom API.
    if (!/^\/oauth2\/[^/]+$/.test(issuer.pathname) || issuer.search) { throw unavailable(); }
    const jwks = httpsUrl(env.OSCAL_GUARDIAN_JWKS_URL);
    if (jwks.origin !== issuer.origin || jwks.search) { throw unavailable(); }
    const audience = env.OSCAL_GUARDIAN_AUDIENCE?.trim();
    const clientId = env.OSCAL_GUARDIAN_CLIENT_ID?.trim();
    if (!audience || !clientId || audience === clientId || audience === '0oa280f78zjnb9zcO0h8') { throw unavailable(); }
    const scopes = (env.OSCAL_GUARDIAN_SCOPES || '').trim().split(/\s+/).filter(Boolean);
    if (!scopes.length) { throw unavailable(); }
    return { issuer: issuer.href, jwksUrl: jwks.href, audience, clientId, scopes };
  } catch {
    throw unavailable();
  }
}

export function readGuardianConfig(env = process.env) {
  if (env.OSCAL_GUARDIAN_ENABLED !== 'true') { return null; }
  try {
    const identity = readGuardianIdentityConfig(env);
    const targets = JSON.parse(env.OSCAL_GUARDIAN_TARGETS_JSON || '[]');
    if (!Array.isArray(targets) || !targets.length || targets.length > 100) { throw unavailable(); }
    const ids = new Set();
    for (const target of targets) {
      const url = httpsUrl(target.url);
      if (url.hostname !== GUARDIAN_HOST || url.search || url.pathname === '/') { throw unavailable(); }
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(target.id) || ids.has(target.id)) { throw unavailable(); }
      if (typeof target.label !== 'string' || !target.label.trim() || target.label.length > 120) { throw unavailable(); }
      // Only this explicit wire format is supported. Other contracts require an adapter.
      if (!['POST', 'PUT'].includes(target.method) || target.payloadFormat !== 'raw-ssp') { throw unavailable(); }
      if (!Array.isArray(target.groups) || !target.groups.length || target.groups.some(group =>
        typeof group !== 'string' || !group.trim() || group !== group.trim() || group.toUpperCase() === 'GRP-TECHGRC-ALL')) { throw unavailable(); }
      ids.add(target.id);
    }
    return { ...identity, targets };
  } catch {
    throw unavailable();
  }
}

// Pin a public DNS result to the actual TLS request, preventing DNS rebinding.
export async function publicHttpsRequest(options) {
  const url = httpsUrl(options.url);
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => ipaddr.process(address).range() !== 'unicast')) {
    throw Object.assign(unavailable(), { reason: 'host_not_public' });
  }
  const address = addresses[0];
  const agent = new https.Agent({ lookup: (_host, _options, callback) => {
    if (_options?.all) { callback(null, [address]); }
    else { callback(null, address.address, address.family); }
  } });
  try {
    return await axios.request({
      timeout: 15000, maxContentLength: MAX_SSP_BYTES, maxBodyLength: MAX_SSP_BYTES,
      ...options,
      httpsAgent: agent, proxy: false, maxRedirects: 0,
    });
  } finally {
    agent.destroy();
  }
}

const keySets = new Map();
export async function resolveKeys(config) {
  const cached = keySets.get(config.jwksUrl);
  if (cached && cached.expiresAt > Date.now()) { return cached.keys; }
  const response = await publicHttpsRequest({ method: 'GET', url: config.jwksUrl });
  const keys = createLocalJWKSet(response.data);
  // Bound cache size across deployment configuration changes.
  keySets.clear();
  keySets.set(config.jwksUrl, { keys, expiresAt: Date.now() + 60000 });
  return keys;
}

export function createGuardianService({
  readConfig = readGuardianConfig,
  readAssessmentIdentity = () => process.env.OSCAL_GUARDIAN_ASSESSMENTS_ENABLED === 'true'
    ? readGuardianIdentityConfig() : null,
  keys = resolveKeys,
  request = publicHttpsRequest,
  validateSsp = validateWithSchema,
  audit = event => console.info(JSON.stringify({
    'service.name': 'oscal-report-generator',
    'service.version': process.env.npm_package_version || 'unknown',
    'deployment.environment': process.env.NODE_ENV || 'development',
    severity: 'INFO', ...event,
  })),
} = {}) {
  const inFlight = new WeakSet();

  async function verify(token, config) {
    try {
      const { payload } = await jwtVerify(token, await keys(config), {
        issuer: config.issuer, audience: config.audience,
        algorithms: ['RS256'], requiredClaims: ['sub', 'iat', 'exp'], clockTolerance: 5,
      });
        if (payload.exp * 1000 <= Date.now() || payload.cid !== config.clientId ||
          typeof payload.sub !== 'string' || !payload.sub || typeof payload.iat !== 'number' ||
          payload.iat > Date.now() / 1000 + 5 || payload.iat >= payload.exp) { throw reauthenticate(); }
      const scopes = Array.isArray(payload.scp) ? payload.scp : [];
      if (!config.scopes.every(scope => scopes.includes(scope))) {
        throw new GuardianError(403, 'guardian_scope_required', 'Guardian API scopes are missing.');
      }
      if (!Array.isArray(payload.groups) || payload.groups.some(group => typeof group !== 'string')) {
        throw new GuardianError(403, 'guardian_groups_required', 'Guardian permission groups are missing.');
      }
      return payload;
    } catch (error) {
      if (error instanceof GuardianError) { throw error; }
      throw reauthenticate();
    }
  }

  function configuration() {
    const config = readConfig();
    if (!config) { throw unavailable(); }
    return config;
  }

  async function retain(session, tokenResponse) {
    const config = readConfig() || readAssessmentIdentity();
    if (!config || !session) { return; }
    if (tokenResponse?.token_type?.toLowerCase() !== 'bearer') { throw reauthenticate(); }
    const lifetime = Number(tokenResponse.expires_in);
    if (!Number.isFinite(lifetime) || lifetime <= 0) { throw reauthenticate(); }
    const payload = await verify(tokenResponse.access_token, config);
    retainDelegatedToken(session, tokenResponse.access_token,
      Math.min(payload.exp * 1000, Date.now() + lifetime * 1000, session.createdAt + 86400000));
  }

  async function status(session) {
    try {
      const config = configuration();
      const token = getDelegatedToken(session);
      if (!token) { throw reauthenticate(); }
      const payload = await verify(token, config);
      return { ready: true, targets: config.targets.filter(target =>
        target.groups.some(group => payload.groups.includes(group)))
        .map(({ id, label }) => ({ id, label })) };
    } catch (error) {
      if (!(error instanceof GuardianError)) { throw error; }
      return { ready: false, code: error.code, message: error.message, targets: [] };
    }
  }

  async function apply(session, { targetId, ssp, confirmed } = {}) {
    const config = configuration();
    if (confirmed !== true) { throw new GuardianError(400, 'guardian_confirmation_required', 'Confirm the selected SSP and target before applying.'); }
    const target = config.targets.find(item => item.id === targetId);
    if (!target) { throw new GuardianError(403, 'guardian_target_denied', 'Guardian target is not authorized.'); }
    const token = getDelegatedToken(session);
    if (!token) { throw reauthenticate(); }
    const payload = await verify(token, config);
    if (!target.groups.some(group => payload.groups.includes(group))) {
      throw new GuardianError(403, 'guardian_target_denied', 'Guardian target is not authorized.');
    }
    if (!ssp || typeof ssp !== 'object' || Array.isArray(ssp) ||
      Object.keys(ssp).length !== 1 || !ssp['system-security-plan']) {
      throw new GuardianError(400, 'guardian_invalid_ssp', 'Upload an OSCAL system-security-plan JSON document.');
    }
    const serialized = JSON.stringify(ssp);
    if (Buffer.byteLength(serialized) > MAX_SSP_BYTES) { throw new GuardianError(413, 'guardian_ssp_too_large', 'SSP exceeds the 2 MiB limit.'); }
    const validation = await validateSsp(ssp, 'ssp', false, {
      requiredFields: true, stringPatterns: true, enums: true, formats: true,
      lengthRestrictions: true, additionalProperties: true,
    });
    if (!validation.valid || !validation.validated || validation.warning || validation.mode !== 'strict') {
      throw new GuardianError(400, 'guardian_invalid_ssp', 'SSP failed strict server-side schema validation.');
    }
    if (inFlight.has(session)) { throw new GuardianError(409, 'guardian_apply_in_progress', 'A Guardian apply operation is already running for this session.'); }
    inFlight.add(session);
    const operationId = randomUUID();
    const event = {
      'event.action': 'guardian_ssp_apply', operationId, targetId,
      actorId: createHash('sha256').update(String(session.userId)).digest('hex'),
      documentHash: createHash('sha256').update(serialized).digest('hex'),
    };
    try {
      if (getDelegatedToken(session) !== token) { throw reauthenticate(); }
      const response = await request({
        method: target.method, url: target.url, data: serialized,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (response.status < 200 || response.status >= 300) { throw new Error('Upstream rejected operation'); }
      audit({ ...event, 'event.outcome': 'success', upstreamStatus: response.status });
      return { success: true, operationId, upstreamStatus: response.status,
        message: 'Guardian accepted the request. Verify completion in Guardian before submitting again.' };
    } catch (error) {
      if (error instanceof GuardianError) { throw error; }
      audit({ ...event, 'event.outcome': 'unknown' });
      // Never retry a write automatically or expose axios errors (they contain Authorization).
      throw new GuardianError(502, 'guardian_apply_unconfirmed', 'Guardian did not confirm the request. Check its operation state before retrying.');
    } finally {
      inFlight.delete(session);
    }
  }

  async function authorize(session, config) {
    const token = getDelegatedToken(session);
    if (!token) { throw reauthenticate(); }
    const payload = await verify(token, config);
    return { token, payload };
  }

  return { retain, status, apply, authorize };
}

export const guardianService = createGuardianService();