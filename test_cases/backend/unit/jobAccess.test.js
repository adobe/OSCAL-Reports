/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { describe, test, expect } from '@jest/globals';
import {
  canAccessJob,
  isJobAdmin,
  sanitizeJobForClient,
} from '../../../backend/utils/jobAccess.js';
import { ROLES } from '../../../backend/auth/roles.js';

describe('jobAccess (VULN-37000)', () => {
  const ownerJob = {
    id: 'job-1',
    type: 'pdf-export',
    status: 'completed',
    metadata: { userId: 'user-a', username: 'alice', ip: '10.0.0.1' },
    data: { controls: [{ id: 'ac-1' }] },
    hasResult: true,
  };

  test('isJobAdmin recognizes Platform Admin', () => {
    expect(isJobAdmin({ role: ROLES.PLATFORM_ADMIN })).toBe(true);
    expect(isJobAdmin({ role: ROLES.USER })).toBe(false);
  });

  test('owner can access own job', () => {
    const result = canAccessJob(ownerJob, { id: 'user-a', role: ROLES.USER });
    expect(result).toEqual({ allowed: true });
  });

  test('admin can access any job', () => {
    const result = canAccessJob(ownerJob, { id: 'admin-1', role: ROLES.PLATFORM_ADMIN });
    expect(result).toEqual({ allowed: true });
  });

  test('other user is denied with 403', () => {
    const result = canAccessJob(ownerJob, { id: 'user-b', role: ROLES.USER });
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(403);
  });

  test('legacy job without userId is denied to non-admin', () => {
    const legacyJob = { ...ownerJob, metadata: { ip: '10.0.0.2' } };
    const result = canAccessJob(legacyJob, { id: 'user-a', role: ROLES.USER });
    expect(result.allowed).toBe(false);
    expect(result.status).toBe(403);
  });

  test('legacy job without userId is allowed for admin', () => {
    const legacyJob = { ...ownerJob, metadata: { ip: '10.0.0.2' } };
    const result = canAccessJob(legacyJob, { id: 'admin-1', role: ROLES.PLATFORM_ADMIN });
    expect(result).toEqual({ allowed: true });
  });

  test('missing job returns 404', () => {
    const result = canAccessJob(null, { id: 'user-a', role: ROLES.USER });
    expect(result.status).toBe(404);
  });

  test('missing user returns 401', () => {
    const result = canAccessJob(ownerJob, null);
    expect(result.status).toBe(401);
  });

  test('sanitizeJobForClient removes data, ip, and internal metadata', () => {
    const sanitized = sanitizeJobForClient(ownerJob);
    expect(sanitized).toMatchObject({
      id: 'job-1',
      type: 'pdf-export',
      status: 'completed',
      hasResult: true,
      metadata: { username: 'alice' },
    });
    expect(sanitized.data).toBeUndefined();
    expect(sanitized.metadata?.ip).toBeUndefined();
    expect(sanitized.metadata?.userId).toBeUndefined();
  });
});
