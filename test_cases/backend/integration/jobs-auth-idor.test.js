/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { describe, test, expect, beforeAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { ROLES } from '../../../backend/auth/roles.js';
import { JOB_STATUS } from '../../../backend/jobQueue.js';
import {
  canAccessJob,
  isJobAdmin,
  sanitizeJobForClient,
} from '../../../backend/utils/jobAccess.js';

const MAX_CONCURRENT_JOBS_PER_USER = 5;

describe('Jobs auth and IDOR (VULN-37000)', () => {
  let app;
  let jobs;
  let activeCounts;
  const userAToken = 'token-user-a';
  const userBToken = 'token-user-b';
  const adminToken = 'token-admin';

  const users = {
    [userAToken]: { id: 'user-a', username: 'alice', role: ROLES.USER },
    [userBToken]: { id: 'user-b', username: 'bob', role: ROLES.USER },
    [adminToken]: { id: 'admin-1', username: 'admin', role: ROLES.PLATFORM_ADMIN },
  };

  function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const token = authHeader.substring(7);
    const user = users[token];
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    req.user = user;
    return next();
  }

  function enforceJobConcurrencyLimit(req, res, next) {
    const activeCount = activeCounts.get(req.user.id) || 0;
    if (activeCount >= MAX_CONCURRENT_JOBS_PER_USER) {
      return res.status(429).json({
        success: false,
        error: 'Too many active jobs',
      });
    }
    return next();
  }

  function denyJobAccess(req, res, access) {
    return res.status(access.status).json({ success: false, error: access.error });
  }

  function createJobRecord(type, metadata) {
    const jobId = `job-${jobs.size + 1}`;
    const job = {
      id: jobId,
      type,
      status: JOB_STATUS.QUEUED,
      metadata,
      data: { systemInfo: { systemName: 'TestSystem' } },
      progress: 0,
      createdAt: new Date().toISOString(),
      hasResult: false,
    };
    jobs.set(jobId, job);
    activeCounts.set(metadata.userId, (activeCounts.get(metadata.userId) || 0) + 1);
    return jobId;
  }

  let rateCounts;

  function jobCreationRateLimiter(req, res, next) {
    const count = rateCounts.get(req.user.id) || 0;
    if (count >= 2) {
      return res.status(429).json({ success: false, error: 'Too many job creation requests' });
    }
    rateCounts.set(req.user.id, count + 1);
    return next();
  }

  beforeAll(() => {
    jobs = new Map();
    activeCounts = new Map();
    rateCounts = new Map();

    app = express();
    app.use(express.json());

    const registerCreateRoute = (path, type) => {
      app.post(path, authenticate, jobCreationRateLimiter, enforceJobConcurrencyLimit, (req, res) => {
        const jobId = createJobRecord(type, {
          userId: req.user.id,
          username: req.user.username,
        });
        res.json({
          success: true,
          jobId,
          statusUrl: `/api/jobs/${jobId}`,
          downloadUrl: `/api/jobs/${jobId}/download`,
        });
      });
    };

    registerCreateRoute('/api/jobs/pdf', 'pdf-export');
    registerCreateRoute('/api/jobs/excel', 'excel-export');
    registerCreateRoute('/api/jobs/ccm', 'ccm-export');

    app.get('/api/jobs/:jobId', authenticate, (req, res) => {
      const job = jobs.get(req.params.jobId) || null;
      const access = canAccessJob(job, req.user);
      if (!access.allowed) {
        return denyJobAccess(req, res, access);
      }
      return res.json({ success: true, job: sanitizeJobForClient(job) });
    });

    app.get('/api/jobs/:jobId/download', authenticate, (req, res) => {
      const job = jobs.get(req.params.jobId) || null;
      const access = canAccessJob(job, req.user);
      if (!access.allowed) {
        return denyJobAccess(req, res, access);
      }
      if (job.status !== JOB_STATUS.COMPLETED) {
        return res.status(409).json({ success: false, error: 'Job not completed yet' });
      }
      return res.send(Buffer.from('pdf-content'));
    });

    app.get('/api/jobs', authenticate, (req, res) => {
      const filters = {};
      if (!isJobAdmin(req.user)) {
        filters.userId = req.user.id;
      }
      const listed = Array.from(jobs.values()).filter((job) => {
        if (filters.userId && job.metadata?.userId !== filters.userId) {
          return false;
        }
        return true;
      });
      res.json({
        success: true,
        count: listed.length,
        jobs: listed.map(sanitizeJobForClient),
      });
    });

    app.delete('/api/jobs/:jobId', authenticate, (req, res) => {
      const job = jobs.get(req.params.jobId) || null;
      const access = canAccessJob(job, req.user);
      if (!access.allowed) {
        return denyJobAccess(req, res, access);
      }
      jobs.delete(req.params.jobId);
      return res.json({ success: true, message: 'Job deleted successfully' });
    });
  });

  beforeEach(() => {
    jobs.clear();
    activeCounts.clear();
    rateCounts.clear();
  });

  test('POST /api/jobs/pdf without auth returns 401', async () => {
    await request(app)
      .post('/api/jobs/pdf')
      .send({ data: { systemInfo: { systemName: 'TEST' } } })
      .expect(401);
  });

  test('POST /api/jobs/excel and /ccm without auth return 401', async () => {
    await request(app).post('/api/jobs/excel').send({ controls: [] }).expect(401);
    await request(app).post('/api/jobs/ccm').send({ controls: [] }).expect(401);
  });

  test('authenticated create returns jobId and URLs', async () => {
    const response = await request(app)
      .post('/api/jobs/pdf')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ controls: [], systemInfo: { systemName: 'TEST' } })
      .expect(200);

    expect(response.body.success).toBe(true);
    expect(response.body.jobId).toBeTruthy();
    expect(response.body.statusUrl).toContain('/api/jobs/');
    expect(response.body.downloadUrl).toContain('/download');
  });

  test('user B cannot read user A job status (403)', async () => {
    const createRes = await request(app)
      .post('/api/jobs/pdf')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ controls: [] })
      .expect(200);

    await request(app)
      .get(createRes.body.statusUrl)
      .set('Authorization', `Bearer ${userBToken}`)
      .expect(403);
  });

  test('anonymous GET job status returns 401', async () => {
    const createRes = await request(app)
      .post('/api/jobs/pdf')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ controls: [] })
      .expect(200);

    await request(app).get(createRes.body.statusUrl).expect(401);
  });

  test('user B cannot download user A job (403)', async () => {
    const createRes = await request(app)
      .post('/api/jobs/pdf')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ controls: [] })
      .expect(200);

    const job = jobs.get(createRes.body.jobId);
    job.status = JOB_STATUS.COMPLETED;
    job.hasResult = true;

    await request(app)
      .get(createRes.body.downloadUrl)
      .set('Authorization', `Bearer ${userBToken}`)
      .expect(403);
  });

  test('owner can read sanitized status without metadata.ip or data', async () => {
    const createRes = await request(app)
      .post('/api/jobs/pdf')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ controls: [{ id: 'ac-1' }] })
      .expect(200);

    const job = jobs.get(createRes.body.jobId);
    job.metadata.ip = '192.168.1.50';

    const statusRes = await request(app)
      .get(createRes.body.statusUrl)
      .set('Authorization', `Bearer ${userAToken}`)
      .expect(200);

    expect(statusRes.body.job.metadata?.ip).toBeUndefined();
    expect(statusRes.body.job.data).toBeUndefined();
    expect(statusRes.body.job.metadata?.username).toBe('alice');
  });

  test('owner can download completed job', async () => {
    const createRes = await request(app)
      .post('/api/jobs/pdf')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ controls: [] })
      .expect(200);

    const job = jobs.get(createRes.body.jobId);
    job.status = JOB_STATUS.COMPLETED;
    job.hasResult = true;

    await request(app)
      .get(createRes.body.downloadUrl)
      .set('Authorization', `Bearer ${userAToken}`)
      .expect(200);
  });

  test('admin can access another user job', async () => {
    const createRes = await request(app)
      .post('/api/jobs/pdf')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ controls: [] })
      .expect(200);

    await request(app)
      .get(createRes.body.statusUrl)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  test('legacy job without userId is denied to non-admin (403)', async () => {
    jobs.set('legacy-job', {
      id: 'legacy-job',
      type: 'pdf-export',
      status: JOB_STATUS.COMPLETED,
      metadata: { ip: '10.0.0.1' },
      hasResult: true,
    });

    await request(app)
      .get('/api/jobs/legacy-job')
      .set('Authorization', `Bearer ${userAToken}`)
      .expect(403);

    await request(app)
      .get('/api/jobs/legacy-job')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  test('GET /api/jobs lists only own jobs for regular user', async () => {
    await request(app)
      .post('/api/jobs/pdf')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ controls: [] })
      .expect(200);

    await request(app)
      .post('/api/jobs/pdf')
      .set('Authorization', `Bearer ${userBToken}`)
      .send({ controls: [] })
      .expect(200);

    const listA = await request(app)
      .get('/api/jobs')
      .set('Authorization', `Bearer ${userAToken}`)
      .expect(200);

    expect(listA.body.count).toBe(1);
    expect(listA.body.jobs[0].metadata?.username).toBe('alice');
  });

  test('DELETE enforces owner-or-admin authorization', async () => {
    const createRes = await request(app)
      .post('/api/jobs/pdf')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ controls: [] })
      .expect(200);

    await request(app)
      .delete(createRes.body.statusUrl)
      .set('Authorization', `Bearer ${userBToken}`)
      .expect(403);

    await request(app)
      .delete(createRes.body.statusUrl)
      .set('Authorization', `Bearer ${userAToken}`)
      .expect(200);
  });

  test('concurrent job cap returns 429', async () => {
    activeCounts.set('user-a', MAX_CONCURRENT_JOBS_PER_USER);

    await request(app)
      .post('/api/jobs/pdf')
      .set('Authorization', `Bearer ${userAToken}`)
      .send({ controls: [] })
      .expect(429);
  });

  test('window rate limit returns 429', async () => {
    activeCounts.set('user-b', 0);

    await request(app)
      .post('/api/jobs/pdf')
      .set('Authorization', `Bearer ${userBToken}`)
      .send({ controls: [] })
      .expect(200);
    await request(app)
      .post('/api/jobs/pdf')
      .set('Authorization', `Bearer ${userBToken}`)
      .send({ controls: [] })
      .expect(200);
    await request(app)
      .post('/api/jobs/pdf')
      .set('Authorization', `Bearer ${userBToken}`)
      .send({ controls: [] })
      .expect(429);
  });
});
