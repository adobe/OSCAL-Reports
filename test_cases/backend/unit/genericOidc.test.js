/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  GENERIC_OIDC_PROVIDER_ID,
  isRedirectUriAllowed,
  createSignedOidcState,
  verifySignedOidcState,
  stripTrailingSlashes,
  DEFAULT_GENERIC_OIDC_REDIRECT_PATTERNS,
  probeOidcDiscovery,
  normalizeGenericOidcScope,
  genericSsoUrlsFromIssuer,
  genericAuthorizeScope,
} from '../../../backend/auth/genericOidc.js';

describe('genericOidc', () => {
  const secret = 'test-client-secret-for-hmac';

  it('exports Generic_OIDC provider id', () => {
    expect(GENERIC_OIDC_PROVIDER_ID).toBe('Generic_OIDC');
  });

  it('isRedirectUriAllowed accepts strict and regex patterns', () => {
    expect(
      isRedirectUriAllowed('http://localhost:3021/auth/callback', DEFAULT_GENERIC_OIDC_REDIRECT_PATTERNS),
    ).toBe(true);
    expect(
      isRedirectUriAllowed('http://localhost:9999/auth/callback', DEFAULT_GENERIC_OIDC_REDIRECT_PATTERNS),
    ).toBe(true);
    expect(
      isRedirectUriAllowed('https://evil.example.com/auth/callback', DEFAULT_GENERIC_OIDC_REDIRECT_PATTERNS),
    ).toBe(false);
  });

  it('stripTrailingSlashes normalizes callback URLs', () => {
    expect(stripTrailingSlashes('https://oscal.keekar.au/auth/callback/')).toBe(
      'https://oscal.keekar.au/auth/callback',
    );
  });

  it('signed state roundtrip includes redirect URI and PKCE verifier', () => {
    const redirectUri = 'http://localhost:3021/auth/callback';
    const verifier = 'pkce-verifier-value';
    const state = createSignedOidcState(redirectUri, secret, verifier);
    const parsed = verifySignedOidcState(state, secret);
    expect(parsed?.redirectUri).toBe(redirectUri);
    expect(parsed?.codeVerifier).toBe(verifier);
  });

  it('rejects state signed with wrong secret', () => {
    const state = createSignedOidcState('http://localhost:3021/auth/callback', secret, 'v');
    expect(verifySignedOidcState(state, 'wrong-secret')).toBeNull();
  });

  (process.env.OSCAL_RUN_OIDC_PROBE === '1' ? it : it.skip)(
    'probeOidcDiscovery reaches Authentik metadata with strict TLS verification',
    async () => {
      const url =
        'https://sso.example.test/application/o/oscal-report-generator/.well-known/openid-configuration';
      const result = await probeOidcDiscovery(url, false);
      expect(result.discovery).not.toBeNull();
      expect(result.discovery?.authorization_endpoint).toContain('/authorize');
    },
    15000,
  );
});

describe('normalizeGenericOidcScope', () => {
  it('accepts a space-separated scope list that includes openid and collapses spacing', () => {
    expect(normalizeGenericOidcScope('  openid   profile email guardian-assessments ', 'x'))
      .toBe('openid profile email guardian-assessments');
  });

  it.each([
    ['not a string', 42],
    ['no openid', 'profile email'],
    ['empty', '   '],
    ['control characters', 'openid\nprofile'],
    ['quotes or markup', 'openid "x" <script>'],
    ['too long', `openid ${'a'.repeat(300)}`],
  ])('keeps the existing value for %s', (_name, value) => {
    expect(normalizeGenericOidcScope(value, 'openid profile email')).toBe('openid profile email');
  });
});

describe('genericSsoUrlsFromIssuer', () => {
  it('derives the discovery, end-session and JWKS URLs from one issuer', () => {
    expect(genericSsoUrlsFromIssuer('https://sso.example.test/application/o/app/')).toEqual({
      issuerUrl: 'https://sso.example.test/application/o/app/',
      discoveryUrl: 'https://sso.example.test/application/o/app/.well-known/openid-configuration',
      endSessionUrl: 'https://sso.example.test/application/o/app/end-session/',
      jwksUrl: 'https://sso.example.test/application/o/app/jwks/',
    });
  });

  it.each([
    ['http', 'http://sso.example.test/app/'],
    ['no trailing slash', 'https://sso.example.test/app'],
    ['credentials', 'https://user:pw@sso.example.test/app/'],
    ['query', 'https://sso.example.test/app/?x=1'],
    ['fragment', 'https://sso.example.test/app/#x'],
    ['not a URL', 'nonsense'],
    ['empty', ''],
    ['not a string', undefined],
  ])('returns null for %s', (_name, value) => {
    expect(genericSsoUrlsFromIssuer(value)).toBeNull();
  });
});

describe('genericAuthorizeScope', () => {
  const on = { OSCAL_GUARDIAN_ASSESSMENTS_ENABLED: 'true', OSCAL_GUARDIAN_GENERIC_SSO_SCOPE: 'guardian-assessments' };

  it('adds the Guardian scope to the saved scope when Guardian is enabled', () => {
    expect(genericAuthorizeScope('openid profile email', on)).toBe('openid profile email guardian-assessments');
    expect(genericAuthorizeScope(undefined, on)).toBe('openid profile email guardian-assessments');
  });

  it('does not duplicate it, and leaves the saved scope alone otherwise', () => {
    expect(genericAuthorizeScope('openid guardian-assessments email', on)).toBe('openid guardian-assessments email');
    expect(genericAuthorizeScope('openid profile', { ...on, OSCAL_GUARDIAN_ASSESSMENTS_ENABLED: 'false' })).toBe('openid profile');
    expect(genericAuthorizeScope('openid profile', {})).toBe('openid profile');
    expect(genericAuthorizeScope(' openid   profile ', {})).toBe('openid   profile');
  });

  it.each(['two words', 'bad"quote', '<x>', ''])('ignores an unusable Guardian scope (%j)', (value) => {
    expect(genericAuthorizeScope('openid profile', { ...on, OSCAL_GUARDIAN_GENERIC_SSO_SCOPE: value })).toBe('openid profile');
  });
});
