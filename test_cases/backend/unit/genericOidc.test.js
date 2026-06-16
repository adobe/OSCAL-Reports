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

  it('probeOidcDiscovery reaches Authentik metadata with strict TLS verification', async () => {
    const url =
      'https://sso.keekar.au/application/o/oscal-report-generator/.well-known/openid-configuration';
    const result = await probeOidcDiscovery(url, false);
    expect(result.discovery).not.toBeNull();
    expect(result.discovery?.authorization_endpoint).toContain('/authorize');
  }, 15000);
});
