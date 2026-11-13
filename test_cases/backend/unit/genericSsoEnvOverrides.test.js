/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * One OSCAL_GENERIC_SSO_ISSUER (and client ID) drives the Generic SSO provider settings.
 */
import { describe, it, expect } from '@jest/globals';
import { applyGenericSsoEnvOverrides } from '../../../backend/configManager.js';

const provider = () => ({ ssoConfig: { oauth: { providers: { Generic_OIDC: {
  enabled: true, issuerUrl: 'https://old.example.test/a/', discoveryUrl: 'https://old.example.test/a/.well-known/openid-configuration',
  endSessionUrl: 'https://old.example.test/a/end-session/', clientId: 'old-client', clientSecret: 'keep-me' } } } } });

describe('applyGenericSsoEnvOverrides', () => {
  it('overrides issuer-derived URLs and client ID, keeping every other field', () => {
    const config = provider();
    applyGenericSsoEnvOverrides(config, { OSCAL_GENERIC_SSO_ISSUER: 'https://sso.example.test/application/o/app/',
      OSCAL_GENERIC_SSO_CLIENT_ID: ' new-client ' });
    expect(config.ssoConfig.oauth.providers.Generic_OIDC).toEqual({
      enabled: true, clientSecret: 'keep-me', clientId: 'new-client',
      issuerUrl: 'https://sso.example.test/application/o/app/',
      discoveryUrl: 'https://sso.example.test/application/o/app/.well-known/openid-configuration',
      endSessionUrl: 'https://sso.example.test/application/o/app/end-session/',
    });
  });

  it('changes nothing when the variables are unset, or the issuer is invalid', () => {
    const before = JSON.stringify(provider());
    for (const env of [{}, { OSCAL_GENERIC_SSO_ISSUER: 'http://insecure.example.test/' }]) {
      const config = provider();
      applyGenericSsoEnvOverrides(config, env);
      expect(JSON.stringify(config)).toBe(before);
    }
  });

  it('ignores a config without a Generic provider', () => {
    const config = { ssoConfig: { oauth: { providers: {} } } };
    expect(() => applyGenericSsoEnvOverrides(config, { OSCAL_GENERIC_SSO_ISSUER: 'https://sso.example.test/a/' })).not.toThrow();
    expect(config.ssoConfig.oauth.providers).toEqual({});
  });
});
