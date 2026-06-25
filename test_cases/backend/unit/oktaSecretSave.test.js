/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { jest } from '@jest/globals';

const mockPassShow = jest.fn(() => 'migrated-okta-secret');

jest.unstable_mockModule('../../../backend/utils/passResolver.js', () => ({
  resolvePassPointers: jest.fn((obj) => obj),
  passInsert: jest.fn(() => ({ success: true })),
  passShow: mockPassShow,
  isPassPointer: (v) => v && typeof v === 'object' && typeof v._pass === 'string' && v._pass.trim() !== '',
  extractOAuthPassClientSecret: (lines) => (lines.length ? lines[lines.length - 1] : ''),
}));

jest.unstable_mockModule('../../../backend/utils/secretsManager.js', () => {
  let cache = new Map();
  return {
    isAwsSmMode: () => true,
    getSecretsMode: () => 'aws-sm',
    isSmPointer: (v) => v && typeof v === 'object' && typeof v._sm === 'string' && v._sm.trim() !== '',
    entryKeyToConfigPointer: (entryKey) => ({ _sm: String(entryKey).trim() }),
    mergeAndPutBundle: jest.fn(async (partial) => {
      cache = new Map(Object.entries(partial));
      return { success: true };
    }),
    reloadSecretsFromAws: jest.fn(async () => ({ success: true })),
    ensureSmCacheReady: jest.fn(async () => {}),
    resolveSmPointers: jest.fn((obj) => obj),
    isSecretCached: (entryKey) => cache.has(String(entryKey || '').trim()),
    getSecret: (entryKey) => cache.get(String(entryKey || '').trim()) || '',
    resolveSecretPointer: jest.fn((v) => {
      if (v && typeof v === 'object' && v._sm) return cache.get(v._sm) || '';
      return '';
    }),
    __resetSecretsCacheForTests: () => { cache = new Map(); },
    __setSecretsCacheForTests: (entries) => { cache = new Map(Object.entries(entries || {})); },
  };
});

const { prepareConfigForSave } = await import('../../../backend/configManager.js');

describe('Okta client secret save (aws-sm migration)', () => {
  beforeEach(() => {
    process.env.OSCAL_SECRETS_MODE = 'aws-sm';
    process.env.OSCAL_SECRETS_MANAGER_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:test';
    mockPassShow.mockClear();
  });

  afterEach(() => {
    delete process.env.OSCAL_SECRETS_MODE;
    delete process.env.OSCAL_SECRETS_MANAGER_ARN;
  });

  it('migrates _pass pointer to SM on masked save', async () => {
    const existing = {
      ssoConfig: {
        oauth: {
          providers: {
            okta: { clientSecret: { _pass: 'OSCAL/sso-oauth-okta-client-secret' } },
          },
        },
      },
    };
    const incoming = {
      ssoConfig: {
        oauth: {
          providers: {
            okta: {
              clientSecret: { _pass: 'OSCAL/sso-oauth-okta-client-secret' },
              domain: 'adobe.okta.com',
              clientId: 'cid',
            },
          },
        },
      },
    };

    const { config, smErrors } = await prepareConfigForSave(incoming, existing);
    expect(smErrors).toEqual([]);
    expect(mockPassShow).toHaveBeenCalledWith('OSCAL/sso-oauth-okta-client-secret');
    expect(config.ssoConfig.oauth.providers.okta.clientSecret).toEqual({
      _sm: 'OSCAL/sso-oauth-okta-client-secret',
    });
  });
});
