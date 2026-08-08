/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Build client-safe settings responses for GET/POST /api/settings endpoints.
 */
import { applyDatabaseEnvOverrides } from '../configManager.js';
import {
  applyRoleBasedConfigRedaction,
  maskSensitiveConfigForClient,
} from './resolveStoredSecret.js';

/**
 * Apply defaults and secret masking for admin GET /api/settings responses.
 * @param {Object} rawConfig - Raw config from loadConfig()
 * @param {{ role?: string }|null|undefined} user
 * @returns {Object}
 */
export function buildAdminSettingsResponse(rawConfig, user) {
  const config = JSON.parse(JSON.stringify(rawConfig));
  if (config.aiConfig) {
    if (!config.aiConfig.awsRegion || !String(config.aiConfig.awsRegion).trim()) {
      config.aiConfig.awsRegion = 'us-east-1';
    }
    if (!config.aiConfig.bedrockAuthMode) {
      config.aiConfig.bedrockAuthMode = 'access-keys';
    }
  }
  applyDatabaseEnvOverrides(config);
  if (config.databaseConfig?.authMode === 'iam') {
    config.databaseConfig.password = '';
  }
  const skipMask = config.databaseConfig?.authMode === 'iam'
    ? ['databaseConfig.password']
    : [];
  if (config.aiConfig?.bedrockAuthMode === 'iam-role') {
    skipMask.push('aiConfig.awsAccessKeyId', 'aiConfig.awsSecretAccessKey');
  }
  const roleSkipPaths = applyRoleBasedConfigRedaction(config, user);
  maskSensitiveConfigForClient(config, { skipPaths: [...skipMask, ...roleSkipPaths] });
  return config;
}

/**
 * Minimal runtime settings for non-admin authenticated clients.
 * @param {Object} rawConfig - Raw config from loadConfig()
 * @returns {{ databaseConfig: { enabled: boolean }, publishedSoaUrl: string }}
 */
export function buildRuntimeSettingsResponse(rawConfig) {
  const config = JSON.parse(JSON.stringify(rawConfig));
  applyDatabaseEnvOverrides(config);
  return {
    databaseConfig: {
      enabled: !!(config.databaseConfig?.enabled),
    },
    publishedSoaUrl: typeof config.publishedSoaUrl === 'string' ? config.publishedSoaUrl : '',
  };
}

/**
 * Redact saved config returned from POST /api/settings success response.
 * @param {Object} rawConfig - Raw config from loadConfig()
 * @param {{ role?: string }|null|undefined} user
 * @returns {Object}
 */
export function sanitizeSettingsSaveResponse(rawConfig, user) {
  return buildAdminSettingsResponse(rawConfig, user);
}

/**
 * Structured audit log for settings endpoint access (no secrets).
 * @param {'settings_get'|'settings_post'|'settings_runtime_get'} action
 * @param {{ role?: string, username?: string }|null|undefined} user
 * @param {'success'|'failure'} outcome
 * @param {Object} [extra]
 */
export function logSettingsAccess(action, user, outcome, extra = {}) {
  console.log(JSON.stringify({
    level: outcome === 'success' ? 'info' : 'error',
    message: 'Settings accessed',
    'service.name': 'oscal-report-generator',
    'event.action': action,
    'event.category': 'configuration',
    'event.outcome': outcome,
    'user.role': user?.role || '',
    'user.name': user?.username || '',
    ...extra,
  }));
}
