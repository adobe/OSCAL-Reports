/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { jest, describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import { generateKeyPair, SignJWT } from '../../../backend/node_modules/jose/dist/webapi/index.js';
import { createGuardianService, readGuardianConfig } from '../../../backend/guardianService.js';
import { getDelegatedToken, retainDelegatedToken, revokeDelegatedToken } from '../../../backend/auth/delegatedTokens.js';
import { validateWithSchema } from '../../../backend/oscalValidatorAJV.js';

const config = {
  issuer: 'https://adobe.okta.com/oauth2/test-server',
  jwksUrl: 'https://adobe.okta.com/oauth2/test-server/v1/keys',
  audience: 'urn:test:guardian-api', clientId: 'oscal-test-client', scopes: ['test.apply'],
  targets: [{ id: 'test', label: 'Test target', url: 'https://guardian.amsgovcloud.com.au/test-only',
    method: 'POST', payloadFormat: 'raw-ssp', groups: ['TEST-WRITER'] }],
};
const env = {
  OSCAL_GUARDIAN_ENABLED: 'true', OSCAL_GUARDIAN_ISSUER: config.issuer,
  OSCAL_GUARDIAN_JWKS_URL: config.jwksUrl, OSCAL_GUARDIAN_AUDIENCE: config.audience,
  OSCAL_GUARDIAN_CLIENT_ID: config.clientId, OSCAL_GUARDIAN_SCOPES: 'test.apply',
  OSCAL_GUARDIAN_TARGETS_JSON: JSON.stringify(config.targets),
};
let privateKey, publicKey, session, service, request, validateSsp, audit;

async function token(overrides = {}, signingKey = privateKey) {
  return new SignJWT({ cid: config.clientId, scp: config.scopes, groups: ['TEST-WRITER'], ...overrides })
    .setProtectedHeader({ alg: 'RS256' }).setSubject('test-user').setIssuedAt(overrides.iat ?? Math.floor(Date.now() / 1000))
    .setIssuer(overrides.iss || config.issuer).setAudience(overrides.aud || config.audience)
    .setExpirationTime(overrides.exp ?? Math.floor(Date.now() / 1000) + 300).sign(signingKey);
}

beforeAll(async () => { ({ privateKey, publicKey } = await generateKeyPair('RS256')); });
beforeEach(() => {
  session = { userId: 'opaque-test-id', createdAt: Date.now() };
  request = jest.fn().mockResolvedValue({ status: 202, data: { secret: 'must not return' } });
  validateSsp = jest.fn().mockResolvedValue({ valid: true, validated: true, mode: 'strict' });
  audit = jest.fn();
  service = createGuardianService({ readConfig: () => config, keys: async () => publicKey, request, validateSsp, audit });
});
afterEach(() => { revokeDelegatedToken(session); });

async function signIn(overrides) {
  const accessToken = await token(overrides);
  await service.retain(session, { access_token: accessToken, token_type: 'Bearer', expires_in: 300 });
  return accessToken;
}
const body = () => ({ targetId: 'test', confirmed: true, ssp: { 'system-security-plan': { uuid: 'test-uuid' } } });

describe('Guardian configuration', () => {
  it('is disabled by default', () => expect(readGuardianConfig({})).toBeNull());
  it('accepts explicit complete configuration', () => expect(readGuardianConfig(env)).toEqual(config));
  it.each([
    { OSCAL_GUARDIAN_ISSUER: 'https://adobe.okta.com' },
    { OSCAL_GUARDIAN_ISSUER: 'http://adobe.okta.com/oauth2/test' },
    { OSCAL_GUARDIAN_JWKS_URL: 'https://untrusted.example/keys' },
    { OSCAL_GUARDIAN_AUDIENCE: config.clientId },
    { OSCAL_GUARDIAN_SCOPES: '' },
    { OSCAL_GUARDIAN_TARGETS_JSON: 'invalid JSON' },
    { OSCAL_GUARDIAN_TARGETS_JSON: '[]' },
    ...[
      { url: 'http://guardian.amsgovcloud.com.au/test' },
      { url: 'https://other.example/test' },
      { url: 'https://guardian.amsgovcloud.com.au/' },
      { method: 'GET' }, { payloadFormat: 'unconfirmed-envelope' },
      { groups: [] }, { groups: ['GRP-TECHGRC-ALL'] }, { id: '../escape' },
    ].map(change => ({ OSCAL_GUARDIAN_TARGETS_JSON: JSON.stringify([{ ...config.targets[0], ...change }]) })),
  ])('fails closed for unsupported/incomplete configuration %j', change => {
    expect(() => readGuardianConfig({ ...env, ...change })).toThrow();
  });
});

describe('Guardian delegated tokens and calls', () => {
  it('does not retain tokens while disabled', async () => {
    const disabled = createGuardianService({ readConfig: () => null });
    await disabled.retain(session, { access_token: 'not-retained' });
    expect(getDelegatedToken(session)).toBeNull();
    expect((await disabled.status(session)).code).toBe('guardian_unavailable');
    await expect(disabled.apply(session, body())).rejects.toMatchObject({ status: 503 });
  });
  it('retains only server-side and returns authorized target metadata', async () => {
    const accessToken = await signIn();
    expect(getDelegatedToken(session)).toBe(accessToken);
    expect(JSON.stringify(session)).not.toContain(accessToken);
    expect(await service.status(session)).toEqual({ ready: true, targets: [{ id: 'test', label: 'Test target' }] });
  });
  it.each([
    { iss: 'https://wrong.example/oauth2/test' }, { aud: config.clientId },
    { exp: Math.floor(Date.now() / 1000) - 30 }, { cid: 'other-client' },
    { iat: Math.floor(Date.now() / 1000) + 60 },
  ])('rejects invalid access-token claims %j', async change => {
    await expect(signIn(change)).rejects.toMatchObject({ status: 401 });
    expect(getDelegatedToken(session)).toBeNull();
  });
  it('rejects a token signed by a different key', async () => {
    const other = await generateKeyPair('RS256');
    await expect(service.retain(session, { access_token: await token({}, other.privateKey),
      token_type: 'Bearer', expires_in: 300 })).rejects.toMatchObject({ status: 401 });
  });
  it.each([{ scp: [] }, { groups: 'TEST-WRITER' }, { groups: undefined }])('rejects absent scopes/groups %j', async change => {
    await expect(signIn(change)).rejects.toMatchObject({ status: 403 });
  });
  it('rejects ID/session/opaque token input and unknown token type', async () => {
    for (const access_token of ['oscal-session-token', 'opaque', 'x.y.z']) {
      await expect(service.retain(session, { access_token, token_type: 'Bearer', expires_in: 300 })).rejects.toMatchObject({ status: 401 });
    }
    await expect(service.retain(session, { access_token: await token(), token_type: 'unknown', expires_in: 300 })).rejects.toMatchObject({ status: 401 });
  });
  it('does not authorize broad login-group membership or request-body groups', async () => {
    await signIn({ groups: ['GRP-TECHGRC-ALL'] });
    expect((await service.status(session)).targets).toEqual([]);
    await expect(service.apply(session, { ...body(), groups: ['TEST-WRITER'] })).rejects.toMatchObject({ status: 403 });
    expect(request).not.toHaveBeenCalled();
  });
  it('does not share delegated credentials between sessions', async () => {
    await signIn();
    await expect(service.apply({ createdAt: Date.now() }, body())).rejects.toMatchObject({ status: 401 });
  });
  it('requires confirmation and a configured target', async () => {
    await signIn();
    await expect(service.apply(session, { ...body(), confirmed: false })).rejects.toMatchObject({ status: 400 });
    await expect(service.apply(session, { ...body(), targetId: 'https://attacker.example' })).rejects.toMatchObject({ status: 403 });
    expect(request).not.toHaveBeenCalled();
  });
  it.each([{}, [], null])('rejects malformed SSP %j', async ssp => {
    await signIn();
    await expect(service.apply(session, { ...body(), ssp })).rejects.toMatchObject({ status: 400 });
  });
  it('rejects oversized SSP before validation/dispatch', async () => {
    await signIn();
    await expect(service.apply(session, { ...body(), ssp: { 'system-security-plan': { description: 'x'.repeat(2 * 1024 * 1024) } } })).rejects.toMatchObject({ status: 413 });
    expect(validateSsp).not.toHaveBeenCalled();
  });
  it.each([
    { valid: false, validated: true, mode: 'strict' },
    { valid: true, validated: false, mode: 'strict' },
    { valid: true, validated: true, mode: 'permissive' },
    { valid: true, validated: true, mode: 'strict', warning: 'No schema available' },
  ])('rejects unvalidated/permissive SSP %j', async result => {
    await signIn();
    validateSsp.mockResolvedValue(result);
    await expect(service.apply(session, body())).rejects.toMatchObject({ status: 400 });
    expect(request).not.toHaveBeenCalled();
  });
  it('forwards the verified OAuth token, not an OSCAL session token, without exposing upstream contents', async () => {
    const accessToken = await signIn();
    const result = await service.apply(session, body());
    expect(result).toMatchObject({ success: true, upstreamStatus: 202 });
    expect(request.mock.calls[0][0]).toMatchObject({ method: 'POST', url: config.targets[0].url,
      data: JSON.stringify(body().ssp), headers: { Authorization: `Bearer ${accessToken}` } });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(audit.mock.calls)).not.toContain(accessToken);
    expect(JSON.stringify(audit.mock.calls)).not.toContain('test-uuid');
  });
  it('reports unknown write outcomes without leaking errors or retrying', async () => {
    await signIn();
    request.mockRejectedValue(new Error('secret authorization data'));
    await expect(service.apply(session, body())).rejects.toMatchObject({ status: 502, code: 'guardian_apply_unconfirmed' });
    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(audit.mock.calls)).not.toContain('secret');
  });
  it('rechecks revoked tokens just before dispatch', async () => {
    await signIn();
    validateSsp.mockImplementation(async () => { revokeDelegatedToken(session); return { valid: true, validated: true, mode: 'strict' }; });
    await expect(service.apply(session, body())).rejects.toMatchObject({ status: 401 });
    expect(request).not.toHaveBeenCalled();
  });
  it('clears revoked and expired tokens', async () => {
    await signIn();
    revokeDelegatedToken(session);
    expect(getDelegatedToken(session)).toBeNull();
    retainDelegatedToken(session, 'expired', Date.now() - 1);
    expect(getDelegatedToken(session)).toBeNull();
  });
  it('removes expired tokens proactively using the expiry timer', () => {
    jest.useFakeTimers();
    try {
      retainDelegatedToken(session, 'short-lived', Date.now() + 100);
      expect(getDelegatedToken(session)).toBe('short-lived');
      jest.advanceTimersByTime(101);
      expect(getDelegatedToken(session)).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
  it('rejects extra document roots before dispatch', async () => {
    await signIn();
    await expect(service.apply(session, { ...body(), ssp: { ...body().ssp, extra: true } })).rejects.toMatchObject({ status: 400 });
    expect(request).not.toHaveBeenCalled();
  });
  it('uses the real strict schema validator to reject an incomplete SSP', async () => {
    await signIn();
    const actualValidation = createGuardianService({ readConfig: () => config,
      keys: async () => publicKey, request, validateSsp: validateWithSchema, audit });
    await expect(actualValidation.apply(session, body())).rejects.toMatchObject({ status: 400 });
    expect(request).not.toHaveBeenCalled();
  });
  it('rejects overlapping applies for a session and releases the lock afterwards', async () => {
    await signIn();
    let release;
    let started;
    const dispatched = new Promise(resolve => { started = resolve; });
    request.mockImplementationOnce(() => {
      started();
      return new Promise(resolve => { release = resolve; });
    });
    const first = service.apply(session, body());
    await dispatched;
    await expect(service.apply(session, body())).rejects.toMatchObject({ status: 409 });
    release({ status: 200 });
    await first;
    await expect(service.apply(session, body())).resolves.toMatchObject({ success: true });
  });
});