/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  getSecretsMode,
  isAwsSmMode,
  isSmPointer,
  entryKeyToConfigPointer,
  getSecret,
  resolveSmPointers,
  resolveSecretPointer,
  mergeAndPutBundle,
  __resetSecretsCacheForTests,
  __setSecretsCacheForTests,
} from '../../../backend/utils/secretsManager.js';
import { isSecretPointer, isMaskedOrEmpty } from '../../../backend/utils/sensitiveConfigKeys.js';

const ORIGINAL_ENV = { ...process.env };

describe('secretsManager', () => {
  beforeEach(() => {
    __resetSecretsCacheForTests();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.OSCAL_SECRETS_MODE;
    delete process.env.OSCAL_SECRETS_MANAGER_ARN;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    __resetSecretsCacheForTests();
  });

  it('getSecretsMode defaults to config', () => {
    expect(getSecretsMode()).toBe('config');
    expect(isAwsSmMode()).toBe(false);
  });

  it('getSecretsMode accepts aws-sm', () => {
    process.env.OSCAL_SECRETS_MODE = 'aws-sm';
    expect(getSecretsMode()).toBe('aws-sm');
    expect(isAwsSmMode()).toBe(true);
  });

  it('isSmPointer and entryKeyToConfigPointer', () => {
    expect(isSmPointer({ _sm: 'OSCAL/slack-webhook-url' })).toBe(true);
    expect(isSmPointer({ _pass: 'x' })).toBe(false);
    expect(entryKeyToConfigPointer('OSCAL/slack-webhook-url')).toEqual({ _sm: 'OSCAL/slack-webhook-url' });
  });

  it('isSecretPointer treats _sm and _pass as masked', () => {
    expect(isSecretPointer({ _sm: 'OSCAL/x' })).toBe(true);
    expect(isSecretPointer({ _pass: 'OSCAL/x' })).toBe(true);
    expect(isMaskedOrEmpty({ _sm: 'OSCAL/x' })).toBe(true);
    expect(isMaskedOrEmpty('********')).toBe(true);
  });

  it('resolveSmPointers substitutes from cache', () => {
    __setSecretsCacheForTests({ 'OSCAL/slack-webhook-url': 'slack-secret' });
    const cfg = { messagingConfig: { slack: { webhookUrl: { _sm: 'OSCAL/slack-webhook-url' } } } };
    resolveSmPointers(cfg);
    expect(cfg.messagingConfig.slack.webhookUrl).toBe('slack-secret');
  });

  it('resolveSecretPointer reads _sm cache', () => {
    __setSecretsCacheForTests({ 'OSCAL/ai-api-token': 'tok' });
    expect(resolveSecretPointer({ _sm: 'OSCAL/ai-api-token' })).toBe('tok');
    expect(resolveSecretPointer('plain')).toBe('plain');
  });

  it('mergeAndPutBundle updates cache on success', async () => {
    process.env.OSCAL_SECRETS_MANAGER_ARN = 'arn:aws:secretsmanager:us-east-1:1:secret:test';
    const remote = { entries: { 'OSCAL/slack-webhook-url': 'old' }, _meta: { keys: { 'OSCAL/slack-webhook-url': { t: 1 } } } };
    const send = jest.fn()
      .mockResolvedValueOnce({ SecretString: JSON.stringify(remote), VersionId: 'v1' })
      .mockResolvedValueOnce({ SecretString: JSON.stringify(remote), VersionId: 'v1' })
      .mockResolvedValueOnce({});
    const client = { send };

    const result = await mergeAndPutBundle({ 'OSCAL/slack-webhook-url': 'new' }, client);
    expect(result.success).toBe(true);
    expect(getSecret('OSCAL/slack-webhook-url')).toBe('new');
    expect(send.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('mergeAndPutBundle retries when version changes between reads', async () => {
    process.env.OSCAL_SECRETS_MANAGER_ARN = 'arn:aws:secretsmanager:us-east-1:1:secret:test';
    const remote1 = { entries: {}, _meta: { keys: {} } };
    const remote2 = { entries: { 'OSCAL/x': 'other' }, _meta: { keys: { 'OSCAL/x': { t: 2 } } } };
    const send = jest.fn()
      .mockResolvedValueOnce({ SecretString: JSON.stringify(remote1), VersionId: 'v1' })
      .mockResolvedValueOnce({ SecretString: JSON.stringify(remote1), VersionId: 'v2' })
      .mockResolvedValueOnce({ SecretString: JSON.stringify(remote2), VersionId: 'v2' })
      .mockResolvedValueOnce({ SecretString: JSON.stringify(remote2), VersionId: 'v2' })
      .mockResolvedValueOnce({});
    const client = { send };

    const result = await mergeAndPutBundle({ 'OSCAL/slack-webhook-url': 'merged' }, client);
    expect(result.success).toBe(true);
    expect(getSecret('OSCAL/slack-webhook-url')).toBe('merged');
  });

  it('mergeAndPutBundle persists new Generic OIDC key in cache after put', async () => {
    process.env.OSCAL_SECRETS_MANAGER_ARN = 'arn:aws:secretsmanager:us-east-1:1:secret:test';
    const remote = { entries: {}, _meta: { keys: {} } };
    const send = jest.fn()
      .mockResolvedValueOnce({ SecretString: JSON.stringify(remote), VersionId: 'v1' })
      .mockResolvedValueOnce({ SecretString: JSON.stringify(remote), VersionId: 'v1' })
      .mockResolvedValueOnce({});
    const client = { send };
    const key = 'OSCAL/sso-oauth-generic-oidc-client-secret';
    const result = await mergeAndPutBundle({ [key]: 'generic-secret' }, client);
    expect(result.success).toBe(true);
    expect(getSecret(key)).toBe('generic-secret');
    expect(send.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
