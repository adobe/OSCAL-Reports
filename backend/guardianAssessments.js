/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import axios from 'axios';
import { URL, URLSearchParams } from 'node:url';
import { jwtVerify } from 'jose';
import { GuardianError, guardianService, publicHttpsRequest, readGuardianIdentityConfig, resolveKeys } from './guardianService.js';
import { getDelegatedToken, retainDelegatedToken } from './auth/delegatedTokens.js';
import { getIdpIdentity } from './auth/idpIdentity.js';
import { GENERIC_OIDC_PROVIDER_ID } from './auth/genericOidc.js';
import { addIntegrityHash } from './integrityService.js';
import { createHash } from 'node:crypto';

export const GUARDIAN_PREVIEW_BYTES = 16 * 1024 * 1024;
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
const runIdentifier = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
const notPrivileged = () => new GuardianError(403, 'guardian_not_privileged',
  `Guardian assessment access requires Generic SSO membership of a group whose name contains: ${privilegedGroups().join(', ')}.`);
// Prerequisites are owner-controlled; naming them lets a user see what is outstanding without exposing any value.
const PREREQUISITES = 'Outstanding owner prerequisites may include: the Guardian assessment API deployed and its host configured here; ' +
  'an Authentik custom scope issued only to approved-group members; the groups claim and RS256 signing on the access token; ' +
  'sso.keekar.au reachable from AWS; the OSCAL client ID; and the assessment plan reference.';
const unavailable = () => new GuardianError(503, 'guardian_assessments_unavailable',
  `Guardian assessment retrieval is disabled or not configured. ${PREREQUISITES}`);

export function readGuardianAssessmentConfig(env = process.env) {
  if (env.OSCAL_GUARDIAN_ASSESSMENTS_ENABLED !== 'true') { return null; }
  try {
    // Okta identity settings are optional when only the Generic SSO (Authentik) path is configured.
    let identity = {};
    try { identity = readGuardianIdentityConfig(env); } catch (error) {
      if (!env.OSCAL_GUARDIAN_GENERIC_SSO_ISSUER) { throw error; }
    }
    const local = env.NODE_ENV === 'development' && env.OSCAL_GUARDIAN_LOCAL_GATEWAY === 'true';
    // Owner-supplied exact hostnames (for example the execute-api hosts from Guardian's assessment_api_endpoints
    // output). No wildcards and no built-in default: nothing is allowed until the owners configure it.
    const hosts = (env.OSCAL_GUARDIAN_ASSESSMENTS_ALLOWED_HOSTS || '').split(',').map(host => host.trim().toLowerCase())
      .filter(Boolean);
    if (hosts.some(host => !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host))) { throw unavailable(); }
    const endpoint = value => {
      const url = new URL(value);
      const isLocal = local && url.protocol === 'http:' && url.hostname === '127.0.0.1';
      if (!isLocal && (url.protocol !== 'https:' || !hosts.includes(url.hostname) ||
        (url.port && url.port !== '443'))) { throw unavailable(); }
      if (url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/v1/guardian')) { throw unavailable(); }
      return { href: url.href, local: isLocal };
    };
    // Guardian serves each approved issuer on its own API endpoint. The primary (Okta) endpoint is optional so an
    // Authentik-only first deployment can leave it unset; the unset path then stays "not configured".
    const primary = env.OSCAL_GUARDIAN_ASSESSMENTS_URL ? endpoint(env.OSCAL_GUARDIAN_ASSESSMENTS_URL) : null;
    const generic = env.OSCAL_GUARDIAN_GENERIC_SSO_ASSESSMENTS_URL
      ? endpoint(env.OSCAL_GUARDIAN_GENERIC_SSO_ASSESSMENTS_URL) : primary;
    const configured = [primary, generic].filter(Boolean);
    // A real endpoint must never be reached through the unpinned local request path.
    if (!configured.length || configured.some(item => item.local !== configured[0].local)) { throw unavailable(); }
    const targets = JSON.parse(env.OSCAL_GUARDIAN_ASSESSMENT_TARGETS_JSON || '[]');
    if (!Array.isArray(targets) || !targets.length || targets.length > 100) { throw unavailable(); }
    const seen = new Set();
    for (const target of targets) {
      const key = `${target.provider}/${target.targetId}`;
      if (!['cloudflare', 'okta'].includes(target.provider) || !identifier(target.targetId) || seen.has(key) ||
        typeof target.label !== 'string' || !target.label.trim() || target.label.length > 120 ||
        !Array.isArray(target.groups) || !target.groups.length ||
        target.groups.some(group => typeof group !== 'string' || !group.trim() ||
          group !== group.trim() || group.toUpperCase() === 'GRP-TECHGRC-ALL')) { throw unavailable(); }
      seen.add(key);
    }
    return { ...identity, url: primary?.href, genericUrl: generic?.href, local: configured[0].local, targets };
  } catch {
    throw unavailable();
  }
}

