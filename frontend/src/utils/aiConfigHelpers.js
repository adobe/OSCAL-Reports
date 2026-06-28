/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Shared AI Integration (Bedrock) form helpers.
 */

export const CREDENTIAL_MASK = '********';

const DEFAULT_AWS_REGION = 'us-east-1';
const DEFAULT_BEDROCK_MODEL = 'mistral.mistral-large-2402-v1:0';

export function isSecretPointerValue(value) {
  if (!value || typeof value !== 'object') return false;
  return (
    (typeof value._pass === 'string' && value._pass.trim() !== '') ||
    (typeof value._sm === 'string' && value._sm.trim() !== '')
  );
}

/** True when the field has a user-entered value, vault pointer, or server MASK placeholder. */
export function hasCredentialValue(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  return isSecretPointerValue(value);
}

export function isIamRoleBedrockMode(aiConfig) {
  return (aiConfig?.bedrockAuthMode || 'access-keys') === 'iam-role';
}

export function getEffectiveAwsRegion(aiConfig) {
  const raw = aiConfig?.awsRegion;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return DEFAULT_AWS_REGION;
}

export function bedrockCredentialsReadyForTest(aiConfig) {
  if (!aiConfig || aiConfig.provider !== 'aws-bedrock') return false;
  if (!getEffectiveAwsRegion(aiConfig)) return false;
  if (isIamRoleBedrockMode(aiConfig)) return true;
  return (
    hasCredentialValue(aiConfig.awsAccessKeyId) &&
    hasCredentialValue(aiConfig.awsSecretAccessKey)
  );
}

/** Normalize aiConfig from GET /api/settings for controlled form state. */
export function normalizeAiConfigFromApi(raw = {}) {
  const config = { ...raw };
  config.provider = config.provider === 'ollama' || !config.provider ? 'aws-bedrock' : config.provider;
  config.bedrockAuthMode = config.bedrockAuthMode === 'iam-role' ? 'iam-role' : 'access-keys';
  config.awsRegion = getEffectiveAwsRegion(config);
  config.bedrockModelId = (config.bedrockModelId && String(config.bedrockModelId).trim())
    || DEFAULT_BEDROCK_MODEL;
  config.bedrockAssumeRoleArn = config.bedrockAssumeRoleArn || '';
  config.bedrockExternalId = config.bedrockExternalId || '';
  if (config.allowedUsersForAI == null) config.allowedUsersForAI = '';
  return config;
}

export function credentialFieldDisplayValue(value) {
  if (typeof value === 'string') return value;
  if (isSecretPointerValue(value)) return CREDENTIAL_MASK;
  return '';
}

export function credentialFieldHasVaultStorage(value) {
  if (isSecretPointerValue(value)) return true;
  if (typeof value === 'string' && value.trim() === CREDENTIAL_MASK) return true;
  return false;
}
