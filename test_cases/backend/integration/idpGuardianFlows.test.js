/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * IdP-to-Guardian integration for BOTH identity providers. Identity-provider tokens and Guardian responses are mocked
 * and signed locally; this proves OSCAL's wiring (sign-in, groups, session identity, token retention, endpoint choice),
 * not real Okta or Authentik. Users are written to a temporary data directory, never the real one.
 */
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK } from '../../../backend/node_modules/jose/dist/webapi/index.js';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oscal-idp-flow-'));
const seed = ['okta-user', 'authentik-admin', 'authentik-viewer'].map((name, index) => ({
  id: `idp-test-${index}`, username: `${name}@example.test`, email: `${name}@example.test`, role: 'User', isActive: true, password: 'x',
}));
fs.writeFileSync(path.join(dataDir, 'users.json'), JSON.stringify(seed));
process.env.OSCAL_DATA_DIR = dataDir;

const OKTA_HOST = 'okta-guardian.example.test';
const AUTHENTIK_HOST = 'authentik-guardian.example.test';
const mapping = { 'OSCAL_Platform Admin': 'Platform Admin', 'OSCAL_Assessor': 'Assessor' };
const capabilities = { status: 200, data: { contractVersion: '1', assessmentRead: true, sspPreview: true, providers: ['cloudflare'] } };
const target = { provider: 'cloudflare', targetId: 'TEST_ONLY', label: 'Test only', groups: ['TEST-GROUP', 'OSCAL_Platform Admin'] };

let users;
let assessments;
let guardianService;
let delegated;
let okta;
let authentik;

beforeAll(async () => {
  users = await import('../../../backend/auth/userManager.js');
  assessments = await import('../../../backend/guardianAssessments.js');
  guardianService = await import('../../../backend/guardianService.js');
  delegated = await import('../../../backend/auth/delegatedTokens.js');

  const oktaPair = await generateKeyPair('RS256');
  const authentikPair = await generateKeyPair('RS256');
  const jwk = async pair => ({ ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' });
  okta = {
    pair: oktaPair,
    identity: { issuer: 'https://okta.example.test/oauth2/test', jwksUrl: 'https://okta.example.test/oauth2/test/keys',
      audience: 'test-guardian-resource', clientId: 'test-oscal-client', scopes: ['test:assessment'] },
  };
  authentik = {
    pair: authentikPair, keys: createLocalJWKSet({ keys: [await jwk(authentikPair)] }),
    config: { issuer: 'https://sso.example.test/application/o/oscal/', jwksUrl: 'https://sso.example.test/jwks',
      audience: 'oscal-client', scope: 'guardian-assessment:read' },
  };
});

afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));

const oktaToken = () => new SignJWT({ cid: okta.identity.clientId, scp: okta.identity.scopes, groups: ['TEST-GROUP'] })
  .setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(okta.identity.issuer).setAudience(okta.identity.audience)
  .setSubject('okta-user').setIssuedAt().setExpirationTime('10m').sign(okta.pair.privateKey);

const authentikToken = (groups = ['OSCAL_Platform Admin']) => new SignJWT({ scope: `openid ${authentik.config.scope}`, groups })
  .setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(authentik.config.issuer).setAudience(authentik.config.audience)
  .setSubject('authentik-user').setIssuedAt().setExpirationTime('10m').sign(authentik.pair.privateKey);

// Sign-in exactly as the exchange routes do: the IdP profile (with merged groups) goes through findOrCreateOidcUser.
const signIn = async (email, groups, idpProvider) => {
  const user = await users.findOrCreateOidcUser(email, { email, groups },
    { groupToRoleMapping: mapping, syncRoleFromGroups: true, ...(idpProvider ? { idpProvider } : {}) });
  return { user, session: users.validateSession(user.sessionToken) };
};

const readConfig = () => ({
  ...okta.identity, local: false, url: `https://${OKTA_HOST}/v1/guardian`, genericUrl: `https://${AUTHENTIK_HOST}/v1/guardian`, targets: [target],
});

