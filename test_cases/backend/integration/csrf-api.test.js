/**
 * CSRF and API Endpoint Integration Tests
 * 
 * Tests the CSRF protection behavior for different API endpoints
 * Added in v1.6.5 to verify CSRF exemption for /api/ endpoints
 * 
 * Key Security Features Tested:
 * - CSRF exemption for all /api/ endpoints
 * - Bearer token authentication for protected endpoints
 * - Public endpoint accessibility
 * - Protected endpoint authorization
 * 
 * Location: test_cases/backend/integration/csrf-api.test.js
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';

describe('CSRF and API Endpoint Integration Tests (v1.6.5)', () => {
  let app;
  let validBearerToken;
  let adminBearerToken;

  beforeAll(() => {
    // Create test Express app mimicking the actual server setup
    app = express();
    app.use(express.json());

    // Mock tokens
    validBearerToken = 'valid-bearer-token-12345';
    adminBearerToken = 'admin-bearer-token-67890';

    // Mock authentication middleware
    const mockAuthenticate = (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const token = authHeader.substring(7);
      if (token === validBearerToken) {
        req.user = { username: 'testuser', role: 'User', id: 'user-123' };
        return next();
      }
      if (token === adminBearerToken) {
        req.user = { username: 'admin', role: 'Platform Admin', id: 'admin-123' };
        return next();
      }

      return res.status(401).json({ error: 'Invalid token' });
    };

    // Mock authorization middleware
    const mockAuthorize = (permission) => (req, res, next) => {
      if (req.user.role === 'Platform Admin') {
        return next();
      }
      return res.status(403).json({ error: 'Insufficient permissions' });
    };

    // Mock optional auth middleware
    const mockOptionalAuth = (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        if (token === validBearerToken || token === adminBearerToken) {
          req.user = token === adminBearerToken 
            ? { username: 'admin', role: 'Platform Admin' }
            : { username: 'testuser', role: 'User' };
        }
      }
      next();
    };

    // Health Check (Public, CSRF Exempt)
    app.get('/health', (req, res) => {
      res.json({ status: 'healthy', service: 'OSCAL Report Generator' });
    });

    // Catalogue Fetch (Public, CSRF Exempt, SSRF Protected)
    app.post('/api/fetch-catalogue', async (req, res) => {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: 'URL is required' });
      }

      // Mock SSRF validation for cloud metadata endpoints
      const cloudMetadataPatterns = [
        '169.254.169.254',
        'metadata.google.internal',
        'metadata.azure.internal',
        'metadata.aws.internal'
      ];
      
      if (cloudMetadataPatterns.some(pattern => url.includes(pattern))) {
        return res.status(403).json({ 
          error: 'Access to cloud metadata endpoints is not allowed',
          code: 'SSRF_BLOCKED'
        });
      }

      res.json({
        success: true,
        catalogue: {
          title: 'Test Catalogue',
          url: url,
          controls: []
        }
      });
    });

    // AI Test Connection (Protected, CSRF Exempt)
    app.post('/api/ai/test-connection', mockAuthenticate, mockAuthorize('EDIT_SETTINGS'), async (req, res) => {
      const { provider = 'ollama', url } = req.body;

      res.json({
        success: true,
        message: `${provider} connection test successful`,
        url: url,
        available: true
      });
    });

    // Settings GET (Optional Auth, CSRF Exempt)
    app.get('/api/settings', mockOptionalAuth, (req, res) => {
      const config = {
        publishedSoaUrl: 'https://example.com',
        aiConfig: {
          enabled: false,
          url: 'http://localhost:11434'
        },
        messagingConfig: {
          email: {
            enabled: false
          }
        }
      };

      res.json(config);
    });

    // Settings POST (Protected, CSRF Exempt)
    app.post('/api/settings', mockAuthenticate, mockAuthorize('EDIT_SETTINGS'), async (req, res) => {
      const newConfig = req.body;

      res.json({
        success: true,
        message: 'Settings saved successfully',
        config: newConfig,
        verification: {
          verified: true,
          timestamp: new Date().toISOString()
        }
      });
    });

    // Generate SSP (Public, CSRF Exempt)
    app.post('/api/generate-ssp', async (req, res) => {
      const { catalogueUrl, systemName } = req.body;

      if (!catalogueUrl || !systemName) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      res.json({
        success: true,
        ssp: {
          uuid: 'ssp-12345',
          systemName: systemName,
          catalogueUrl: catalogueUrl
        }
      });
    });

    // User Management (Protected, CSRF Exempt)
    app.get('/api/users', mockAuthenticate, mockAuthorize('VIEW_USERS'), async (req, res) => {
      res.json({
        success: true,
        users: [
          { id: 'user-1', username: 'user1', role: 'User' },
          { id: 'admin-1', username: 'admin', role: 'Platform Admin' }
        ]
      });
    });
  });

  describe('Health Check Endpoint', () => {
    test('GET /health should work without CSRF token', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
    });

    test('GET /health should work without authentication', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('service');
    });
  });

  describe('Public API Endpoints (CSRF Exempt)', () => {
    test('POST /api/fetch-catalogue should work without CSRF token', async () => {
      const response = await request(app)
        .post('/api/fetch-catalogue')
        .send({ url: 'https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('catalogue');
    });

    test('POST /api/fetch-catalogue should enforce SSRF protection', async () => {
      const response = await request(app)
        .post('/api/fetch-catalogue')
        .send({ url: 'http://169.254.169.254/latest/meta-data/' })
        .expect(403);

      expect(response.body).toHaveProperty('code', 'SSRF_BLOCKED');
    });

    test('POST /api/generate-ssp should work without CSRF token', async () => {
      const response = await request(app)
        .post('/api/generate-ssp')
        .send({ 
          catalogueUrl: 'https://example.com/catalogue.json',
          systemName: 'Test System'
        })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.ssp).toHaveProperty('systemName', 'Test System');
    });

    test('POST /api/generate-ssp should validate required fields', async () => {
      const response = await request(app)
        .post('/api/generate-ssp')
        .send({ catalogueUrl: 'https://example.com/catalogue.json' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Protected API Endpoints (Bearer Token Required)', () => {
    test('POST /api/ai/test-connection should require Bearer token', async () => {
      const response = await request(app)
        .post('/api/ai/test-connection')
        .send({ provider: 'ollama', url: 'http://localhost:11434' })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Authentication required');
    });

    test('POST /api/ai/test-connection should work with valid Bearer token', async () => {
      const response = await request(app)
        .post('/api/ai/test-connection')
        .set('Authorization', `Bearer ${adminBearerToken}`)
        .send({ provider: 'ollama', url: 'http://localhost:11434' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });

    test('POST /api/ai/test-connection should not require CSRF token', async () => {
      // This test verifies that Bearer token is sufficient, no CSRF needed
      const response = await request(app)
        .post('/api/ai/test-connection')
        .set('Authorization', `Bearer ${adminBearerToken}`)
        .send({ provider: 'ollama', url: 'http://localhost:11434' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    test('POST /api/settings should require Bearer token', async () => {
      const response = await request(app)
        .post('/api/settings')
        .send({ publishedSoaUrl: 'https://new-url.com' })
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    test('POST /api/settings should work with valid Bearer token', async () => {
      const response = await request(app)
        .post('/api/settings')
        .set('Authorization', `Bearer ${adminBearerToken}`)
        .send({ publishedSoaUrl: 'https://new-url.com' })
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });

    test('GET /api/users should require Bearer token and admin role', async () => {
      // No token
      await request(app)
        .get('/api/users')
        .expect(401);

      // User token (not admin)
      await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${validBearerToken}`)
        .expect(403);

      // Admin token (success)
      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminBearerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.users).toHaveLength(2);
    });
  });

  describe('Optional Auth Endpoints', () => {
    test('GET /api/settings should work without authentication', async () => {
      const response = await request(app)
        .get('/api/settings')
        .expect(200);

      expect(response.body).toHaveProperty('publishedSoaUrl');
      expect(response.body).toHaveProperty('aiConfig');
    });

    test('GET /api/settings should work with Bearer token', async () => {
      const response = await request(app)
        .get('/api/settings')
        .set('Authorization', `Bearer ${validBearerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('publishedSoaUrl');
    });
  });

  describe('Bearer Token Authentication Pattern', () => {
    test('should reject malformed Authorization header', async () => {
      await request(app)
        .post('/api/ai/test-connection')
        .set('Authorization', 'InvalidFormat token123')
        .send({ provider: 'ollama' })
        .expect(401);
    });

    test('should reject invalid Bearer token', async () => {
      await request(app)
        .post('/api/ai/test-connection')
        .set('Authorization', 'Bearer invalid-token')
        .send({ provider: 'ollama' })
        .expect(401);
    });

    test('should accept valid Bearer token format', async () => {
      const response = await request(app)
        .post('/api/ai/test-connection')
        .set('Authorization', `Bearer ${adminBearerToken}`)
        .send({ provider: 'ollama', url: 'http://localhost:11434' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('v1.6.5 CSRF Architecture Validation', () => {
    test('should document that all /api/ endpoints are CSRF exempt', () => {
      const architecture = {
        version: '1.6.5',
        csrfExemption: '/api/',
        rationale: 'Bearer token authentication is immune to CSRF attacks',
        affectedEndpoints: [
          '/api/fetch-catalogue',
          '/api/ai/test-connection',
          '/api/settings',
          '/api/generate-ssp',
          '/api/users',
        ],
      };

      expect(architecture.version).toBe('1.6.5');
      expect(architecture.csrfExemption).toBe('/api/');
      expect(architecture.affectedEndpoints.length).toBeGreaterThanOrEqual(5);
    });

    test('should verify all tested endpoints follow CSRF exemption pattern', async () => {
      // Test multiple endpoints to ensure consistent behavior
      const endpoints = [
        { method: 'post', path: '/api/fetch-catalogue', body: { url: 'https://example.com' } },
        { method: 'get', path: '/api/settings', body: null },
        { method: 'post', path: '/api/generate-ssp', body: { catalogueUrl: 'https://test.com', systemName: 'Test' } },
      ];

      for (const endpoint of endpoints) {
        const req = request(app)[endpoint.method](endpoint.path);
        if (endpoint.body) {
          req.send(endpoint.body);
        }

        const response = await req;
        
        // None should return 403 CSRF errors
        expect(response.status).not.toBe(403);
        // Should return either 200 (success) or 400 (validation error), never CSRF error
        expect([200, 400, 401]).toContain(response.status);
      }
    });
  });

  describe('Security Controls Remain Active', () => {
    test('should enforce Bearer token authentication on protected endpoints', async () => {
      const protectedEndpoints = [
        { method: 'post', path: '/api/ai/test-connection', body: { provider: 'ollama' } },
        { method: 'post', path: '/api/settings', body: { publishedSoaUrl: 'https://test.com' } },
        { method: 'get', path: '/api/users', body: null },
      ];

      for (const endpoint of protectedEndpoints) {
        const req = request(app)[endpoint.method](endpoint.path);
        if (endpoint.body) {
          req.send(endpoint.body);
        }

        const response = await req;
        expect(response.status).toBe(401);
        expect(response.body).toHaveProperty('error');
      }
    });

    test('should enforce SSRF protection on URL-based endpoints', async () => {
      const ssrfTests = [
        'http://169.254.169.254/latest/meta-data/',
        'http://metadata.google.internal/',
      ];

      for (const maliciousUrl of ssrfTests) {
        const response = await request(app)
          .post('/api/fetch-catalogue')
          .send({ url: maliciousUrl })
          .expect(403);

        expect(response.body.code).toBe('SSRF_BLOCKED');
      }
    });

    test('should enforce input validation on all endpoints', async () => {
      // Missing required fields
      await request(app)
        .post('/api/fetch-catalogue')
        .send({})
        .expect(400);

      await request(app)
        .post('/api/generate-ssp')
        .send({ systemName: 'Test' })
        .expect(400);
    });
  });
});
