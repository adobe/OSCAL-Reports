/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * AWS Bedrock credential resolution (Phase 2): access keys or IAM role (instance profile / assume role).
 */
import https from 'https';
import { MASK } from './sensitiveConfigKeys.js';

export const BEDROCK_AUTH_ACCESS_KEYS = 'access-keys';
export const BEDROCK_AUTH_IAM_ROLE = 'iam-role';
/** Fixed STS session name — must match Account B trust policy StringLike condition. */
export const BEDROCK_ASSUME_ROLE_SESSION_NAME = 'oscal-bedrock-session';

/**
 * @param {Object} [aiConfig]
 * @returns {'access-keys'|'iam-role'}
 */
export function normalizeBedrockAuthMode(aiConfig) {
  const raw = (aiConfig?.bedrockAuthMode || '').trim().toLowerCase();
  if (raw === BEDROCK_AUTH_IAM_ROLE || raw === 'iam-role' || raw === 'iam' || raw === 'role' || raw === 'assume-role') {
    return BEDROCK_AUTH_IAM_ROLE;
  }
  return BEDROCK_AUTH_ACCESS_KEYS;
}

/**
 * Merge saved AI config with optional overrides from API request (test / list models before save).
 * @param {Object} resolvedAiConfig
 * @param {Object} [overrides]
 */
export function mergeBedrockAiConfig(resolvedAiConfig, overrides = {}) {
  const ai = { ...(resolvedAiConfig || {}) };
  if (overrides.bedrockAuthMode != null && String(overrides.bedrockAuthMode).trim()) {
    ai.bedrockAuthMode = String(overrides.bedrockAuthMode).trim();
  }
  if (overrides.bedrockAssumeRoleArn != null) {
    ai.bedrockAssumeRoleArn = String(overrides.bedrockAssumeRoleArn).trim();
  }
  if (overrides.bedrockExternalId != null) {
    ai.bedrockExternalId = String(overrides.bedrockExternalId).trim();
  }
  if (overrides.awsRegion != null && String(overrides.awsRegion).trim()) {
    ai.awsRegion = String(overrides.awsRegion).trim();
  }
  if (overrides.awsAccessKeyId != null && typeof overrides.awsAccessKeyId === 'string') {
    ai.awsAccessKeyId = overrides.awsAccessKeyId;
  }
  if (overrides.awsSecretAccessKey != null && typeof overrides.awsSecretAccessKey === 'string') {
    ai.awsSecretAccessKey = overrides.awsSecretAccessKey;
  }
  return ai;
}

/**
 * @param {Object} aiConfig - Resolved aiConfig
 */
export function bedrockCredentialsConfigured(aiConfig) {
  const mode = normalizeBedrockAuthMode(aiConfig);
  if (mode === BEDROCK_AUTH_IAM_ROLE) {
    return true;
  }
  const accessKeyId = (aiConfig?.awsAccessKeyId && String(aiConfig.awsAccessKeyId).trim()) || '';
  const secretAccessKey = (aiConfig?.awsSecretAccessKey && String(aiConfig.awsSecretAccessKey).trim()) || '';
  return Boolean(accessKeyId && secretAccessKey);
}

/**
 * Static access key pair from resolved config.
 * @param {Object} aiConfig
 */
export function getBedrockStaticCredentials(aiConfig) {
  const accessKeyId = (aiConfig?.awsAccessKeyId && String(aiConfig.awsAccessKeyId).trim()) || '';
  const secretAccessKey = (aiConfig?.awsSecretAccessKey && String(aiConfig.awsSecretAccessKey).trim()) || '';
  if (!accessKeyId || !secretAccessKey) {
    return null;
  }
  return { accessKeyId, secretAccessKey };
}

/**
 * Resolve AWS credentials for Bedrock SDK clients.
 * @param {Object} aiConfig - Resolved (and optionally merged) aiConfig
 * @returns {Promise<{ accessKeyId: string, secretAccessKey: string }|import('@aws-sdk/types').AwsCredentialIdentityProvider>}
 */
