/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { ROLES } from '../auth/roles.js';

/**
 * Platform admins may access any job (matches list/delete job behavior).
 * @param {{ role?: string } | null | undefined} user
 * @returns {boolean}
 */
export function isJobAdmin(user) {
  return user?.role === ROLES.PLATFORM_ADMIN;
}

/**
 * Determine whether a user may read or download a job.
 * @param {Object | null | undefined} job
 * @param {{ id?: string, role?: string } | null | undefined} user
 * @returns {{ allowed: boolean, status?: number, error?: string }}
 */
export function canAccessJob(job, user) {
  if (!job) {
    return { allowed: false, status: 404, error: 'Job not found' };
  }

  if (!user?.id) {
    return { allowed: false, status: 401, error: 'Authentication required' };
  }

  if (isJobAdmin(user)) {
    return { allowed: true };
  }

  const ownerId = job.metadata?.userId;
  if (!ownerId || ownerId !== user.id) {
    return { allowed: false, status: 403, error: 'Not authorized to access this job' };
  }

  return { allowed: true };
}

/**
 * Strip sensitive job fields before returning status to clients.
 * @param {Object | null | undefined} job
 * @returns {Object | null}
 */
export function sanitizeJobForClient(job) {
  if (!job) {
    return null;
  }

  const safe = {
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    error: job.error,
    hasResult: job.hasResult ?? false,
  };

  if (job.metadata?.username) {
    safe.metadata = { username: job.metadata.username };
  }

  return safe;
}

/**
 * Structured security log for job authorization events.
 * @param {string} action
 * @param {{ id?: string, username?: string, role?: string } | null | undefined} user
 * @param {'success' | 'failure'} outcome
 * @param {Object} [extra]
 */
export function logJobSecurityEvent(action, user, outcome, extra = {}) {
  console.log(JSON.stringify({
    level: outcome === 'success' ? 'info' : 'warning',
    message: 'Job security event',
    'service.name': 'oscal-report-generator',
    'event.action': action,
    'event.category': 'authorization',
    'event.outcome': outcome,
    'user.id': user?.id || '',
    'user.role': user?.role || '',
    'user.name': user?.username || '',
    ...extra,
  }));
}
