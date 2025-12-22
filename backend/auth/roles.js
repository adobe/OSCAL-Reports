/**
 * RBAC (Role-Based Access Control) Configuration
 * Defines roles, permissions, and access control rules
 */

// Define role constants
export const ROLES = {
  PLATFORM_ADMIN: 'Platform Admin',
  USER: 'User',
  ASSESSOR: 'Assessor'
};

// Define permission constants
export const PERMISSIONS = {
  // Settings permissions
  EDIT_SETTINGS: 'edit_settings',
  VIEW_SETTINGS: 'view_settings',
  
  // System Info permissions
  EDIT_SYSTEM_INFO: 'edit_system_info',
  EDIT_ASSESSOR_DETAILS: 'edit_assessor_details',
  EDIT_IMPLEMENTATION_STATUS: 'edit_implementation_status',
  EDIT_TESTING_METHOD: 'edit_testing_method',
  VIEW_SYSTEM_INFO: 'view_system_info',
  
  // User management permissions
  MANAGE_USERS: 'manage_users',
  VIEW_USERS: 'view_users',
  
  // General permissions
  EDIT_CONTROLS: 'edit_controls',
  VIEW_REPORTS: 'view_reports',
  EXPORT_REPORTS: 'export_reports',
  COMPARE_REPORTS: 'compare_reports',
  
  // AI Telemetry Log permissions
  VIEW_AI_LOGS: 'view_ai_logs',
  MANAGE_AI_LOGS: 'manage_ai_logs'
};

// Map roles to their permissions
export const ROLE_PERMISSIONS = {
  [ROLES.PLATFORM_ADMIN]: [
    // Admin has all permissions
    PERMISSIONS.EDIT_SETTINGS,
    PERMISSIONS.VIEW_SETTINGS,
    PERMISSIONS.EDIT_SYSTEM_INFO,
    PERMISSIONS.EDIT_ASSESSOR_DETAILS,
    PERMISSIONS.EDIT_IMPLEMENTATION_STATUS,
    PERMISSIONS.EDIT_TESTING_METHOD,
    PERMISSIONS.VIEW_SYSTEM_INFO,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.VIEW_USERS,
    PERMISSIONS.EDIT_CONTROLS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.EXPORT_REPORTS,
    PERMISSIONS.COMPARE_REPORTS,
    PERMISSIONS.VIEW_AI_LOGS,
    PERMISSIONS.MANAGE_AI_LOGS
  ],
  [ROLES.USER]: [
    // User can edit most fields except settings and assessor-specific fields
    PERMISSIONS.VIEW_SETTINGS,
    PERMISSIONS.EDIT_SYSTEM_INFO,
    PERMISSIONS.VIEW_SYSTEM_INFO,
    PERMISSIONS.EDIT_CONTROLS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.EXPORT_REPORTS,
    PERMISSIONS.COMPARE_REPORTS
  ],
  [ROLES.ASSESSOR]: [
    // Assessor can only edit specific fields in System Info
    PERMISSIONS.VIEW_SETTINGS,
    PERMISSIONS.EDIT_ASSESSOR_DETAILS,
    PERMISSIONS.EDIT_IMPLEMENTATION_STATUS,
    PERMISSIONS.EDIT_TESTING_METHOD,
    PERMISSIONS.VIEW_SYSTEM_INFO,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.EXPORT_REPORTS,
    PERMISSIONS.COMPARE_REPORTS
  ]
};

/**
 * Check if a role has a specific permission
 * @param {string} role - User role
 * @param {string} permission - Permission to check
 * @returns {boolean}
 */
export function hasPermission(role, permission) {
  if (!role || !ROLE_PERMISSIONS[role]) {
    return false;
  }
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Check if a role can edit settings
 * @param {string} role - User role
 * @returns {boolean}
 */
export function canEditSettings(role) {
  return hasPermission(role, PERMISSIONS.EDIT_SETTINGS);
}

/**
 * Check if a role can edit assessor details
 * @param {string} role - User role
 * @returns {boolean}
 */
export function canEditAssessorDetails(role) {
  return hasPermission(role, PERMISSIONS.EDIT_ASSESSOR_DETAILS);
}

/**
 * Check if a role can edit implementation status
 * @param {string} role - User role
 * @returns {boolean}
 */
export function canEditImplementationStatus(role) {
  return hasPermission(role, PERMISSIONS.EDIT_IMPLEMENTATION_STATUS);
}

/**
 * Check if a role can edit testing method
 * @param {string} role - User role
 * @returns {boolean}
 */
export function canEditTestingMethod(role) {
  return hasPermission(role, PERMISSIONS.EDIT_TESTING_METHOD);
}

/**
 * Check if a role can edit general system info
 * @param {string} role - User role
 * @returns {boolean}
 */
export function canEditSystemInfo(role) {
  return hasPermission(role, PERMISSIONS.EDIT_SYSTEM_INFO);
}

/**
 * Check if a role can manage users
 * @param {string} role - User role
 * @returns {boolean}
 */
export function canManageUsers(role) {
  return hasPermission(role, PERMISSIONS.MANAGE_USERS);
}

/**
 * Get all available roles
 * @returns {Array<string>}
 */
export function getAllRoles() {
  return Object.values(ROLES);
}

/**
 * Validate if a role exists
 * @param {string} role - Role to validate
 * @returns {boolean}
 */
export function isValidRole(role) {
  return Object.values(ROLES).includes(role);
}

export default {
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  hasPermission,
  canEditSettings,
  canEditAssessorDetails,
  canEditImplementationStatus,
  canEditTestingMethod,
  canEditSystemInfo,
  canManageUsers,
  getAllRoles,
  isValidRole
};

