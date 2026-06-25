/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { jest } from '@jest/globals';

const mockMergePassBundlePartial = jest.fn(() => ({ success: true }));

jest.unstable_mockModule('../../../backend/utils/passBundle.js', () => ({
  mergePassBundlePartial: mockMergePassBundlePartial,
}));

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

describe('prepareConfigForSave (config mode pass bundle)', () => {
  beforeEach(() => {
    delete process.env.OSCAL_SECRETS_MODE;
    mockMergePassBundlePartial.mockReset();
    mockMergePassBundlePartial.mockReturnValue({ success: true });
  });

  it('batches secrets into single mergePassBundlePartial call', async () => {
    const incoming = {
      messagingConfig: { email: { smtpPassword: 'new-smtp-pass' } },
      aiConfig: { apiToken: 'ai-token-123' },
    };
    const existing = {};

    const { config, passErrors } = await prepareConfigForSave(incoming, existing);
    expect(passErrors).toEqual([]);
    expect(mockMergePassBundlePartial).toHaveBeenCalledTimes(1);
    expect(mockMergePassBundlePartial).toHaveBeenCalledWith({
      'OSCAL/smtp-password': 'new-smtp-pass',
      'OSCAL/ai-api-token': 'ai-token-123',
    });
    expect(config.messagingConfig.email.smtpPassword).toEqual({ _pass: 'OSCAL/smtp-password' });
    expect(config.aiConfig.apiToken).toEqual({ _pass: 'OSCAL/ai-api-token' });
  });
});
