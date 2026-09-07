/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { jest } from '@jest/globals';
import {
  getSecretStorageShape,
  findPlaintextSecretPaths,
  migrateConfigSecretsInPlace,
  validateConfigSecretsProtected,
} from '../../../backend/utils/configSecretMigration.js';
import { isCfgEncPointer, decryptConfigSecret } from '../../../backend/utils/configFieldCrypto.js';

describe('configSecretMigration', () => {
  beforeEach(() => {
    delete process.env.OSCAL_SECRETS_MODE;
    process.env.OSCAL_CONFIG_FIELD_SECRET = 'migration-test-secret-key';
  });

  afterEach(() => {
    delete process.env.OSCAL_CONFIG_FIELD_SECRET;
    delete process.env.OSCAL_SECRETS_MODE;
  });

  it('detects plaintext secret shapes', () => {
    expect(getSecretStorageShape('secret-value')).toBe('plaintext');
    expect(getSecretStorageShape({ _sm: 'OSCAL/x' })).toBe('_sm');
    expect(getSecretStorageShape({ _cfgenc: 'v1$x' })).toBe('_cfgenc');
    expect(getSecretStorageShape('')).toBe('empty');
  });

  it('findPlaintextSecretPaths lists sensitive plaintext fields', () => {
    const config = {
      messagingConfig: { slack: { webhookUrl: 'plain-webhook' } },
      aiConfig: { apiToken: { _cfgenc: 'v1$placeholder' } },
    };
    const paths = findPlaintextSecretPaths(config);
    expect(paths).toContain('messagingConfig.slack.webhookUrl');
    expect(paths).not.toContain('aiConfig.apiToken');
  });

  it('migrateConfigSecretsInPlace encrypts plaintext to _cfgenc', async () => {
    const config = {
      messagingConfig: { slack: { webhookUrl: 'migrate-me' } },
    };
    const { changed, migrated, errors } = await migrateConfigSecretsInPlace(config);
    expect(errors).toEqual([]);
    expect(changed).toBe(true);
    expect(migrated).toContain('messagingConfig.slack.webhookUrl');
    expect(isCfgEncPointer(config.messagingConfig.slack.webhookUrl)).toBe(true);
    expect(decryptConfigSecret(config.messagingConfig.slack.webhookUrl)).toBe('migrate-me');
  });

  it('leaves a legacy _pass pointer untouched without allowPassResolution', async () => {
    const config = {
      messagingConfig: { slack: { webhookUrl: { _pass: 'OSCAL/slack-webhook' } } },
    };
    const { changed, migrated, errors } = await migrateConfigSecretsInPlace(config);
    // Pass is no longer resolved at runtime: skip silently, no error, no mutation.
    expect(errors).toEqual([]);
    expect(migrated).toEqual([]);
    expect(changed).toBe(false);
    expect(config.messagingConfig.slack.webhookUrl).toEqual({ _pass: 'OSCAL/slack-webhook' });
  });

  it('validateConfigSecretsProtected fails when plaintext present', () => {
    const bad = { aiConfig: { apiToken: 'token-plain' } };
    const good = { aiConfig: { apiToken: '' } };
    expect(validateConfigSecretsProtected(bad).ok).toBe(false);
    expect(validateConfigSecretsProtected(good).ok).toBe(true);
  });
});
