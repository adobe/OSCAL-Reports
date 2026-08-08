/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { describe, it, expect } from '@jest/globals';
import {
  DEFAULT_OIDC_GROUP_TO_ROLE_MAPPING,
  mergeDefaultOidcGroupToRoleMapping,
  applyDefaultOidcGroupMappingsToConfig,
} from '../../../backend/utils/defaultOidcGroupRoleMapping.js';
import { ROLES } from '../../../backend/auth/roles.js';

describe('defaultOidcGroupRoleMapping', () => {
  it('includes Adobe AMS default groups with correct roles', () => {
    expect(DEFAULT_OIDC_GROUP_TO_ROLE_MAPPING['GRP-TECHGRC-ALL']).toBe(ROLES.ASSESSOR);
    expect(DEFAULT_OIDC_GROUP_TO_ROLE_MAPPING['GRP-TECHGRC-ASSURANCE-MANAGERS']).toBe(ROLES.ASSESSOR);
    expect(DEFAULT_OIDC_GROUP_TO_ROLE_MAPPING['DL-AMS-Security']).toBe(ROLES.PLATFORM_ADMIN);
    expect(DEFAULT_OIDC_GROUP_TO_ROLE_MAPPING.Adobe_MS_IDP_Admin).toBe(ROLES.PLATFORM_ADMIN);
  });

  it('mergeDefaultOidcGroupToRoleMapping keeps user-added groups', () => {
    const merged = mergeDefaultOidcGroupToRoleMapping({ 'Custom-Group': ROLES.USER });
    expect(merged['Custom-Group']).toBe(ROLES.USER);
    expect(merged['GRP-TECHGRC-ALL']).toBe(ROLES.ASSESSOR);
  });

  it('user override wins for same group name', () => {
    const merged = mergeDefaultOidcGroupToRoleMapping({ 'GRP-TECHGRC-ALL': ROLES.USER });
    expect(merged['GRP-TECHGRC-ALL']).toBe(ROLES.USER);
  });

  it('applyDefaultOidcGroupMappingsToConfig merges into ssoConfig.oauth', () => {
    const cfg = { ssoConfig: { oauth: { groupToRoleMapping: { Extra: ROLES.ASSESSOR } } } };
    applyDefaultOidcGroupMappingsToConfig(cfg);
    expect(cfg.ssoConfig.oauth.groupToRoleMapping.Extra).toBe(ROLES.ASSESSOR);
    expect(cfg.ssoConfig.oauth.groupToRoleMapping['GRP-TECHGRC-ALL']).toBe(ROLES.ASSESSOR);
  });
});
