/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
/**
 * List of sensitive config paths (dot-notation) and their pass entry names.
 * Order: messaging, ai, then SSO (nested under ssoConfig.oauth.providers).
 */
export const SENSITIVE_CONFIG_KEYS = [
  { path: 'messagingConfig.email.smtpPassword', smEntry: 'OSCAL/smtp-password', passEntry: 'OSCAL/smtp-password' },
  { path: 'messagingConfig.slack.webhookUrl', smEntry: 'OSCAL/slack-webhook-url', passEntry: 'OSCAL/slack-webhook-url' },
  { path: 'aiConfig.apiToken', smEntry: 'OSCAL/ai-api-token', passEntry: 'OSCAL/ai-api-token' },
  { path: 'aiConfig.awsAccessKeyId', smEntry: 'OSCAL/ai-aws-access-key-id', passEntry: 'OSCAL/ai-aws-access-key-id' },
  { path: 'aiConfig.awsSecretAccessKey', smEntry: 'OSCAL/ai-aws-secret-access-key', passEntry: 'OSCAL/ai-aws-secret-access-key' },
  { path: 'ssoConfig.oauth.providers.azure.clientSecret', smEntry: 'OSCAL/sso-oauth-azure-client-secret', passEntry: 'OSCAL/sso-oauth-azure-client-secret' },
  { path: 'ssoConfig.oauth.providers.google.clientSecret', smEntry: 'OSCAL/sso-oauth-google-client-secret', passEntry: 'OSCAL/sso-oauth-google-client-secret' },
  { path: 'ssoConfig.oauth.providers.okta.clientSecret', smEntry: 'OSCAL/sso-oauth-okta-client-secret', passEntry: 'OSCAL/sso-oauth-okta-client-secret' },
  { path: 'ssoConfig.oauth.providers.github.clientSecret', smEntry: 'OSCAL/sso-oauth-github-client-secret', passEntry: 'OSCAL/sso-oauth-github-client-secret' },
  { path: 'databaseConfig.password', smEntry: 'OSCAL/database-password', passEntry: 'OSCAL/database-password' }
];

const MASK = '********';

/**
 * Get value at dot-notation path (e.g. 'messagingConfig.email.smtpPassword').
 * @param {Object} obj - Config object
 * @param {string} path - Dot-separated path
 * @returns {*} Value or undefined
 */
export function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let current = obj;
  for (const p of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[p];
  }
  return current;
}

/**
 * Set value at dot-notation path. Creates nested objects as needed.
 * @param {Object} obj - Config object (mutated)
 * @param {string} path - Dot-separated path
 * @param {*} value - Value to set
 */
export function setByPath(obj, path, value) {
  if (!obj || !path) return;
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (current[p] == null || typeof current[p] !== 'object') {
      current[p] = {};
    }
    current = current[p];
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Check if a value is a "masked" placeholder (user did not send real secret).
 * @param {*} value - Incoming value
 * @returns {boolean}
 */
export function isSecretPointer(value) {
  if (!value || typeof value !== 'object') return false;
  return (typeof value._sm === 'string' && value._sm.trim() !== '')
    || (typeof value._pass === 'string' && value._pass.trim() !== '');
}

export function isMaskedOrEmpty(value) {
  if (value == null) return true;
  if (typeof value !== 'string') {
    if (isSecretPointer(value)) return true;
    return false;
  }
  const s = value.trim();
  return s === '' || s === MASK;
}

export { MASK };
