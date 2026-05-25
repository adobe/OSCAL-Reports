/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { describe, it, expect, jest } from '@jest/globals';
import { csrfProtection } from '../../../backend/middleware/csrfProtection.js';

function mockRes() {
  const res = {
    cookie: jest.fn(),
    status: jest.fn(),
    json: jest.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

describe('csrfProtection middleware', () => {
  it('issues csrfToken on GET and sets secret cookie when missing', () => {
    const req = { method: 'GET', cookies: {}, headers: {} };
    const res = mockRes();
    const next = jest.fn();

    csrfProtection(req, res, next);

    expect(res.cookie).toHaveBeenCalled();
    expect(typeof req.csrfToken).toBe('function');
    expect(req.csrfToken()).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(next).toHaveBeenCalled();
  });

  it('rejects POST when CSRF token is missing', () => {
    const req = { method: 'POST', cookies: { _csrf: 'secret' }, headers: {}, body: {} };
    const res = mockRes();
    const next = jest.fn();

    csrfProtection(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid CSRF token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts POST with valid X-CSRF-Token header', () => {
    const req = {
      method: 'GET',
      cookies: {},
      headers: {},
    };
    const res = mockRes();
    csrfProtection(req, res, jest.fn());
    const token = req.csrfToken();
    const secret = res.cookie.mock.calls[0][1];

    const postReq = {
      method: 'POST',
      cookies: { _csrf: secret },
      headers: { 'x-csrf-token': token },
      body: {},
    };
    const postRes = mockRes();
    const next = jest.fn();

    csrfProtection(postReq, postRes, next);

    expect(next).toHaveBeenCalled();
    expect(postRes.status).not.toHaveBeenCalled();
  });
});