describe('Okta sign-in to Guardian', () => {
  it('maps groups to a role but never makes the session a privileged Generic SSO operator', async () => {
    const { user, session } = await signIn('okta-user@example.test', ['OSCAL_Platform Admin']);
    expect(user.role).toBe('Platform Admin');
    expect(assessments.privilegedIdentity(session)).toBeNull();
  });

  it('retains the delegated Okta token and calls the primary endpoint with it', async () => {
    const { session } = await signIn('okta-user@example.test', ['TEST-GROUP']);
    const auth = guardianService.createGuardianService({ readConfig: () => null, readAssessmentIdentity: () => okta.identity,
      keys: async () => okta.pair.publicKey });
    const token = await oktaToken();
    await auth.retain(session, { access_token: token, token_type: 'Bearer', expires_in: 300 });
    const request = jest.fn(async () => capabilities);
    const service = assessments.createGuardianAssessmentService({ readConfig, request, authorize: (u, c) => auth.authorize(u, c) });
    const status = await service.status(session);
    expect(status.ready).toBe(true);
    expect(status.privileged).toBeUndefined();
    expect(request.mock.calls[0][0].url).toBe(`https://${OKTA_HOST}/v1/guardian/capabilities`);
    expect(request.mock.calls[0][0].headers.Authorization).toContain(token);
    delegated.revokeDelegatedToken(session);
  });
});

describe('Authentik (Generic SSO) sign-in to Guardian', () => {
  const generic = () => ({ readGenericSso: () => authentik.config, keys: async () => authentik.keys });

  it('makes a Platform Admin group member privileged and calls the Authentik endpoint with the access token', async () => {
    const { session } = await signIn('authentik-admin@example.test', ['authentik Admins', 'OSCAL_Platform Admin'], 'Generic_OIDC');
    expect(assessments.privilegedIdentity(session)?.groups).toEqual(['OSCAL_Platform Admin']);
    const token = await authentikToken();
    const request = jest.fn(async () => capabilities);
    const service = assessments.createGuardianAssessmentService({ readConfig, request, ...generic() });
    await service.retainGenericSso(session, { access_token: token, token_type: 'Bearer', expires_in: 300 });
    const status = await service.status(session);
    expect(status.ready).toBe(true);
    expect(status.privileged.groups).toEqual(['OSCAL_Platform Admin']);
    expect(request.mock.calls[0][0].url).toBe(`https://${AUTHENTIK_HOST}/v1/guardian/capabilities`);
    expect(request.mock.calls[0][0].headers.Authorization).toContain(token);
    delegated.revokeDelegatedToken(session);
  });

  it('does not make a member of other groups privileged, and sends nothing to Guardian', async () => {
    const { session } = await signIn('authentik-viewer@example.test', ['homelab-users', 'authentik Admins'], 'Generic_OIDC');
    expect(assessments.privilegedIdentity(session)).toBeNull();
    const request = jest.fn(async () => capabilities);
    const service = assessments.createGuardianAssessmentService({ readConfig, request, ...generic() });
    await service.retainGenericSso(session, { access_token: await authentikToken(), token_type: 'Bearer', expires_in: 300 });
    expect((await service.status(session)).ready).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects an Authentik token that lacks the privileged group even for a privileged session', async () => {
    const { session } = await signIn('authentik-admin@example.test', ['OSCAL_Platform Admin'], 'Generic_OIDC');
    const request = jest.fn(async () => capabilities);
    const service = assessments.createGuardianAssessmentService({ readConfig, request, ...generic() });
    // The login route treats a retention failure as non-fatal: the user signs in but no Guardian token is kept.
    await expect(service.retainGenericSso(session, { access_token: await authentikToken(['Other']), token_type: 'Bearer', expires_in: 300 }))
      .rejects.toMatchObject({ status: 401 });
    const status = await service.status(session);
    expect(status.ready).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
});
