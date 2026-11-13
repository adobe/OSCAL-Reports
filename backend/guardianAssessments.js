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
import { GENERIC_OIDC_PROVIDER_ID, genericSsoUrlsFromIssuer } from './auth/genericOidc.js';
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
  'the Generic SSO issuer reachable from AWS; the OSCAL client ID; and the assessment plan reference.';
// `problem` is a fixed description naming the setting at fault (never a value), so an owner can fix it directly.
const unavailable = problem => new GuardianError(503, 'guardian_assessments_unavailable',
  `Guardian assessment retrieval is disabled or not configured. ${problem ? `Problem: ${problem}. ` : ''}${PREREQUISITES}`);
const TARGETS_PROBLEM = 'OSCAL_GUARDIAN_ASSESSMENT_TARGETS_JSON is missing or not a valid JSON array of targets ' +
  '(a shell that loaded .env may have stripped its quotes: wrap the value in single quotes)';
const GENERIC_PROBLEM = 'the Generic SSO issuer, client ID or scope (OSCAL_GENERIC_SSO_ISSUER, OSCAL_GENERIC_SSO_CLIENT_ID, ' +
  'OSCAL_GUARDIAN_GENERIC_SSO_SCOPE) is missing or invalid';
const keepProblem = (error, fallback) => (error?.code === 'guardian_assessments_unavailable' ? error : unavailable(fallback));

