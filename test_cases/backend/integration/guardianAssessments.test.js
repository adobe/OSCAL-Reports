/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs';
import express from '../../../backend/node_modules/express/index.js';
import request from '../../../backend/node_modules/supertest/index.js';
import { createGuardianAssessmentService, readGuardianAssessmentConfig,
  registerLocalDevAuthorization, privilegedIdentity, readGenericSsoConfig } from '../../../backend/guardianAssessments.js';
import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from '../../../backend/node_modules/jose/dist/webapi/index.js';
import { retainDelegatedToken as retainToken } from '../../../backend/auth/delegatedTokens.js';
import { recordIdpIdentity } from '../../../backend/auth/idpIdentity.js';
import { guardianDownloadName } from '../../../frontend/src/utils/guardianRevisions.js';
import { guardianJsonMiddleware, registerGuardianRoutes } from '../../../backend/guardianRoutes.js';
import { retainDelegatedToken, revokeDelegatedToken } from '../../../backend/auth/delegatedTokens.js';
import { sha256Json } from '../../../frontend/src/services/guardianLocalContract.js';
import { projectGuardianReport, validateGuardianAssessment, validateGuardianPreview,
  validateGuardianPatch } from '../../../frontend/src/services/guardianAssessmentContract.js';

const selection = { provider: 'cloudflare', targetId: 'TEST_ONLY', runId: 'test-run' };
const config = {
  issuer: 'https://test.example/oauth2/test', jwksUrl: 'https://test.example/oauth2/test/keys',
  audience: 'test-resource', clientId: 'test-client', scopes: ['test-scope'],
  url: 'https://guardian.amsgovcloud.com.au/v1/guardian', local: false,
  targets: [{ ...selection, label: 'Test only target', groups: ['TEST-WRITER'] }],
};
const env = {
  OSCAL_GUARDIAN_ASSESSMENTS_ENABLED: 'true', OSCAL_GUARDIAN_ISSUER: config.issuer,
  OSCAL_GUARDIAN_JWKS_URL: config.jwksUrl, OSCAL_GUARDIAN_AUDIENCE: config.audience,
  OSCAL_GUARDIAN_CLIENT_ID: config.clientId, OSCAL_GUARDIAN_SCOPES: 'test-scope',
  OSCAL_GUARDIAN_ASSESSMENTS_URL: config.url, OSCAL_GUARDIAN_ASSESSMENTS_ALLOWED_HOSTS: 'guardian.amsgovcloud.com.au',
  OSCAL_GUARDIAN_ASSESSMENT_TARGETS_JSON: JSON.stringify(config.targets),
};
let session, upstream, service, app;
beforeEach(() => {
  session = { userId: 'test-user' };
  retainDelegatedToken(session, 'test-only-token', Date.now() + 60000);
  upstream = jest.fn().mockResolvedValue({ status: 200, data: { contractVersion: '1' } });
  service = createGuardianAssessmentService({
    readConfig: () => config,
    authorize: async () => ({ token: 'test-only-token', payload: { groups: ['TEST-WRITER'] } }),
    request: upstream,
  });
  app = express();
  app.use('/api/guardian', guardianJsonMiddleware);
  registerGuardianRoutes(app, (req, res, next) => {
    if (req.headers.authorization !== 'Bearer test-session') { return res.sendStatus(401); }
    req.user = session;
    next();
  }, {}, service);
});
afterEach(() => revokeDelegatedToken(session));

