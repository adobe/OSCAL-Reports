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
  { path: 'messagingConfig.email.smtpPassword', passEntry: 'OSCAL/smtp-password' },
  { path: 'messagingConfig.slack.webhookUrl', passEntry: 'OSCAL/slack-webhook-url' },
  { path: 'aiConfig.apiToken', passEntry: 'OSCAL/ai-api-token' },
  { path: 'aiConfig.awsAccessKeyId', passEntry: 'OSCAL/ai-aws-access-key-id' },
  { path: 'aiConfig.awsSecretAccessKey', passEntry: 'OSCAL/ai-aws-secret-access-key' },
  { path: 'ssoConfig.oauth.providers.azure.clientSecret', passEntry: 'OSCAL/sso-oauth-azure-client-secret' },
  { path: 'ssoConfig.oauth.providers.google.clientSecret', passEntry: 'OSCAL/sso-oauth-google-client-secret' },
  { path: 'ssoConfig.oauth.providers.okta.clientSecret', passEntry: 'OSCAL/sso-oauth-okta-client-secret' },
  { path: 'ssoConfig.oauth.providers.github.clientSecret', passEntry: 'OSCAL/sso-oauth-github-client-secret' },
  { path: 'databaseConfig.password', passEntry: 'OSCAL/database-password' }
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
export function isMaskedOrEmpty(value) {
  if (value == null) return true;
  if (typeof value !== 'string') {
    // Pointer object { _pass: "..." } means keep existing
    if (typeof value === 'object' && value._pass) return true;
    return false;
  }
  const s = value.trim();
  return s === '' || s === MASK;
}

export { MASK };
