/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { describe, test, expect } from '@jest/globals';
import {
  applyRoleBasedConfigRedaction,
  maskSensitiveConfigForClient,
} from '../../../backend/utils/resolveStoredSecret.js';
import {
  buildRuntimeSettingsResponse,
  sanitizeSettingsSaveResponse,
} from '../../../backend/utils/settingsClientResponse.js';
import { MASK } from '../../../backend/utils/sensitiveConfigKeys.js';
import { ROLES } from '../../../backend/auth/roles.js';

describe('applyRoleBasedConfigRedaction', () => {
  const baseConfig = {
    aiConfig: {
      bedrockAuthMode: 'iam-role',
      bedrockAssumeRoleArn: 'arn:aws:iam::928475551084:role/OSCAL-BedrockCrossAccount',
      bedrockExternalId: 'secret-external-id-123',
      awsRegion: 'us-east-1',
    },
  };

  test('masks cross-account Bedrock fields for Assessor role', () => {
    const config = JSON.parse(JSON.stringify(baseConfig));
    const skip = applyRoleBasedConfigRedaction(config, { role: ROLES.ASSESSOR });
    expect(skip).toEqual([]);
    expect(config.aiConfig.bedrockAssumeRoleArn).toBe(MASK);
    expect(config.aiConfig.bedrockExternalId).toBe(MASK);
  });

  test('allows Platform Admin to view cross-account Bedrock fields', () => {
    const config = JSON.parse(JSON.stringify(baseConfig));
    const skip = applyRoleBasedConfigRedaction(config, { role: ROLES.PLATFORM_ADMIN });
    expect(skip).toContain('aiConfig.bedrockAssumeRoleArn');
    expect(skip).toContain('aiConfig.bedrockExternalId');
    expect(config.aiConfig.bedrockAssumeRoleArn).toBe(baseConfig.aiConfig.bedrockAssumeRoleArn);
    expect(config.aiConfig.bedrockExternalId).toBe(baseConfig.aiConfig.bedrockExternalId);
  });

  test('masks bedrockAssumeRoleArn via sensitiveConfigKeys for non-admin after redaction', () => {
    const config = JSON.parse(JSON.stringify(baseConfig));
    applyRoleBasedConfigRedaction(config, { role: ROLES.USER });
    maskSensitiveConfigForClient(config, { skipPaths: [] });
    expect(config.aiConfig.bedrockAssumeRoleArn).toBe(MASK);
    expect(config.aiConfig.bedrockExternalId).toBe(MASK);
  });

  test('admin skip paths preserve ARN through maskSensitiveConfigForClient', () => {
    const config = JSON.parse(JSON.stringify(baseConfig));
    const skip = applyRoleBasedConfigRedaction(config, { role: ROLES.PLATFORM_ADMIN });
    maskSensitiveConfigForClient(config, { skipPaths: skip });
    expect(config.aiConfig.bedrockAssumeRoleArn).toBe(baseConfig.aiConfig.bedrockAssumeRoleArn);
    expect(config.aiConfig.bedrockExternalId).toBe(baseConfig.aiConfig.bedrockExternalId);
  });
});

describe('buildRuntimeSettingsResponse', () => {
  test('returns only database enabled flag and publishedSoaUrl', () => {
    const runtime = buildRuntimeSettingsResponse({
      publishedSoaUrl: 'https://example.com/report.json',
      databaseConfig: { enabled: true, host: 'db.internal' },
      ssoConfig: { oauth: { enabled: true } },
    });
    expect(runtime).toEqual({
      databaseConfig: { enabled: true },
      publishedSoaUrl: 'https://example.com/report.json',
    });
  });
});

describe('sanitizeSettingsSaveResponse', () => {
  test('applies admin redaction pipeline to saved config', () => {
    const sanitized = sanitizeSettingsSaveResponse({
      aiConfig: {
        bedrockAuthMode: 'iam-role',
        bedrockAssumeRoleArn: 'arn:aws:iam::123:role/Test',
        bedrockExternalId: 'ext',
        awsRegion: 'us-east-1',
      },
    }, { role: ROLES.PLATFORM_ADMIN });
    expect(sanitized.aiConfig.bedrockAssumeRoleArn).toBe('arn:aws:iam::123:role/Test');
  });
});