describe('real Guardian assessment adapter', () => {
  it('is disabled by default and validates explicit transport/target configuration', () => {
    expect(readGuardianAssessmentConfig({})).toBeNull();
    expect(readGuardianAssessmentConfig(env).targets).toEqual(config.targets);
    for (const change of [
      { OSCAL_GUARDIAN_ASSESSMENTS_URL: 'https://attacker.example/v1/guardian' },
      { OSCAL_GUARDIAN_ASSESSMENTS_URL: 'http://127.0.0.1:8768/v1/guardian' },
      { NODE_ENV: 'production', OSCAL_GUARDIAN_LOCAL_GATEWAY: 'true',
        OSCAL_GUARDIAN_ASSESSMENTS_URL: 'http://127.0.0.1:8768/v1/guardian' },
      { OSCAL_GUARDIAN_ASSESSMENT_TARGETS_JSON: JSON.stringify([{ ...config.targets[0], groups: ['GRP-TECHGRC-ALL'] }]) },
    ]) {
      expect(() => readGuardianAssessmentConfig({ ...env, ...change })).toThrow();
    }
    expect(readGuardianAssessmentConfig({ ...env, NODE_ENV: 'development', OSCAL_GUARDIAN_LOCAL_GATEWAY: 'true',
      OSCAL_GUARDIAN_ASSESSMENTS_URL: 'http://127.0.0.1:8768/v1/guardian' }).local).toBe(true);
  });
  it('requires normal OSCAL authentication for every read and preview', async () => {
    for (const path of ['status', 'runs', 'result']) {
      expect((await request(app).get(`/api/guardian/assessments/${path}`)).status).toBe(401);
    }
    expect((await request(app).post('/api/guardian/assessments/preview').send({})).status).toBe(401);
  });
  it('returns readiness and only authorized labels, never tokens or endpoint URLs', async () => {
    upstream.mockResolvedValue({ status: 200, data: { contractVersion: '1', assessmentRead: true,
      sspPreview: true, providers: ['cloudflare'] } });
    const response = await request(app).get('/api/guardian/assessments/status').set('Authorization', 'Bearer test-session');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({ ready: true, targets: [{ provider: selection.provider,
      targetId: selection.targetId, label: 'Test only target' }] });
    expect(JSON.stringify(response.body)).not.toContain('test-only-token');
    expect(JSON.stringify(response.body)).not.toContain(config.url);
  });
  it('preserves empty real-run lists and pagination without substituting fixtures', async () => {
    upstream.mockResolvedValue({ status: 200, data: { contractVersion: '1', runs: [], nextToken: null } });
    expect(await service.runs(session, selection)).toEqual({ contractVersion: '1', runs: [], nextToken: null });
    upstream.mockResolvedValue({ status: 200, data: { contractVersion: '1',
      runs: [{ ...selection, sspUuid: null, generatedAt: '2026-11-10T00:00:00Z' }], nextToken: 'next-page' } });
    const result = await service.runs(session, { ...selection, nextToken: 'cursor+one' });
    expect(result.nextToken).toBe('next-page');
    expect(upstream.mock.calls.at(-1)[0].url).toContain('nextToken=cursor%2Bone');
  });
  it('rejects unauthorized targets, path injection and upstream cross-target rows', async () => {
    await expect(service.assessment(session, { ...selection, targetId: 'other' })).rejects.toMatchObject({ status: 404 });
    await expect(service.assessment(session, { ...selection, runId: '../escape' })).rejects.toMatchObject({ status: 404 });
    expect(upstream).not.toHaveBeenCalled();
    upstream.mockResolvedValue({ status: 200, data: { contractVersion: '1',
      runs: [{ ...selection, targetId: 'other' }], nextToken: null } });
    await expect(service.runs(session, selection)).rejects.toMatchObject({ status: 502 });
  });
  it('rechecks session token revocation before dispatch and sanitizes unexpected failures', async () => {
    revokeDelegatedToken(session);
    await expect(service.assessment(session, selection)).rejects.toMatchObject({ status: 401 });
    expect(upstream).not.toHaveBeenCalled();
    retainDelegatedToken(session, 'test-only-token', Date.now() + 60000);
    upstream.mockRejectedValue(new Error('private upstream content must not leak'));
    await expect(service.assessment(session, selection)).rejects.toMatchObject({
      status: 502, message: 'Guardian could not be reached. No report changes were applied.',
    });
  });
  it('does not convert storage/auth conflicts or oversized previews to success', async () => {
    for (const status of [403, 404, 409, 413, 503]) {
      upstream.mockResolvedValue({ status, data: { private: 'do not expose' } });
      await expect(service.assessment(session, selection)).rejects.toMatchObject({ status });
    }
  });
  it('finalizes large full reports locally but refuses to forward them to the bounded provider', async () => {
    const ssp = { 'system-security-plan': { uuid: 'test', description: 'x'.repeat(5 * 1024 * 1024) } };
    const response = await request(app).post('/api/guardian/assessments/preview').set('Authorization', 'Bearer test-session')
      .send({ ...selection, ssp, assessmentHash: 'a'.repeat(64), bindUnlinkedAssessment: false, returnPatch: true });
    expect(response.status).toBe(413);
    expect(upstream).not.toHaveBeenCalled();
    ssp['system-security-plan'].metadata = { props: [] };
    ssp['system-security-plan']['control-implementation'] = { 'implemented-requirements': [] };
    const finalized = await request(app).post('/api/guardian/assessments/finalize').set('Authorization', 'Bearer test-session').send({ ssp });
    expect(finalized.status).toBe(200);
    expect(finalized.body.documentHash).toBe(await sha256Json(finalized.body.ssp));
    const oldApply = await request(app).post('/api/guardian/apply').set('Authorization', 'Bearer test-session').send({ ssp });
    expect(oldApply.status).toBe(413);
  });
});

