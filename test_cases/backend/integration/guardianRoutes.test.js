/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from '../../../backend/node_modules/express/index.js';
import request from '../../../backend/node_modules/supertest/index.js';
import { guardianJsonMiddleware, registerGuardianRoutes } from '../../../backend/guardianRoutes.js';
import { GuardianError } from '../../../backend/guardianService.js';

let app, service;
beforeEach(() => {
  app = express();
  app.use('/api/guardian', guardianJsonMiddleware);
  service = { status: jest.fn().mockResolvedValue({ ready: true, targets: [] }),
    apply: jest.fn().mockResolvedValue({ success: true, operationId: 'test' }) };
  registerGuardianRoutes(app, (req, res, next) => {
    if (req.headers.authorization !== 'Bearer session' && req.headers['x-test-cookie'] !== 'yes') return res.sendStatus(401);
    req.user = { userId: 'test-user' };
    next();
  }, service);
});

describe('Guardian routes', () => {
  it('requires authentication for status and apply', async () => {
    expect((await request(app).get('/api/guardian/status')).status).toBe(401);
    expect((await request(app).post('/api/guardian/apply').send({})).status).toBe(401);
  });
  it('does not cache status', async () => {
    const response = await request(app).get('/api/guardian/status').set('Authorization', 'Bearer session');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
  });
  it('rejects cookie-only apply even if session authentication succeeds', async () => {
    const response = await request(app).post('/api/guardian/apply').set('x-test-cookie', 'yes').send({});
    expect(response.status).toBe(401);
    expect(service.apply).not.toHaveBeenCalled();
  });
  it('passes only authenticated session identity and request payload to the service', async () => {
    const response = await request(app).post('/api/guardian/apply').set('Authorization', 'Bearer session').send({ targetId: 'test' });
    expect(response.status).toBe(200);
    expect(service.apply).toHaveBeenCalledWith({ userId: 'test-user' }, { targetId: 'test' });
  });
  it('returns safe known errors and hides unexpected internals', async () => {
    service.apply.mockRejectedValueOnce(new GuardianError(403, 'guardian_target_denied', 'Target denied.'));
    const denied = await request(app).post('/api/guardian/apply').set('Authorization', 'Bearer session').send({});
    expect(denied.status).toBe(403);
    service.apply.mockRejectedValueOnce(new Error('Bearer very-secret-token'));
    const failed = await request(app).post('/api/guardian/apply').set('Authorization', 'Bearer session').send({});
    expect(failed.status).toBe(503);
    expect(JSON.stringify(failed.body)).not.toContain('very-secret-token');
  });
  it('enforces request size limits', async () => {
    const response = await request(app).post('/api/guardian/apply').set('Authorization', 'Bearer session').send({ ssp: 'x'.repeat(2 * 1024 * 1024) });
    expect(response.status).toBe(413);
    expect(response.body.error).toBe('Guardian request exceeds the 2 MiB limit.');
    expect(service.apply).not.toHaveBeenCalled();
  });
  it('returns safe parser errors without reflecting malformed document contents', async () => {
    const response = await request(app).post('/api/guardian/apply').set('Authorization', 'Bearer session')
      .set('Content-Type', 'application/json').send('{"sensitive-ssp":');
    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Invalid Guardian JSON request.');
    expect(JSON.stringify(response.body)).not.toContain('sensitive-ssp');
  });
});