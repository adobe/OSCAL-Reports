/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { describe, it, expect } from '@jest/globals';
import {
  normalizeBedrockAuthMode,
  bedrockCredentialsConfigured,
  mergeBedrockAiConfig,
  buildBedrockAiConfigFromRequest,
  getBedrockStaticCredentials,
  BEDROCK_AUTH_ACCESS_KEYS,
  BEDROCK_AUTH_IAM_ROLE,
  BEDROCK_ASSUME_ROLE_SESSION_NAME,
} from '../../../backend/utils/bedrockCredentials.js';
import { MASK } from '../../../backend/utils/sensitiveConfigKeys.js';

describe('bedrockCredentials', () => {
  it('normalizeBedrockAuthMode defaults to access-keys', () => {
    expect(normalizeBedrockAuthMode({})).toBe(BEDROCK_AUTH_ACCESS_KEYS);
    expect(normalizeBedrockAuthMode({ bedrockAuthMode: 'access-keys' })).toBe(BEDROCK_AUTH_ACCESS_KEYS);
  });

  it('normalizeBedrockAuthMode accepts iam-role aliases', () => {
    expect(normalizeBedrockAuthMode({ bedrockAuthMode: 'iam-role' })).toBe(BEDROCK_AUTH_IAM_ROLE);
    expect(normalizeBedrockAuthMode({ bedrockAuthMode: 'assume-role' })).toBe(BEDROCK_AUTH_IAM_ROLE);
  });

  it('bedrockCredentialsConfigured requires keys only in access-keys mode', () => {
    expect(bedrockCredentialsConfigured({ bedrockAuthMode: 'iam-role' })).toBe(true);
    expect(bedrockCredentialsConfigured({ bedrockAuthMode: 'access-keys' })).toBe(false);
    expect(
      bedrockCredentialsConfigured({
        bedrockAuthMode: 'access-keys',
        awsAccessKeyId: 'AKIA',
        awsSecretAccessKey: 'secret'
      })
    ).toBe(true);
  });

  it('mergeBedrockAiConfig overlays fields', () => {
    const merged = mergeBedrockAiConfig(
      { awsRegion: 'us-east-1', bedrockAuthMode: 'access-keys' },
      { bedrockAuthMode: 'iam-role', bedrockAssumeRoleArn: 'arn:aws:iam::1:role/x' }
    );
    expect(merged.bedrockAuthMode).toBe('iam-role');
    expect(merged.bedrockAssumeRoleArn).toBe('arn:aws:iam::1:role/x');
    expect(merged.awsRegion).toBe('us-east-1');
  });

  it('buildBedrockAiConfigFromRequest ignores masked access keys in body', () => {
    const base = {
      bedrockAuthMode: 'access-keys',
      awsAccessKeyId: 'AKIAREAL',
      awsSecretAccessKey: 'secretreal'
    };
    const built = buildBedrockAiConfigFromRequest(base, {
      body: { awsAccessKeyId: MASK, awsSecretAccessKey: MASK }
    });
    expect(built.awsAccessKeyId).toBe('AKIAREAL');
    expect(built.awsSecretAccessKey).toBe('secretreal');
  });

  it('getBedrockStaticCredentials returns null when incomplete', () => {
    expect(getBedrockStaticCredentials({ awsAccessKeyId: 'A' })).toBeNull();
    expect(
      getBedrockStaticCredentials({ awsAccessKeyId: 'A', awsSecretAccessKey: 'B' })
    ).toEqual({ accessKeyId: 'A', secretAccessKey: 'B' });
  });

  it('uses fixed AssumeRole session name for cross-account trust policy', () => {
    expect(BEDROCK_ASSUME_ROLE_SESSION_NAME).toBe('oscal-bedrock-session');
    expect(BEDROCK_ASSUME_ROLE_SESSION_NAME.startsWith('oscal-bedrock-')).toBe(true);
  });
});