// Generic SSO members of an IdP group whose name CONTAINS one of these phrases (case-insensitive) may use
// Guardian as privileged operators. Guardian still applies its own target grants.
export function privilegedGroups(env = process.env) {
  return (env.OSCAL_GUARDIAN_PRIVILEGED_GROUPS || 'Platform Admin').split(',').map(group => group.trim()).filter(Boolean);
}

const matchingGroups = (groups, phrases) => {
  const wanted = phrases.map(phrase => phrase.toLowerCase());
  return groups.filter(group => typeof group === 'string' && wanted.some(phrase => group.toLowerCase().includes(phrase)));
};

export function privilegedIdentity(session, env = process.env) {
  const identity = getIdpIdentity(session);
  if (identity?.provider !== GENERIC_OIDC_PROVIDER_ID) { return null; }
  const matched = matchingGroups(identity.groups, privilegedGroups(env));
  return matched.length ? { provider: 'Generic SSO', groups: matched, allGroups: identity.groups } : null;
}

// Authentik (Generic SSO) access-token contract. Every value comes from owner-approved configuration;
// nothing is defaulted, and any missing or malformed value disables the path (fail closed).
export function readGenericSsoConfig(env = process.env) {
  const issuer = env.OSCAL_GUARDIAN_GENERIC_SSO_ISSUER;
  if (!issuer) { return null; }
  try {
    const issuerUrl = new URL(issuer);
    const jwksUrl = new URL(env.OSCAL_GUARDIAN_GENERIC_SSO_JWKS_URL);
    const clientId = env.OSCAL_GUARDIAN_GENERIC_SSO_CLIENT_ID?.trim();
    const scope = env.OSCAL_GUARDIAN_GENERIC_SSO_SCOPE?.trim();
    if (issuerUrl.protocol !== 'https:' || jwksUrl.protocol !== 'https:' || jwksUrl.origin !== issuerUrl.origin ||
      issuerUrl.port || issuerUrl.username || issuerUrl.search || issuerUrl.hash || jwksUrl.search ||
      !clientId || !scope || /\s/.test(scope)) { throw unavailable(); }
    return { issuer, jwksUrl: jwksUrl.href, audience: clientId, scope };
  } catch {
    throw unavailable();
  }
}

async function verifyGenericSso(token, config, privileged, keys) {
  try {
    const { payload } = await jwtVerify(token, await keys(config), {
      issuer: config.issuer, audience: config.audience, algorithms: ['RS256'],
      requiredClaims: ['sub', 'iat', 'exp'], clockTolerance: 5,
    });
    const scopes = typeof payload.scope === 'string' ? payload.scope.split(/\s+/) : [];
    if (payload.iat > Date.now() / 1000 + 5 || !scopes.includes(config.scope) || !Array.isArray(payload.groups) ||
      !matchingGroups(payload.groups, privilegedGroups()).length) {
      throw new Error('claims');
    }
    return payload;
  } catch {
    throw new GuardianError(401, 'guardian_reauthentication_required', 'Sign in again with Generic SSO.');
  }
}

const audit = (session, action, detail = {}) => console.info(JSON.stringify({
  'service.name': 'oscal-report-generator', severity: 'INFO', 'event.action': `guardian_assessment_${action}`,
  userId: session?.userId, idp: getIdpIdentity(session)?.provider, privileged: Boolean(privilegedIdentity(session)),
  idpGroups: privilegedIdentity(session)?.groups, ...detail,
}));

// Local E2E only: honoured solely when the config is the NODE_ENV=development loopback gateway.
let localDevAuthorize = null;
export function registerLocalDevAuthorization(authorize) { localDevAuthorize = authorize; }

