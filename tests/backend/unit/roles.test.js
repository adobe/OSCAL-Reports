/**
 * RBAC (Role-Based Access Control) Unit Tests
 * Location: tests/backend/unit/roles.test.js
 */

import { describe, test, expect } from '@jest/globals';
import { ROLES, PERMISSIONS, hasPermission, getRolePermissions } from '../../../backend/auth/roles.js';

describe('RBAC System', () => {
  describe('Role Definitions', () => {
    test('should have all required roles defined', () => {
      expect(ROLES.PLATFORM_ADMIN).toBe('Platform Admin');
      expect(ROLES.USER).toBe('User');
      expect(ROLES.ASSESSOR).toBe('Assessor');
    });

    test('should have all required permissions defined', () => {
      expect(PERMISSIONS.MANAGE_USERS).toBe('manage_users');
      expect(PERMISSIONS.EDIT_SETTINGS).toBe('edit_settings');
      expect(PERMISSIONS.VIEW_SETTINGS).toBe('view_settings');
      expect(PERMISSIONS.EDIT_CONTROLS).toBe('edit_controls');
      expect(PERMISSIONS.VIEW_REPORTS).toBe('view_reports');
      expect(PERMISSIONS.EXPORT_REPORTS).toBe('export_reports');
      expect(PERMISSIONS.EDIT_SYSTEM_INFO).toBe('edit_system_info');
    });
  });

  describe('Permission Checks', () => {
    test('Platform Admin should have all permissions', () => {
      const role = ROLES.PLATFORM_ADMIN;
      
      expect(hasPermission(role, PERMISSIONS.MANAGE_USERS)).toBe(true);
      expect(hasPermission(role, PERMISSIONS.EDIT_SETTINGS)).toBe(true);
      expect(hasPermission(role, PERMISSIONS.VIEW_SETTINGS)).toBe(true);
      expect(hasPermission(role, PERMISSIONS.EDIT_CONTROLS)).toBe(true);
      expect(hasPermission(role, PERMISSIONS.VIEW_REPORTS)).toBe(true);
      expect(hasPermission(role, PERMISSIONS.EXPORT_REPORTS)).toBe(true);
      expect(hasPermission(role, PERMISSIONS.EDIT_SYSTEM_INFO)).toBe(true);
    });

    test('User should have editing permissions but not admin permissions', () => {
      const role = ROLES.USER;
      
      expect(hasPermission(role, PERMISSIONS.MANAGE_USERS)).toBe(false);
      expect(hasPermission(role, PERMISSIONS.EDIT_SETTINGS)).toBe(false);
      expect(hasPermission(role, PERMISSIONS.VIEW_SETTINGS)).toBe(true);
      expect(hasPermission(role, PERMISSIONS.EDIT_CONTROLS)).toBe(true);
      expect(hasPermission(role, PERMISSIONS.VIEW_REPORTS)).toBe(true);
      expect(hasPermission(role, PERMISSIONS.EXPORT_REPORTS)).toBe(true);
      expect(hasPermission(role, PERMISSIONS.EDIT_SYSTEM_INFO)).toBe(true);
    });

    test('Assessor should have limited permissions', () => {
      const role = ROLES.ASSESSOR;
      
      expect(hasPermission(role, PERMISSIONS.MANAGE_USERS)).toBe(false);
      expect(hasPermission(role, PERMISSIONS.EDIT_SETTINGS)).toBe(false);
      expect(hasPermission(role, PERMISSIONS.VIEW_SETTINGS)).toBe(true);
      expect(hasPermission(role, PERMISSIONS.EDIT_CONTROLS)).toBe(false);
      expect(hasPermission(role, PERMISSIONS.VIEW_REPORTS)).toBe(true);
      expect(hasPermission(role, PERMISSIONS.EXPORT_REPORTS)).toBe(true);
      expect(hasPermission(role, PERMISSIONS.EDIT_ASSESSOR_DETAILS)).toBe(true);
    });

    test('should return false for undefined role', () => {
      expect(hasPermission('UnknownRole', PERMISSIONS.EDIT_CONTROLS)).toBe(false);
    });

    test('should return false for undefined permission', () => {
      expect(hasPermission(ROLES.USER, 'unknown_permission')).toBe(false);
    });
  });

  describe('Get Role Permissions', () => {
    test('should return all permissions for Platform Admin', () => {
      const permissions = getRolePermissions(ROLES.PLATFORM_ADMIN);
      
      expect(permissions).toContain(PERMISSIONS.MANAGE_USERS);
      expect(permissions).toContain(PERMISSIONS.EDIT_SETTINGS);
      expect(permissions.length).toBeGreaterThan(5);
    });

    test('should return correct permissions for User', () => {
      const permissions = getRolePermissions(ROLES.USER);
      
      expect(permissions).toContain(PERMISSIONS.EDIT_CONTROLS);
      expect(permissions).toContain(PERMISSIONS.VIEW_REPORTS);
      expect(permissions).not.toContain(PERMISSIONS.MANAGE_USERS);
      expect(permissions).not.toContain(PERMISSIONS.EDIT_SETTINGS);
    });

    test('should return correct permissions for Assessor', () => {
      const permissions = getRolePermissions(ROLES.ASSESSOR);
      
      expect(permissions).toContain(PERMISSIONS.EDIT_ASSESSOR_DETAILS);
      expect(permissions).toContain(PERMISSIONS.VIEW_REPORTS);
      expect(permissions).not.toContain(PERMISSIONS.MANAGE_USERS);
      expect(permissions).not.toContain(PERMISSIONS.EDIT_CONTROLS);
    });

    test('should return empty array for unknown role', () => {
      const permissions = getRolePermissions('UnknownRole');
      
      expect(permissions).toEqual([]);
    });
  });
});