function sourceReport() {
  if (process.env.GUARDIAN_ACCEPTANCE_REPORT) {
    return JSON.parse(fs.readFileSync(process.env.GUARDIAN_ACCEPTANCE_REPORT, 'utf8'));
  }
  return { 'system-security-plan': {
    uuid: 'test-ssp', metadata: { title: 'Test only SSP' },
    'control-implementation': { description: 'Keep implementation narrative',
      'implemented-requirements': [
        { 'control-id': 'ism-0001', description: 'Keep control narrative',
          props: [{ name: 'implementation-status', value: 'not-assessed' }] },
        { 'control-id': 'ism-9999', description: 'Keep unmatched narrative', props: [] },
      ] },
  } };
}

describe('consumer assessment and stateless preview validation', () => {
  it('verifies assessment identity, content hash and OSCAL output', async () => {
    const ssp = sourceReport();
    const assessment = { tentacle: selection.provider, 'run-id': selection.runId, 'target-id': selection.targetId,
      'ssp-uuid': ssp['system-security-plan'].uuid, 'snapshot-meta': { truncated: false, evaluationReliable: true },
      findings: [{ 'control-id': ssp['system-security-plan']['control-implementation']['implemented-requirements'][0]['control-id'],
        status: 'Effective', evidence: ['Test-only evidence'] }] };
    const body = { contractVersion: '1', assessment, assessmentHash: await sha256Json(assessment),
      oscal: { 'assessment-results': { uuid: 'test-assessment-results' } } };
    expect((await validateGuardianAssessment(body, selection, ssp)).identityLinked).toBe(true);
    // Additive, same-version fields are ignored; a different contract version is refused.
    expect((await validateGuardianAssessment({ ...body, futureField: { added: true } }, selection, ssp)).identityLinked).toBe(true);
    await expect(validateGuardianAssessment({ ...body, contractVersion: '2' }, selection, ssp)).rejects.toThrow();
    await expect(validateGuardianAssessment({ ...body, assessmentHash: 'a'.repeat(64) }, selection, ssp)).rejects.toThrow('hash');
    await expect(validateGuardianAssessment(body, { ...selection, runId: 'different' }, ssp)).rejects.toThrow('identity');
  });
  it('judges reliability like Guardian: complete coverage, flag absent is accepted, unreliable is not', async () => {
    const ssp = sourceReport();
    const reliable = async meta => {
      const assessment = { tentacle: selection.provider, 'run-id': selection.runId, 'target-id': selection.targetId,
        'snapshot-meta': meta, findings: [{ 'control-id': ssp['system-security-plan']['control-implementation']['implemented-requirements'][0]['control-id'],
          status: 'Effective', evidence: ['Test-only evidence'] }] };
      const body = { contractVersion: '1', assessment, assessmentHash: await sha256Json(assessment),
        oscal: { 'assessment-results': { uuid: 'test-assessment-results' } } };
      return (await validateGuardianAssessment(body, selection, ssp)).reliable;
    };
    // Shapes of the real cached Cloudflare and Okta run files: no evaluationReliable field.
    expect(await reliable({ zonesScanned: 9, zonesTotal: 9, truncated: false, strict: true })).toBe(true);
    expect(await reliable({ truncated: false, errorCount: 0, strict: true })).toBe(true);
    expect(await reliable({ truncated: false, evaluationReliable: true })).toBe(true);
    expect(await reliable({ truncated: false, evaluationReliable: false })).toBe(false);
    expect(await reliable({ truncated: true })).toBe(false);
    expect(await reliable({ evaluationReliable: true })).toBe(false);
    expect(await reliable({ truncated: false, errorCount: 2 })).toBe(false);
    expect(await reliable({ truncated: false, zonesScanned: 8, zonesTotal: 9 })).toBe(false);
  });
  it('preserves every source control and narrative, including the user acceptance report when supplied', async () => {
    const source = sourceReport();
    const original = JSON.stringify(source);
    const ssp = structuredClone(source);
    const rows = ssp['system-security-plan']['control-implementation']['implemented-requirements'];
    const before = structuredClone(rows[0].props || []);
    rows[0].props = rows[0].props.filter(prop => prop.name !== 'implementation-status');
    rows[0].props.push({ name: 'implementation-status', value: 'effective' });
    const body = { contractVersion: '1', ssp, inputHash: await sha256Json(source),
      outputHash: await sha256Json(ssp), assessmentHash: 'b'.repeat(64), updated: 1,
      changes: [{ controlId: rows[0]['control-id'], before, after: rows[0].props }] };
    expect(await validateGuardianPreview(body, source, body.assessmentHash)).toBe(body);
    expect(JSON.stringify(source)).toBe(original);
    if (process.env.GUARDIAN_ACCEPTANCE_REPORT) {
      expect(rows).toHaveLength(1035);
      expect(Buffer.byteLength(original)).toBeGreaterThan(5 * 1024 * 1024 - 100000);
    }
    rows[0].description = 'Unauthorized narrative replacement';
    await expect(validateGuardianPreview({ ...body, outputHash: await sha256Json(ssp) }, source, body.assessmentHash))
      .rejects.toThrow('narrative');
    const editedSource = structuredClone(source);
    editedSource['system-security-plan'].uuid = 'different-selected-report';
    await expect(validateGuardianPreview(body, editedSource, body.assessmentHash)).rejects.toThrow('does not match');
  });
  it('reconstructs bounded projected patches into the full report and rejects substituted before values', async () => {
    const source = sourceReport();
    const sourceRows = source['system-security-plan']['control-implementation']['implemented-requirements'];
    const assessment = { tentacle: 'cloudflare', findings: [{ 'control-id': sourceRows[0]['control-id'] }] };
    const projection = projectGuardianReport(source, assessment);
    expect(projection['system-security-plan']['control-implementation']['implemented-requirements']).toHaveLength(1);
    expect(Buffer.byteLength(JSON.stringify(projection))).toBeLessThan(1024 * 1024);
    const projectedOutput = structuredClone(projection);
    const row = projectedOutput['system-security-plan']['control-implementation']['implemented-requirements'][0];
    const before = structuredClone(row.props || []);
    row.props = [...before, { name: 'guardian-test-only', value: 'test-only-patch' }];
    projectedOutput['system-security-plan'].metadata['last-modified'] = '2026-11-10T00:00:00Z';
    const body = { contractVersion: '1', inputHash: await sha256Json(projection), outputHash: await sha256Json(projectedOutput),
      assessmentHash: 'a'.repeat(64), updated: 1,
      changes: [{ controlId: row['control-id'], before, after: row.props }],
      metadataProps: { before: projection['system-security-plan'].metadata.props,
        after: projectedOutput['system-security-plan'].metadata.props },
      metadataLastModified: { before: null, after: projectedOutput['system-security-plan'].metadata['last-modified'] } };
    const result = await validateGuardianPatch(body, source, assessment, body.assessmentHash);
    const newRows = result.ssp['system-security-plan']['control-implementation']['implemented-requirements'];
    expect(newRows).toHaveLength(sourceRows.length);
    expect(newRows[0].description).toBe(sourceRows[0].description);
    expect(newRows.slice(1)).toEqual(sourceRows.slice(1));
    await expect(validateGuardianPatch({ ...body, changes: [{ ...body.changes[0], before: [] }] },
      source, assessment, body.assessmentHash)).rejects.toThrow('unreviewed');
  });
});

