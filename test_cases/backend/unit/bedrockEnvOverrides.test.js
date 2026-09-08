/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Regression coverage for applyBedrockEnvOverrides precedence (CHANGELOG 1.7.30): env vars must
 * never flip an explicit access-keys selection to iam-role.
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { applyBedrockEnvOverrides } from '../../../backend/configManager.js';

const ROLE_ARN = 'arn:aws:iam::928475551084:role/OSCAL-BedrockCrossAccount';

describe('applyBedrockEnvOverrides', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    delete process.env.BEDROCK_ASSUME_ROLE_ARN;
    delete process.env.BEDROCK_EXTERNAL_ID;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('does not flip an explicit access-keys selection to iam-role (regression case)', () => {
    process.env.BEDROCK_ASSUME_ROLE_ARN = ROLE_ARN;
    process.env.BEDROCK_EXTERNAL_ID = 'ext-123';
    const config = { aiConfig: { bedrockAuthMode: 'access-keys', awsAccessKeyId: 'AKIA', awsSecretAccessKey: 'secret' } };
    applyBedrockEnvOverrides(config);
    expect(config.aiConfig.bedrockAuthMode).toBe('access-keys');
    expect(config.aiConfig.bedrockAssumeRoleArn).toBeUndefined();
    expect(config.aiConfig.bedrockExternalId).toBeUndefined();
  });

  it('still populates ARN/ExternalId from env when iam-role is already selected', () => {
    process.env.BEDROCK_ASSUME_ROLE_ARN = ROLE_ARN;
    process.env.BEDROCK_EXTERNAL_ID = 'ext-123';
    const config = { aiConfig: { bedrockAuthMode: 'iam-role' } };
    applyBedrockEnvOverrides(config);
    expect(config.aiConfig.bedrockAuthMode).toBe('iam-role');
    expect(config.aiConfig.bedrockAssumeRoleArn).toBe(ROLE_ARN);
    expect(config.aiConfig.bedrockExternalId).toBe('ext-123');
  });

  it('leaves an unset mode untouched and does not populate from env', () => {
    process.env.BEDROCK_ASSUME_ROLE_ARN = ROLE_ARN;
    const config = { aiConfig: {} };
    applyBedrockEnvOverrides(config);
    // The function never assigns bedrockAuthMode; the access-keys default lives in normalizeBedrockAuthMode.
    expect(config.aiConfig.bedrockAuthMode).toBeUndefined();
    expect(config.aiConfig.bedrockAssumeRoleArn).toBeUndefined();
  });
});