export function createGuardianAssessmentService({
  readConfig = readGuardianAssessmentConfig,
  authorize = (session, config) => guardianService.authorize(session, config),
  readGenericSso = readGenericSsoConfig,
  keys = resolveKeys,
  request = options => publicHttpsRequest(options),
  localRequest = options => axios.request(options),
} = {}) {
  async function authorizeSession(session, config, privileged) {
    if (config.local && localDevAuthorize) {
      if (!privileged) { throw notPrivileged(); }
      return localDevAuthorize(session, config);
    }
    if (privileged) {
      const generic = readGenericSso();
      if (!generic) {
        throw new GuardianError(503, 'guardian_generic_sso_not_approved',
          `Guardian has not yet approved Generic SSO access for this environment. No assessment was fetched. ${PREREQUISITES}`);
      }
      const token = getDelegatedToken(session);
      if (!token) { throw new GuardianError(401, 'guardian_reauthentication_required', 'Sign in again with Generic SSO.'); }
      const payload = await verifyGenericSso(token, generic, privileged, keys);
      return { token, payload: { groups: payload.groups } };
    }
    if (!config.issuer || !config.url) { throw unavailable(); }
    return authorize(session, config);
  }

  async function access(session, selection) {
    const config = readConfig();
    if (!config) { throw unavailable(); }
    const privileged = privilegedIdentity(session);
    const { token, payload } = await authorizeSession(session, config, privileged);
    const targets = config.targets.filter(target => target.groups.some(group => payload.groups.includes(group)));
    if (selection && (!targets.some(target => target.provider === selection.provider &&
      target.targetId === selection.targetId) || (selection.runId !== undefined && !runIdentifier(selection.runId)))) {
      throw new GuardianError(404, 'guardian_assessment_not_found', 'Guardian selection is missing or not authorized.');
    }
    return { config, token, targets, privileged, dev: Boolean(config.local && localDevAuthorize) };
  }

  async function call(session, context, path, method = 'GET', data) {
    if (!context.dev && getDelegatedToken(session) !== context.token) {
      throw new GuardianError(401, 'guardian_reauthentication_required', 'Sign in again with Okta.');
    }
    try {
      const response = await (context.config.local ? localRequest : request)({
        url: `${context.privileged ? context.config.genericUrl : context.config.url}${path}`, method, data,
        headers: { Authorization: `Bearer ${context.token}`, 'Content-Type': 'application/json' },
        proxy: false, maxRedirects: 0, timeout: 30000,
        maxBodyLength: GUARDIAN_PREVIEW_BYTES, maxContentLength: GUARDIAN_PREVIEW_BYTES,
        validateStatus: () => true,
      });
      if (response.status < 200 || response.status >= 300) {
        const messages = {
          400: 'Guardian rejected the assessment request.',
          401: 'Guardian requires a fresh approved Okta sign-in.',
          403: 'Guardian denied access to this assessment.',
          404: 'Guardian selection is missing or not authorized.',
          409: 'Guardian assessment data, SSP linkage or target binding conflicts. Refresh and verify the selection.',
          413: 'The report or preview exceeds the Guardian API payload limit.',
          503: 'Guardian assessment storage or authorization is not configured.',
        };
        throw new GuardianError(messages[response.status] ? response.status : 502,
          'guardian_assessment_request_failed', messages[response.status] || 'Guardian assessment request failed.');
      }
      if (response.data?.contractVersion !== '1') {
        throw new GuardianError(502, 'guardian_assessment_contract_invalid', 'Guardian returned an unsupported assessment contract.');
      }
      return response.data;
    } catch (error) {
      if (error instanceof GuardianError) { throw error; }
      throw new GuardianError(502, 'guardian_assessment_unavailable', 'Guardian could not be reached. No report changes were applied.');
    }
  }

  // Keep the Authentik ACCESS token server-side only; privileged sessions only, and only when approved config exists.
  async function retainGenericSso(session, tokenResponse) {
    const generic = readGenericSso();
    const privileged = privilegedIdentity(session);
    if (!generic || !privileged || !session) { return; }
    const lifetime = Number(tokenResponse?.expires_in);
    if (tokenResponse?.token_type?.toLowerCase() !== 'bearer' || !Number.isFinite(lifetime) || lifetime <= 0) { return; }
    const payload = await verifyGenericSso(tokenResponse.access_token, generic, privileged, keys);
    retainDelegatedToken(session, tokenResponse.access_token,
      Math.min(payload.exp * 1000, Date.now() + lifetime * 1000, session.createdAt + 86400000));
  }

  const operator = privileged => (privileged ? { provider: privileged.provider, groups: privileged.groups } : undefined);

  async function status(session) {
    try {
      const context = await access(session);
      const capabilities = await call(session, context, '/capabilities');
      if (capabilities.assessmentRead !== true || capabilities.sspPreview !== true ||
        !Array.isArray(capabilities.providers)) {
        throw new GuardianError(503, 'guardian_assessment_capability_missing', 'Guardian assessment read/preview is not available.');
      }
      audit(session, 'status', { outcome: 'ready' });
      return { ready: true, privileged: operator(context.privileged),
        targets: context.targets.filter(target => capabilities.providers.includes(target.provider))
          .map(({ provider, targetId, label }) => ({ provider, targetId, label })) };
    } catch (error) {
      if (!(error instanceof GuardianError)) { throw error; }
      // Show a user their own sign-in method and IdP groups so a missing group claim can be diagnosed.
      const idp = getIdpIdentity(session);
      return { ready: false, code: error.code, message: error.message, targets: [],
        privileged: operator(privilegedIdentity(session)),
        identity: error.code === 'guardian_not_privileged'
          ? { signedInWith: idp?.provider || 'not a Generic SSO session', groups: idp?.groups || [] } : undefined };
    }
  }

  async function runs(session, selection) {
    const context = await access(session, selection);
    audit(session, 'runs', { provider: selection.provider, targetId: selection.targetId });
    const query = new URLSearchParams({ targetId: selection.targetId });
    if (selection.nextToken !== undefined) {
      if (typeof selection.nextToken !== 'string' || !selection.nextToken || selection.nextToken.length > 2048) {
        throw new GuardianError(400, 'guardian_page_invalid', 'Guardian pagination token is invalid.');
      }
      query.set('nextToken', selection.nextToken);
    }
    const result = await call(session, context, `/assessments/${selection.provider}?${query}`);
    if (!Array.isArray(result.runs) || result.runs.length > 1000 || result.runs.some(run =>
      run.provider !== selection.provider || run.targetId !== selection.targetId || !runIdentifier(run.runId)) ||
      !(result.nextToken === null || (typeof result.nextToken === 'string' && result.nextToken.length <= 2048))) {
      throw new GuardianError(502, 'guardian_runs_invalid', 'Guardian returned an invalid run list.');
    }
    return result;
  }

  async function assessment(session, selection) {
    const context = await access(session, selection);
    audit(session, 'fetch', { provider: selection.provider, targetId: selection.targetId, runId: selection.runId });
    const result = await call(session, context, `/assessments/${selection.provider}/${encodeURIComponent(selection.runId)}/${encodeURIComponent(selection.targetId)}`);
    audit(session, 'fetched', { provider: selection.provider, targetId: selection.targetId, runId: selection.runId,
      assessmentHash: result.assessmentHash });
    return result;
  }

  async function preview(session, body) {
    const context = await access(session, body);
    if (!body?.ssp?.['system-security-plan'] || !/^[a-f0-9]{64}$/.test(body.assessmentHash || '') ||
      typeof body.bindUnlinkedAssessment !== 'boolean') {
      throw new GuardianError(400, 'guardian_preview_invalid', 'Select a report and assessment before requesting a preview.');
    }
    if (body.returnPatch !== true || Buffer.byteLength(JSON.stringify(body)) > 1024 * 1024) {
      throw new GuardianError(413, 'guardian_preview_too_large', 'Guardian requires a projected patch request no larger than 1 MiB.');
    }
    audit(session, 'preview', { provider: body.provider, targetId: body.targetId, runId: body.runId,
      sspUuid: body.ssp['system-security-plan'].uuid, assessmentHash: body.assessmentHash });
    return call(session, context, '/ssp/preview', 'POST', {
      provider: body.provider, runId: body.runId, targetId: body.targetId,
      ssp: body.ssp, assessmentHash: body.assessmentHash, bindUnlinkedAssessment: body.bindUnlinkedAssessment,
      returnPatch: true,
    });
  }

  async function finalize(_session, { ssp } = {}) {
    if (!ssp?.['system-security-plan']?.metadata ||
      !Array.isArray(ssp['system-security-plan']['control-implementation']?.['implemented-requirements'])) {
      throw new GuardianError(400, 'guardian_revision_invalid', 'A full OSCAL SSP revision is required.');
    }
    if (Buffer.byteLength(JSON.stringify(ssp)) > GUARDIAN_PREVIEW_BYTES) {
      throw new GuardianError(413, 'guardian_revision_too_large', 'Guardian revision exceeds the 16 MiB local limit.');
    }
    const finalized = addIntegrityHash(globalThis.structuredClone(ssp));
    return { ssp: finalized, documentHash: createHash('sha256').update(JSON.stringify(finalized)).digest('hex') };
  }

  return { status, runs, assessment, preview, finalize, retainGenericSso };
}

export const guardianAssessmentService = createGuardianAssessmentService();
