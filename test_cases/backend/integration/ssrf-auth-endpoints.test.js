/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { validateUrl } from '../../../backend/utils/urlValidator.js';
import { getSsrfValidationOptions } from '../../../backend/utils/securityConfig.js';
import {
  buildProxyFetchHeaders,
  isAllowedProxyFetchMethod,
} from '../../../backend/utils/proxyFetchHelpers.js';

describe('SSRF-protected endpoints require authentication', () => {
  let app;
  const validToken = 'test-session-token';

  beforeAll(() => {
    app = express();
    app.use(express.json());

    const authenticate = (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      if (authHeader.substring(7) !== validToken) {
        return res.status(401).json({ error: 'Invalid or expired session' });
      }
      req.user = { id: 'user-1', role: 'User' };
      next();
    };

    app.post('/api/proxy-fetch', authenticate, async (req, res) => {
      const { url, method = 'GET', headers = {} } = req.body;
      if (!url) {
        return res.status(400).json({ success: false, error: 'URL is required' });
      }
      if (!isAllowedProxyFetchMethod(method)) {
        return res.status(400).json({ success: false, error: 'Only GET and HEAD methods are allowed' });
      }
      const validation = await validateUrl(url, getSsrfValidationOptions('strictUserFetch'));
      if (!validation.valid) {
        return res.status(validation.blocked ? 403 : 400).json({
          success: false,
          error: validation.error,
          code: validation.blocked ? 'SSRF_BLOCKED' : undefined,
        });
      }
      const outboundHeaders = buildProxyFetchHeaders(headers);
      if (outboundHeaders['X-aws-ec2-metadata-token']) {
        return res.status(500).json({ success: false, error: 'Header leak' });
      }
      return res.json({
        success: true,
        url: validation.url,
        method,
        outboundHeaders,
      });
    });

    app.post('/api/fetch-catalogue', authenticate, async (req, res) => {
      const { url } = req.body;
      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }
      const validation = await validateUrl(url, getSsrfValidationOptions('strictCatalogueFetch'));
      if (!validation.valid) {
        return res.status(validation.blocked ? 403 : 400).json({
          error: validation.error,
          code: validation.blocked ? 'SSRF_BLOCKED' : undefined,
        });
      }
      return res.json({ success: true, catalogue: { url: validation.url } });
    });
  });

  test('POST /api/proxy-fetch without auth returns 401', async () => {
    const response = await request(app)
      .post('/api/proxy-fetch')
      .send({ url: 'https://example.com/data.json' })
      .expect(401);
    expect(response.body.error).toBe('Authentication required');
  });

  test('POST /api/fetch-catalogue without auth returns 401', async () => {
    await request(app)
      .post('/api/fetch-catalogue')
      .send({ url: 'https://raw.githubusercontent.com/example/catalog.json' })
      .expect(401);
  });

  test('authenticated proxy-fetch blocks hex localhost bypass', async () => {
    const response = await request(app)
      .post('/api/proxy-fetch')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ url: 'http://0x7f000001:3020/health', method: 'GET' })
      .expect(403);
    expect(response.body.code).toBe('SSRF_BLOCKED');
  });

  test('authenticated proxy-fetch rejects PUT method', async () => {
    const response = await request(app)
      .post('/api/proxy-fetch')
      .set('Authorization', `Bearer ${validToken}`)
      .send({
        url: 'https://example.com/latest/api/token',
        method: 'PUT',
        headers: { 'X-aws-ec2-metadata-token-ttl-seconds': '21600' },
      })
      .expect(400);
    expect(response.body.error).toContain('GET and HEAD');
  });

  test('authenticated proxy-fetch allows public HTTPS URL', async () => {
    const response = await request(app)
      .post('/api/proxy-fetch')
      .set('Authorization', `Bearer ${validToken}`)
      .send({ url: 'https://example.com/gateway/health', method: 'GET' })
      .expect(200);
    expect(response.body.success).toBe(true);
    expect(response.body.outboundHeaders['X-aws-ec2-metadata-token']).toBeUndefined();
  });
});
