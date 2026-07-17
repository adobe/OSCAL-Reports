/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { jest } from '@jest/globals';

const mockMergeAndPutBundle = jest.fn(async () => ({ success: false, error: 'simulated_sm_outage' }));

jest.unstable_mockModule('../../../backend/utils/passResolver.js', () => ({
  resolvePassPointers: jest.fn((obj) => obj),
  passShow: jest.fn(() => ''),
  isPassPointer: () => false,
}));

jest.unstable_mockModule('../../../backend/utils/secretsManager.js', () => ({
  isAwsSmMode: () => true,
  isSmPointer: (v) => v && typeof v === 'object' && typeof v._sm === 'string',
  entryKeyToConfigPointer: (entryKey) => ({ _sm: String(entryKey).trim() }),
  mergeAndPutBundle: mockMergeAndPutBundle,
  reloadSecretsFromAws: jest.fn(async () => ({ success: true })),
  ensureSmCacheReady: jest.fn(async () => {}),
  resolveSmPointers: jest.fn((obj) => obj),
  isSecretCached: () => false,
  getSecret: () => '',
  resolveSecretPointer: jest.fn(() => ''),
}));

jest.resetModules();
const { prepareConfigForSave } = await import('../../../backend/configManager.js');

describe('prepareConfigForSave (aws-sm fail-secure)', () => {
  beforeEach(() => {
    process.env.OSCAL_SECRETS_MODE = 'aws-sm';
    process.env.OSCAL_SECRETS_MANAGER_ARN = 'arn:aws:secretsmanager:us-east-1:123:secret:test';
    mockMergeAndPutBundle.mockReset();
    mockMergeAndPutBundle.mockResolvedValue({ success: false, error: 'simulated_sm_outage' });
  });

  afterEach(() => {
    delete process.env.OSCAL_SECRETS_MODE;
    delete process.env.OSCAL_SECRETS_MANAGER_ARN;
  });

  it('does not persist plaintext when SM put fails', async () => {
    const incoming = {
      messagingConfig: { slack: { webhookUrl: 'new-secret-url' } },
    };
    const existing = { messagingConfig: { slack: { webhookUrl: '' } } };

    const { config, smErrors } = await prepareConfigForSave(incoming, existing);
    expect(smErrors.length).toBeGreaterThan(0);
    expect(config.messagingConfig.slack.webhookUrl).not.toBe('new-secret-url');
    expect(config.messagingConfig.slack.webhookUrl).not.toEqual({ _sm: 'OSCAL/slack-webhook-url' });
  });
});