export function readGuardianAssessmentConfig(env = process.env) {
  if (env.OSCAL_GUARDIAN_ASSESSMENTS_ENABLED !== 'true') { return null; }
  try {
    // Okta identity settings are optional when only the Generic SSO (Authentik) path is configured.
    let identity = {};
    try { identity = readGuardianIdentityConfig(env); } catch (error) {
      if (!env.OSCAL_GUARDIAN_GENERIC_SSO_ISSUER && !env.OSCAL_GENERIC_SSO_ISSUER) { throw error; }
    }
    const local = env.NODE_ENV === 'development' && env.OSCAL_GUARDIAN_LOCAL_GATEWAY === 'true';
    // Owner-supplied exact hostnames (for example the execute-api hosts from Guardian's assessment_api_endpoints
    // output). No wildcards and no built-in default: nothing is allowed until the owners configure it.
    const hosts = (env.OSCAL_GUARDIAN_ASSESSMENTS_ALLOWED_HOSTS || '').split(',').map(host => host.trim().toLowerCase())
      .filter(Boolean);
    if (hosts.some(host => !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host))) {
      throw unavailable('OSCAL_GUARDIAN_ASSESSMENTS_ALLOWED_HOSTS contains an invalid host name');
    }
    const endpoint = (value, name) => {
      const bad = () => unavailable(`${name} must be an https URL ending in /v1/guardian whose host is listed in ` +
        'OSCAL_GUARDIAN_ASSESSMENTS_ALLOWED_HOSTS (OSCAL_GUARDIAN_ASSESSMENTS_ALLOWED_HOSTS)');
      let url;
      try { url = new URL(value); } catch { throw bad(); }
      const isLocal = local && url.protocol === 'http:' && url.hostname === '127.0.0.1';
      if (!isLocal && (url.protocol !== 'https:' || !hosts.includes(url.hostname) ||
        (url.port && url.port !== '443'))) { throw bad(); }
      if (url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/v1/guardian')) { throw bad(); }
      return { href: url.href, local: isLocal };
    };
    // Guardian serves each approved issuer on its own API endpoint. The primary (Okta) endpoint is optional so an
    // Authentik-only first deployment can leave it unset; the unset path then stays "not configured".
    const primary = env.OSCAL_GUARDIAN_ASSESSMENTS_URL ? endpoint(env.OSCAL_GUARDIAN_ASSESSMENTS_URL, 'OSCAL_GUARDIAN_ASSESSMENTS_URL') : null;
    const generic = env.OSCAL_GUARDIAN_GENERIC_SSO_ASSESSMENTS_URL
      ? endpoint(env.OSCAL_GUARDIAN_GENERIC_SSO_ASSESSMENTS_URL, 'OSCAL_GUARDIAN_GENERIC_SSO_ASSESSMENTS_URL') : primary;
    const configured = [primary, generic].filter(Boolean);
    // A real endpoint must never be reached through the unpinned local request path.
    if (!configured.length) { throw unavailable('OSCAL_GUARDIAN_GENERIC_SSO_ASSESSMENTS_URL is not set'); }
    if (configured.some(item => item.local !== configured[0].local)) {
      throw unavailable('a loopback and a real Guardian endpoint are both set (OSCAL_GUARDIAN_ASSESSMENTS_URL, OSCAL_GUARDIAN_GENERIC_SSO_ASSESSMENTS_URL)');
    }
    let targets;
    // 'docker run --env-file' keeps a surrounding pair of single quotes literally; accept it.
    const rawTargets = (env.OSCAL_GUARDIAN_ASSESSMENT_TARGETS_JSON || '[]').trim().replace(/^'([\s\S]*)'$/, '$1');
    try { targets = JSON.parse(rawTargets); } catch { throw unavailable(TARGETS_PROBLEM); }
    if (!Array.isArray(targets) || !targets.length || targets.length > 100) { throw unavailable(TARGETS_PROBLEM); }
    const seen = new Set();
    for (const target of targets) {
      const key = `${target.provider}/${target.targetId}`;
      if (!['cloudflare', 'okta'].includes(target.provider) || !identifier(target.targetId) || seen.has(key) ||
        typeof target.label !== 'string' || !target.label.trim() || target.label.length > 120 ||
        !Array.isArray(target.groups) || !target.groups.length ||
        target.groups.some(group => typeof group !== 'string' || !group.trim() ||
          group !== group.trim() || group.toUpperCase() === 'GRP-TECHGRC-ALL')) { throw unavailable(TARGETS_PROBLEM); }
      seen.add(key);
    }
    return { ...identity, url: primary?.href, genericUrl: generic?.href, local: configured[0].local, targets };
  } catch (error) {
    throw keepProblem(error, 'a Guardian assessment setting is missing or invalid (OSCAL_GUARDIAN_ASSESSMENTS_ENABLED, ' +
      'OSCAL_GUARDIAN_GENERIC_SSO_ASSESSMENTS_URL, OSCAL_GENERIC_SSO_ISSUER or the Okta identity settings)');
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
  // The shared OSCAL_GENERIC_SSO_* settings drive sign-in too; the Guardian-specific names are optional overrides.
  const issuer = env.OSCAL_GUARDIAN_GENERIC_SSO_ISSUER || env.OSCAL_GENERIC_SSO_ISSUER;
  if (!issuer) { return null; }
  // A shared sign-in issuer alone must not switch the Guardian path on: it needs its own scope to be approved.
  if (!env.OSCAL_GUARDIAN_GENERIC_SSO_ISSUER && !env.OSCAL_GUARDIAN_GENERIC_SSO_SCOPE?.trim()) { return null; }
  try {
    const issuerUrl = new URL(issuer);
    const jwksUrl = new URL(env.OSCAL_GUARDIAN_GENERIC_SSO_JWKS_URL || genericSsoUrlsFromIssuer(issuer)?.jwksUrl);
    const clientId = (env.OSCAL_GUARDIAN_GENERIC_SSO_CLIENT_ID || env.OSCAL_GENERIC_SSO_CLIENT_ID)?.trim();
    const scope = env.OSCAL_GUARDIAN_GENERIC_SSO_SCOPE?.trim();
    if (issuerUrl.protocol !== 'https:' || jwksUrl.protocol !== 'https:' || jwksUrl.origin !== issuerUrl.origin ||
      issuerUrl.port || issuerUrl.username || issuerUrl.search || issuerUrl.hash || jwksUrl.search ||
      !clientId || !scope || /\s/.test(scope)) { throw unavailable(GENERIC_PROBLEM); }
    return { issuer, jwksUrl: jwksUrl.href, audience: clientId, scope };
  } catch (error) {
    throw keepProblem(error, GENERIC_PROBLEM);
  }
}

// Safe, enumerated failure reason for logs: never token text, claim values or error messages.
function genericSsoRejection(error, reason) {
  if (reason) { return reason; }
  // Signing-key fetch problems (not a bad token): the host resolves to a non-public address, or cannot be reached.
  if (error?.reason === 'host_not_public') { return 'jwks_host_not_public'; }
  if (/^(ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|EAI_AGAIN|ECONNABORTED)$/.test(error?.code || '')) {
    return 'jwks_unreachable';
  }
  const code = /^ERR_[A-Z_]+$/.test(error?.code || '') ? error.code : 'token_rejected';
  const claim = /^[a-z_]{1,16}$/.test(error?.claim || '') ? `_${error.claim}` : '';
  return `jwt_${code}${claim}`.replace('jwt_token_rejected', 'token_rejected');
}

// Guardian rejects an access token issued more than this long ago, or whose own lifetime (exp - iat) is longer
// (its contract: max token age 600 s, owner-raisable up to 3600 s).
export function genericMaxTokenAgeSeconds(env = process.env) {
  const value = Number(env.OSCAL_GUARDIAN_GENERIC_SSO_MAX_TOKEN_AGE_SECONDS);
  return Number.isInteger(value) && value >= 60 && value <= 3600 ? value : 600;
}
const minutes = seconds => `${Math.round(seconds / 60)} minute${Math.round(seconds / 60) === 1 ? '' : 's'}`;
const signInAgain = () => `Your Generic SSO sign-in is no longer valid for Guardian: Guardian accepts a token for only ` +
  `${minutes(genericMaxTokenAgeSeconds())}. Sign out, sign in again, then fetch within ${minutes(genericMaxTokenAgeSeconds())}.`;
// Sessions whose Authentik access token lives longer than Guardian accepts (numbers only, never the token).
const tokenProblems = new WeakMap();
const lifetimeMessage = ({ lifetimeSeconds, maxSeconds }) => `Authentik issues access tokens that live ${lifetimeSeconds} seconds, ` +
  `but Guardian accepts at most ${maxSeconds} seconds, so every token is rejected. Ask the Authentik owner to set the ` +
  `provider's Access token validity to ${minutes(maxSeconds)} or less (or Guardian's owner to raise the limit), then sign out and in again.`;

// When to stop holding the token: its own expiry, the IdP lifetime, the session, and Guardian's token age limit.
export function genericTokenExpiry({ payload, lifetimeSeconds, sessionCreatedAt, now = Date.now(), maxAgeSeconds = genericMaxTokenAgeSeconds() }) {
  return Math.min(payload.exp * 1000, now + lifetimeSeconds * 1000, sessionCreatedAt + 86400000,
    payload.iat * 1000 + maxAgeSeconds * 1000 - 5000);
}

async function verifyGenericSso(token, config, privileged, keys) {
  let reason;
  try {
    const { payload } = await jwtVerify(token, await keys(config), {
      issuer: config.issuer, audience: config.audience, algorithms: ['RS256'],
      requiredClaims: ['sub', 'iat', 'exp'], clockTolerance: 5, maxTokenAge: `${genericMaxTokenAgeSeconds()}s`,
    });
    const scopes = typeof payload.scope === 'string' ? payload.scope.split(/\s+/) : [];
    const failed = payload.iat > Date.now() / 1000 + 5 ? 'issued_in_future'
      : !scopes.includes(config.scope) ? 'scope_missing'
        : !Array.isArray(payload.groups) ? 'groups_claim_missing'
          : !matchingGroups(payload.groups, privilegedGroups()).length ? 'no_privileged_group' : null;
    if (failed) { reason = failed; throw new Error(failed); }
    return payload;
  } catch (error) {
    const rejection = new GuardianError(401, 'guardian_reauthentication_required', 'Sign in again with Generic SSO.');
    rejection.reason = genericSsoRejection(error, reason);
    throw rejection;
  }
}

// Untranslated upstream failure: the HTTP status plus Guardian's own short message, only when it is plain text.
function upstreamDetail(response) {
  const message = response?.data?.message;
  const plain = typeof message === 'string' && message.length <= 120 && /^[A-Za-z0-9 .,:;'()/_-]+$/.test(message);
  return `HTTP ${Number(response?.status) || 'error'}${plain ? `: ${message}` : ''}`;
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
      if (!token) {
        const problem = tokenProblems.get(session);
        throw new GuardianError(401, 'guardian_reauthentication_required', problem || signInAgain());
      }
      const payload = await verifyGenericSso(token, generic, privileged, keys);
      return { token, payload: { groups: payload.groups } };
    }
    if (!config.issuer || !config.url) { throw unavailable(); }
    return authorize(session, config);
  }

  async function access(session, selection) {
    const config = readConfig();
    if (!config) { throw unavailable('OSCAL_GUARDIAN_ASSESSMENTS_ENABLED is not set to true'); }
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
          401: context.privileged ? signInAgain() : 'Guardian requires a fresh approved Okta sign-in.',
          403: 'Guardian denied access to this assessment.',
          404: 'Guardian selection is missing or not authorized.',
          409: 'Guardian assessment data, SSP linkage or target binding conflicts. Refresh and verify the selection.',
          413: 'The report or preview exceeds the Guardian API payload limit.',
          503: 'Guardian assessment storage or authorization is not configured.',
        };
        const known = Boolean(messages[response.status]);
        // Service-side failures keep the HTTP status (and Guardian's short message) in the text.
        const serviceFailures = {
          500: 'Guardian assessment service reported an internal error',
          502: 'Guardian assessment service returned a bad gateway response',
          504: 'Guardian assessment service timed out',
        };
        const failure = new GuardianError(known ? response.status : 502, 'guardian_assessment_request_failed',
          messages[response.status] ||
          `${serviceFailures[response.status] || 'Guardian assessment request failed'} (${upstreamDetail(response)}).`);
        failure.upstreamStatus = response.status;
        throw failure;
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
  function targetGroupsMatch(groups) {
    try { return readConfig().targets.some(target => target.groups.some(group => groups.includes(group))); } catch { return false; }
  }

  async function retainGenericSso(session, tokenResponse) {
    const generic = readGenericSso();
    const privileged = privilegedIdentity(session);
    if (!generic || !privileged || !session) { return; }
    const lifetime = Number(tokenResponse?.expires_in);
    if (tokenResponse?.token_type?.toLowerCase() !== 'bearer' || !Number.isFinite(lifetime) || lifetime <= 0) { return; }
    let payload;
    try {
      payload = await verifyGenericSso(tokenResponse.access_token, generic, privileged, keys);
    } catch (error) {
      const host = new URL(generic.jwksUrl).hostname;
      if (error.reason === 'jwks_host_not_public') {
        tokenProblems.set(session, `OSCAL could not fetch the signing keys from ${host} because this server resolves it to a non-public address ` +
          '(often DNS rewriting or a private DNS answer). Ask the administrator to make this server resolve the SSO host to its public ' +
          'address (the container or host DNS setting), then sign out and in again.');
      } else if (error.reason === 'jwks_unreachable') {
        tokenProblems.set(session, `OSCAL could not reach ${host} to fetch the signing keys. Check the network, DNS and firewall from this ` +
          'server, then sign out and in again.');
      }
      throw error;
    }
    const tokenLifetime = payload.exp - payload.iat;
    const maxSeconds = genericMaxTokenAgeSeconds();
    if (tokenLifetime > maxSeconds) {
      const message = lifetimeMessage({ lifetimeSeconds: tokenLifetime, maxSeconds });
      tokenProblems.set(session, message);
      const rejection = new GuardianError(401, 'guardian_reauthentication_required', message);
      rejection.reason = 'lifetime_too_long';
      rejection.tokenLifetimeSeconds = tokenLifetime;
      throw rejection;
    }
    tokenProblems.delete(session);
    console.info(JSON.stringify({
      'service.name': 'oscal-report-generator', severity: 'INFO', 'event.action': 'guardian_generic_sso_token_retention',
      'event.outcome': 'success', 'token.lifetime_seconds': tokenLifetime, 'token.max_age_seconds': maxSeconds,
      // Group names only (never the token): shows whether the ACCESS token carries a group Guardian can grant.
      'token.group_count': payload.groups.length,
      'token.privileged_groups': matchingGroups(payload.groups, privilegedGroups()).slice(0, 10).map(group => group.slice(0, 100)),
      'token.groups': payload.groups.filter(group => typeof group === 'string').slice(0, 50).map(group => group.slice(0, 100)),
      'token.groups_truncated': payload.groups.length > 50,
      'token.matches_target_group': targetGroupsMatch(payload.groups),
    }));
    retainDelegatedToken(session, tokenResponse.access_token,
      genericTokenExpiry({ payload, lifetimeSeconds: lifetime, sessionCreatedAt: session.createdAt, maxAgeSeconds: maxSeconds }));
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
      console.warn(JSON.stringify({
        'service.name': 'oscal-report-generator', severity: 'WARN', 'event.action': 'guardian_assessment_status',
        'event.outcome': 'failure', reason: error.code, ...(error.upstreamStatus ? { 'http.response.status_code': error.upstreamStatus } : {}),
      }));
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