const genericSession = groups => {
  const value = { userId: 'privileged-test' };
  recordIdpIdentity(value, { provider: 'Generic_OIDC', groups });
  return value;
};

describe('privileged Generic SSO group gate', () => {
  it('matches any group name containing the phrase, case-insensitively, only for Generic SSO sessions', () => {
    expect(privilegedIdentity(genericSession(['other', 'oscal_platform admin']))?.groups).toEqual(['oscal_platform admin']);
    expect(privilegedIdentity(genericSession(['Platform Admin', 'Contoso Platform Administrators'])).groups).toHaveLength(2);
    expect(privilegedIdentity(genericSession(['other', 'Platform Operators', 'authentik Admins']))).toBeNull();
    const okta = { userId: 'okta-user' };
    recordIdpIdentity(okta, { provider: 'Okta', groups: ['OSCAL_Platform Admin'] });
    expect(privilegedIdentity(okta)).toBeNull();
    expect(privilegedIdentity({ userId: 'local-password-user' })).toBeNull();
    expect(privilegedIdentity(genericSession(['Ops']), { OSCAL_GUARDIAN_PRIVILEGED_GROUPS: 'Ops, Other' })?.groups).toEqual(['Ops']);
    expect(privilegedIdentity(genericSession(['Platform Admin']), { OSCAL_GUARDIAN_PRIVILEGED_GROUPS: 'Ops' })).toBeNull();
  });

  it('fails closed in production when Generic SSO has not been approved by Guardian', async () => {
    const result = await createGuardianAssessmentService({ readConfig: () => config, readGenericSso: () => null })
      .status(genericSession(['OSCAL_Platform Admin']));
    expect(result).toMatchObject({ ready: false, code: 'guardian_generic_sso_not_approved' });
    expect(result.privileged.groups).toEqual(['OSCAL_Platform Admin']);
  });
});

