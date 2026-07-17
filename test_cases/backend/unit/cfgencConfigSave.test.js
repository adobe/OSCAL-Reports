/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { jest } from '@jest/globals';

jest.unstable_mockModule('../../../backend/utils/passResolver.js', () => ({
  resolvePassPointers: jest.fn((obj) => obj),
  passShow: jest.fn(() => ''),
  isPassPointer: (v) => v && typeof v === 'object' && typeof v._pass === 'string' && v._pass.trim() !== '',
}));

jest.unstable_mockModule('../../../backend/utils/secretsManager.js', () => ({
  isAwsSmMode: () => false,
  isSmPointer: (v) => v && typeof v === 'object' && typeof v._sm === 'string',
  entryKeyToConfigPointer: (entryKey) => ({ _sm: String(entryKey).trim() }),
  mergeAndPutBundle: jest.fn(async () => ({ success: true })),
  reloadSecretsFromAws: jest.fn(async () => ({ success: true })),
  ensureSmCacheReady: jest.fn(async () => {}),
  resolveSmPointers: jest.fn((obj) => obj),
  isSecretCached: () => false,
  getSecret: () => '',
  resolveSecretPointer: jest.fn(() => ''),
}));

jest.resetModules();
const { prepareConfigForSave } = await import('../../../backend/configManager.js');
const { isCfgEncPointer, decryptConfigSecret } = await import('../../../backend/utils/configFieldCrypto.js');

describe('prepareConfigForSave (config mode _cfgenc)', () => {
  beforeEach(() => {
    delete process.env.OSCAL_SECRETS_MODE;
    process.env.OSCAL_CONFIG_FIELD_SECRET = 'test-field-secret-for-unit-tests';
  });

  afterEach(() => {
    delete process.env.OSCAL_CONFIG_FIELD_SECRET;
  });

  it('stores new secrets as _cfgenc envelopes', async () => {
    const incoming = {
      messagingConfig: { slack: { webhookUrl: 'https://hooks.slack.com/new' } },
      aiConfig: { apiToken: 'ai-token-123' },
    };
    const existing = {};

    const { config, passErrors } = await prepareConfigForSave(incoming, existing);
    expect(passErrors).toEqual([]);
    expect(isCfgEncPointer(config.messagingConfig.slack.webhookUrl)).toBe(true);
    expect(isCfgEncPointer(config.aiConfig.apiToken)).toBe(true);
    expect(decryptConfigSecret(config.messagingConfig.slack.webhookUrl)).toBe('https://hooks.slack.com/new');
    expect(decryptConfigSecret(config.aiConfig.apiToken)).toBe('ai-token-123');
  });
});