export async function resolveBedrockCredentials(aiConfig) {
  const mode = normalizeBedrockAuthMode(aiConfig);
  if (mode === BEDROCK_AUTH_ACCESS_KEYS) {
    const staticCreds = getBedrockStaticCredentials(aiConfig);
    if (!staticCreds) {
      throw new Error(
        'AWS access keys are required. Enter Access Key ID and Secret Access Key in AI settings, or store them in the pass vault.'
      );
    }
    return staticCreds;
  }

  const { fromNodeProviderChain, fromTemporaryCredentials } = await import('@aws-sdk/credential-providers');

  const assumeRoleArn =
    (aiConfig?.bedrockAssumeRoleArn && String(aiConfig.bedrockAssumeRoleArn).trim()) ||
    (process.env.BEDROCK_ASSUME_ROLE_ARN && String(process.env.BEDROCK_ASSUME_ROLE_ARN).trim()) ||
    '';
  const externalId =
    (aiConfig?.bedrockExternalId && String(aiConfig.bedrockExternalId).trim()) ||
    (process.env.BEDROCK_EXTERNAL_ID && String(process.env.BEDROCK_EXTERNAL_ID).trim()) ||
    '';

  const baseProvider = fromNodeProviderChain();

  if (assumeRoleArn) {
    const params = {
      RoleArn: assumeRoleArn,
      RoleSessionName: BEDROCK_ASSUME_ROLE_SESSION_NAME,
      DurationSeconds: 3600
    };
    if (externalId) {
      params.ExternalId = externalId;
    }
    return fromTemporaryCredentials({
      params,
      masterCredentials: baseProvider
    });
  }

  return baseProvider;
}

/**
 * Shared HTTPS handler for Bedrock runtime clients (SSL / timeouts).
 * @param {Object} [options]
 * @param {number} [options.socketTimeout]
 */
export async function createBedrockNodeHttpHandler(options = {}) {
  const { NodeHttpHandler } = await import('@smithy/node-http-handler');
  const httpsAgent = new https.Agent({
    rejectUnauthorized: process.env.NODE_ENV === 'production',
    keepAlive: true
  });
  return new NodeHttpHandler({
    httpsAgent,
    connectionTimeout: options.connectionTimeout ?? 10000,
    socketTimeout: options.socketTimeout ?? 180000
  });
}

/**
 * @param {Object} aiConfig
 * @param {Object} [handlerOptions]
 */
export async function createBedrockRuntimeClient(aiConfig, handlerOptions = {}) {
  const { BedrockRuntimeClient } = await import('@aws-sdk/client-bedrock-runtime');
  const credentials = await resolveBedrockCredentials(aiConfig);
  const region = aiConfig?.awsRegion || 'us-east-1';
  const requestHandler = await createBedrockNodeHttpHandler(handlerOptions);
  return new BedrockRuntimeClient({
    region,
    credentials,
    requestHandler
  });
}

/**
 * @param {Object} aiConfig
 */
export async function createBedrockControlPlaneClient(aiConfig) {
  const { BedrockClient } = await import('@aws-sdk/client-bedrock');
  const credentials = await resolveBedrockCredentials(aiConfig);
  const region = aiConfig?.awsRegion || 'us-east-1';
  return new BedrockClient({
    region,
    credentials
  });
}

/**
 * Overlay query/body fields onto resolved aiConfig (preview before save).
 * @param {Object} resolvedAiConfig
 * @param {{ query?: Object, body?: Object }} [sources]
 */
export function buildBedrockAiConfigFromRequest(resolvedAiConfig, sources = {}) {
  const overrides = {};
  const pick = (src) => {
    if (!src) return;
    for (const key of [
      'bedrockAuthMode',
      'bedrockAssumeRoleArn',
      'bedrockExternalId',
      'awsRegion',
      'awsAccessKeyId',
      'awsSecretAccessKey'
    ]) {
      if (src[key] == null) return;
      const val = String(src[key]).trim();
      if (!val) return;
      if ((key === 'awsAccessKeyId' || key === 'awsSecretAccessKey') && val === MASK) return;
      overrides[key] = src[key];
    }
  };
  pick(sources.query);
  pick(sources.body);
  return mergeBedrockAiConfig(resolvedAiConfig, overrides);
}
