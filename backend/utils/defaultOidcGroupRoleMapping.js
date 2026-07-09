/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Default Okta group → app role mappings for JIT / OIDC. Merged on config load and SSO save
 * so blue/green deploy and ASG instance refresh (S3 config restore) cannot drop them.
 * User-added groups are preserved; user overrides for the same group name win.
 */
import { ROLES } from '../auth/roles.js';

/**
 * TECHGRC groups → Assessor; names containing admin → Platform Admin; else User.
 * @type {Record<string, string>}
 */
export const DEFAULT_OIDC_GROUP_TO_ROLE_MAPPING = {
  // Authentik homelab (display names and legacy / token claim names)
  Assessor: ROLES.ASSESSOR,
  'Platform Admin': ROLES.PLATFORM_ADMIN,
  OSCAL_Assessor: ROLES.ASSESSOR,
  'OSCAL_Platform Admin': ROLES.PLATFORM_ADMIN,
  Adobe_MS_IDP_Admin: ROLES.PLATFORM_ADMIN,
  'GRP-TECHGRC-ALL': ROLES.ASSESSOR,
  'DL-AMS-Security': ROLES.PLATFORM_ADMIN,
  'GRP-TECHGRC-ASSURANCE-MANAGERS': ROLES.ASSESSOR,
  'GRP-TGRC-DEXTER': ROLES.USER,
  'GRP-AMS-GUTENBERG-TECH': ROLES.USER,
  'GRP-ALLADOBECOMMISSIONABLES': ROLES.USER,
  'DL-CSM-ManServ': ROLES.USER,
};

/**
 * @param {Object|null|undefined} mapping
 * @returns {Record<string, string>}
 */
export function mergeDefaultOidcGroupToRoleMapping(mapping) {
  const existing = mapping && typeof mapping === 'object' && !Array.isArray(mapping) ? mapping : {};
  return { ...DEFAULT_OIDC_GROUP_TO_ROLE_MAPPING, ...existing };
}

/**
 * @param {Object} config - Mutable or cloned config object
 * @returns {Object}
 */
export function applyDefaultOidcGroupMappingsToConfig(config) {
  if (!config?.ssoConfig?.oauth) return config;
  config.ssoConfig.oauth.groupToRoleMapping = mergeDefaultOidcGroupToRoleMapping(
    config.ssoConfig.oauth.groupToRoleMapping,
  );
  return config;
}
