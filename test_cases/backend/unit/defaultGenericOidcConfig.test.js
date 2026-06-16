/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { DEFAULT_CONFIG, prepareConfigForSave, getResolvedConfig } from '../../../backend/configManager.js';
import { encryptConfigSecret } from '../../../backend/utils/configFieldCrypto.js';

describe('defaultGenericOidcConfig', () => {
  const prevSecret = process.env.OSCAL_CONFIG_FIELD_SECRET;

  beforeEach(() => {
    process.env.OSCAL_CONFIG_FIELD_SECRET = 'oscal-config-field-dev-key-change-me';
  });

  afterEach(() => {
    if (prevSecret === undefined) {
      delete process.env.OSCAL_CONFIG_FIELD_SECRET;
    } else {
      process.env.OSCAL_CONFIG_FIELD_SECRET = prevSecret;
    }
  });

  it('DEFAULT_CONFIG enables Generic_OIDC with discovery and callback path', () => {
    const generic = DEFAULT_CONFIG.ssoConfig.oauth.providers.Generic_OIDC;
    expect(generic.enabled).toBe(true);
    expect(generic.callbackPath).toBe('/auth/callback');
    expect(generic.discoveryUrl).toContain('.well-known/openid-configuration');
    expect(Array.isArray(generic.redirectUriPatterns)).toBe(true);
    expect(generic.redirectUriPatterns.length).toBeGreaterThan(0);
    expect(generic.tlsRelaxed).toBe(false);
  });

  it('prepareConfigForSave preserves _cfgenc when UI sends masked secret', async () => {
    const existing = {
      ssoConfig: {
        oauth: {
          providers: {
            Generic_OIDC: {
              enabled: true,
              clientSecret: encryptConfigSecret('keep-me'),
            },
          },
        },
      },
    };
    const incoming = {
      ssoConfig: {
        oauth: {
          providers: {
            Generic_OIDC: {
              enabled: false,
              clientSecret: '********',
            },
          },
        },
      },
    };
    const { config } = await prepareConfigForSave(incoming, existing);
    expect(config.ssoConfig.oauth.providers.Generic_OIDC.clientSecret).toEqual(
      existing.ssoConfig.oauth.providers.Generic_OIDC.clientSecret,
    );
    expect(config.ssoConfig.oauth.providers.Generic_OIDC.enabled).toBe(false);
  });

  it('getResolvedConfig decrypts Generic_OIDC _cfgenc client secret', () => {
    const resolved = getResolvedConfig();
    const secret = resolved.ssoConfig?.oauth?.providers?.Generic_OIDC?.clientSecret;
    expect(typeof secret).toBe('string');
    expect(secret.length).toBeGreaterThan(0);
  });
});