describe('Generic SSO (Authentik) access-token path', () => {
  const genericConfig = { issuer: 'https://sso.example.test/application/o/oscal/', jwksUrl: 'https://sso.example.test/jwks',
    audience: 'oscal-client', scope: 'guardian-assessment:read' };
  const capabilities = { data: { contractVersion: '1', assessmentRead: true, sspPreview: true, providers: ['cloudflare'] }, status: 200 };
  let pair, keys;
  beforeEach(async () => {
    pair = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' };
    keys = async () => createLocalJWKSet({ keys: [jwk] });
  });
  const sign = (claims = {}, options = {}) => new SignJWT({ scope: 'openid guardian-assessment:read',
    groups: ['OSCAL_Platform Admin'], ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(options.iss || genericConfig.issuer)
    .setAudience(options.aud || genericConfig.audience).setSubject('sso-user').setIssuedAt().setExpirationTime('10m')
    .sign(pair.privateKey);
  const run = async (token, groups = ['OSCAL_Platform Admin']) => {
    const session = genericSession(groups);
    session.createdAt = Date.now();
    if (token) { retainToken(session, token, Date.now() + 60000); }
    const upstreamCall = jest.fn(async () => capabilities);
    const result = await createGuardianAssessmentService({ readConfig: () => config, readGenericSso: () => genericConfig,
      keys, request: upstreamCall }).status(session);
    return { result, upstreamCall };
  };

  it('verifies the access token and calls Guardian with it', async () => {
    const { result, upstreamCall } = await run(await sign());
    expect(result.ready).toBe(true);
    expect(upstreamCall).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['missing custom scope', { scope: 'openid' }, {}],
    ['group claim absent', { groups: ['Other'] }, {}],
    ['wrong audience', {}, { aud: 'another-client' }],
    ['wrong issuer', {}, { iss: 'https://evil.example.test/' }],
  ])('rejects a token with %s', async (_name, claims, options) => {
    const { result, upstreamCall } = await run(await sign(claims, options));
    expect(result).toMatchObject({ ready: false, code: 'guardian_reauthentication_required' });
    expect(upstreamCall).not.toHaveBeenCalled();
  });

  it('requires a retained token, and is disabled when no approved configuration exists', async () => {
    expect((await run(null)).result.code).toBe('guardian_reauthentication_required');
    const result = await createGuardianAssessmentService({ readConfig: () => config, readGenericSso: () => null })
      .status(genericSession(['OSCAL_Platform Admin']));
    expect(result.code).toBe('guardian_generic_sso_not_approved');
  });

  it('retains only a verified access token for privileged sessions', async () => {
    const service = createGuardianAssessmentService({ readConfig: () => config, readGenericSso: () => genericConfig, keys });
    const token = await sign();
    const privileged = genericSession(['OSCAL_Platform Admin']);
    privileged.createdAt = Date.now();
    await service.retainGenericSso(privileged, { access_token: token, token_type: 'Bearer', expires_in: 600 });
    const other = genericSession(['Other']);
    other.createdAt = Date.now();
    await service.retainGenericSso(other, { access_token: token, token_type: 'Bearer', expires_in: 600 });
    const { getDelegatedToken: read } = await import('../../../backend/auth/delegatedTokens.js');
    expect(read(privileged)).toBe(token);
    expect(read(other)).toBeNull();
  });

  it('uses the Generic SSO endpoint for privileged sessions and the primary endpoint otherwise', async () => {
    const session = genericSession(['OSCAL_Platform Admin']);
    session.createdAt = Date.now();
    retainToken(session, await sign(), Date.now() + 60000);
    const request = jest.fn(async () => capabilities);
    await createGuardianAssessmentService({ readConfig: () => ({ ...config, genericUrl: 'https://guardian.amsgovcloud.com.au/extra/v1/guardian' }),
      readGenericSso: () => genericConfig, keys, request }).status(session);
    expect(request.mock.calls[0][0].url).toBe('https://guardian.amsgovcloud.com.au/extra/v1/guardian/capabilities');
  });

  it('allows an Authentik-only configuration without Okta identity settings', () => {
    const env = { OSCAL_GUARDIAN_ASSESSMENTS_ENABLED: 'true', OSCAL_GUARDIAN_GENERIC_SSO_ISSUER: genericConfig.issuer,
      OSCAL_GUARDIAN_ASSESSMENTS_URL: config.url, OSCAL_GUARDIAN_ASSESSMENTS_ALLOWED_HOSTS: 'guardian.amsgovcloud.com.au',
      OSCAL_GUARDIAN_ASSESSMENT_TARGETS_JSON: JSON.stringify(config.targets) };
    expect(readGuardianAssessmentConfig(env).targets).toHaveLength(1);
    expect(() => readGuardianAssessmentConfig({ ...env, OSCAL_GUARDIAN_GENERIC_SSO_ISSUER: '' })).toThrow();
  });

  it('accepts only exact owner-configured hosts: no default, wildcard or other host', () => {
    const host = 'abc123.execute-api.ap-southeast-2.amazonaws.com';
    const base = { OSCAL_GUARDIAN_ASSESSMENTS_ENABLED: 'true', OSCAL_GUARDIAN_GENERIC_SSO_ISSUER: genericConfig.issuer,
      OSCAL_GUARDIAN_ASSESSMENTS_URL: `https://${host}/v1/guardian`,
      OSCAL_GUARDIAN_GENERIC_SSO_ASSESSMENTS_URL: 'https://def456.execute-api.ap-southeast-2.amazonaws.com/v1/guardian',
      OSCAL_GUARDIAN_ASSESSMENT_TARGETS_JSON: JSON.stringify(config.targets) };
    const hosts = `${host}, def456.execute-api.ap-southeast-2.amazonaws.com`;
    expect(readGuardianAssessmentConfig({ ...base, OSCAL_GUARDIAN_ASSESSMENTS_ALLOWED_HOSTS: hosts }).genericUrl)
      .toBe('https://def456.execute-api.ap-southeast-2.amazonaws.com/v1/guardian');
    expect(() => readGuardianAssessmentConfig(base)).toThrow();
    expect(() => readGuardianAssessmentConfig({ ...base, OSCAL_GUARDIAN_ASSESSMENTS_ALLOWED_HOSTS: host })).toThrow();
    expect(() => readGuardianAssessmentConfig({ ...base, OSCAL_GUARDIAN_ASSESSMENTS_ALLOWED_HOSTS: '*.execute-api.ap-southeast-2.amazonaws.com' })).toThrow();
    expect(() => readGuardianAssessmentConfig({ ...base, OSCAL_GUARDIAN_ASSESSMENTS_ALLOWED_HOSTS: hosts,
      OSCAL_GUARDIAN_ASSESSMENTS_URL: `https://${host}:8443/v1/guardian` })).toThrow();
  });

  it('supports an Authentik-only first deployment with the primary URL unset', async () => {
    const host = 'abc123.execute-api.ap-southeast-2.amazonaws.com';
    const env = { OSCAL_GUARDIAN_ASSESSMENTS_ENABLED: 'true', OSCAL_GUARDIAN_GENERIC_SSO_ISSUER: genericConfig.issuer,
      OSCAL_GUARDIAN_GENERIC_SSO_ASSESSMENTS_URL: `https://${host}/v1/guardian`, OSCAL_GUARDIAN_ASSESSMENTS_ALLOWED_HOSTS: host,
      OSCAL_GUARDIAN_ASSESSMENT_TARGETS_JSON: JSON.stringify(config.targets) };
    const parsed = readGuardianAssessmentConfig(env);
    expect(parsed.url).toBeUndefined();
    expect(parsed.genericUrl).toBe(`https://${host}/v1/guardian`);
    expect(() => readGuardianAssessmentConfig({ ...env, OSCAL_GUARDIAN_GENERIC_SSO_ASSESSMENTS_URL: undefined })).toThrow();
    // The Okta path stays not configured: a non-privileged session cannot fall through to the Authentik endpoint.
    const request = jest.fn(async () => capabilities);
    const result = await createGuardianAssessmentService({ readConfig: () => parsed, readGenericSso: () => genericConfig, keys, request })
      .status({ userId: 'okta-user' });
    expect(result).toMatchObject({ ready: false, code: 'guardian_assessments_unavailable' });
    expect(request).not.toHaveBeenCalled();
    expect(result.message).toContain('Authentik custom scope');
  });

  it('refuses to mix a loopback endpoint with a real one', () => {
    const real = 'abc123.execute-api.ap-southeast-2.amazonaws.com';
    const env = { OSCAL_GUARDIAN_ASSESSMENTS_ENABLED: 'true', NODE_ENV: 'development', OSCAL_GUARDIAN_LOCAL_GATEWAY: 'true',
      OSCAL_GUARDIAN_GENERIC_SSO_ISSUER: genericConfig.issuer, OSCAL_GUARDIAN_ASSESSMENTS_ALLOWED_HOSTS: real,
      OSCAL_GUARDIAN_ASSESSMENTS_URL: 'http://127.0.0.1:8768/v1/guardian',
      OSCAL_GUARDIAN_GENERIC_SSO_ASSESSMENTS_URL: `https://${real}/v1/guardian`,
      OSCAL_GUARDIAN_ASSESSMENT_TARGETS_JSON: JSON.stringify(config.targets) };
    expect(() => readGuardianAssessmentConfig(env)).toThrow();
    expect(readGuardianAssessmentConfig({ ...env, OSCAL_GUARDIAN_GENERIC_SSO_ASSESSMENTS_URL: undefined }).local).toBe(true);
  });

  it('reads configuration only from complete https settings', () => {
    const base = { OSCAL_GUARDIAN_GENERIC_SSO_ISSUER: genericConfig.issuer, OSCAL_GUARDIAN_GENERIC_SSO_JWKS_URL: genericConfig.jwksUrl,
      OSCAL_GUARDIAN_GENERIC_SSO_CLIENT_ID: 'oscal-client', OSCAL_GUARDIAN_GENERIC_SSO_SCOPE: genericConfig.scope };
    expect(readGenericSsoConfig(base)).toMatchObject({ audience: 'oscal-client', scope: genericConfig.scope });
    expect(readGenericSsoConfig({})).toBeNull();
    expect(() => readGenericSsoConfig({ ...base, OSCAL_GUARDIAN_GENERIC_SSO_SCOPE: '' })).toThrow();
    expect(() => readGenericSsoConfig({ ...base, OSCAL_GUARDIAN_GENERIC_SSO_ISSUER: 'http://sso.example.test/' })).toThrow();
  });
});

describe('local development authorization hook', () => {
  const devAuthorize = async () => ({ token: 'dev-only', payload: { groups: ['TEST-WRITER'] } });
  const capabilities = { data: { contractVersion: '1', assessmentRead: true, sspPreview: true, providers: ['cloudflare'] }, status: 200 };
  afterEach(() => registerLocalDevAuthorization(null));

  it('is ignored unless the configuration is the local development gateway', async () => {
    registerLocalDevAuthorization(devAuthorize);
    const result = await createGuardianAssessmentService({ readConfig: () => config, request: async () => capabilities })
      .status({});
    expect(result.ready).toBe(false);
  });

  it('is used only for privileged Generic SSO members and needs no delegated Okta token', async () => {
    registerLocalDevAuthorization(devAuthorize);
    const localRequest = jest.fn(async () => capabilities);
    const service = createGuardianAssessmentService({ readConfig: () => ({ ...config, local: true }), localRequest });
    const denied = await service.status(genericSession(['Other']));
    expect(denied).toMatchObject({ ready: false, code: 'guardian_not_privileged' });
    expect(localRequest).not.toHaveBeenCalled();
    const result = await service.status(genericSession(['OSCAL_Platform Admin']));
    expect(result.ready).toBe(true);
    expect(result.privileged.groups).toEqual(['OSCAL_Platform Admin']);
    expect(result.targets).toHaveLength(1);
    expect(localRequest).toHaveBeenCalledTimes(1);
  });
});

describe('populated report download name', () => {
  const when = new Date(2026, 10, 12, 9, 5, 7);
  it('uses the first 16 characters of the input name, then _GAD-Input_ and the local date and time as digits', () => {
    expect(guardianDownloadName('DigitalSovereignEDSAustralia_ComplianceReport.json', when)).toBe('DigitalSovereign_GAD-Input_20261112090507.json');
    expect(guardianDownloadName('exactly-16-chars.JSON', when)).toBe('exactly-16-chars_GAD-Input_20261112090507.json');
    expect(guardianDownloadName('seventeen-chars-17.json', when)).toBe('seventeen-chars-_GAD-Input_20261112090507.json');
  });
  it('keeps short names whole, replaces characters that are unsafe in file names and never returns an empty prefix', () => {
    expect(guardianDownloadName('short.json', when)).toBe('short_GAD-Input_20261112090507.json');
    expect(guardianDownloadName('a/b:c*d?e"f<g>h|i.json', when)).toBe('a_b_c_d_e_f_g_h__GAD-Input_20261112090507.json');
    expect(guardianDownloadName('', when)).toBe('report_GAD-Input_20261112090507.json');
    expect(guardianDownloadName(undefined, when)).toBe('report_GAD-Input_20261112090507.json');
  });
  it('produces a different name for different times', () => {
    expect(guardianDownloadName('x.json', new Date(2026, 10, 12, 9, 5, 8))).not.toBe(guardianDownloadName('x.json', when));
  });
});
