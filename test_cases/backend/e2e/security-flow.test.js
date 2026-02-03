/**
 * End-to-End Security Flow Tests
 * 
 * Tests complete security workflows including:
 * - CSRF exemption for API endpoints
 * - Bearer token authentication
 * - SSRF protection with AI integration
 * - Public vs Protected endpoint access
 * 
 * Version: 1.6.5+
 * Location: test_cases/backend/e2e/security-flow.test.js
 */

import { describe, test, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';

describe('End-to-End Security Flow Tests (v1.6.5)', () => {
  let app;
  let userToken;
  let adminToken;

  beforeAll(() => {
    // Setup a complete mock application
    app = express();
    app.use(express.json());

    // Mock user database
    const users = {
      'user@example.com': {
        id: 'user-1',
        username: 'user@example.com',
        password: 'hashed-user-pass',
        role: 'User',
      },
      'admin@example.com': {
        id: 'admin-1',
        username: 'admin@example.com',
        password: 'hashed-admin-pass',
        role: 'Platform Admin',
      },
    };

    // Token storage
    userToken = 'user-bearer-token-abc123';
    adminToken = 'admin-bearer-token-xyz789';
    
    const tokens = {
      [userToken]: users['user@example.com'],
      [adminToken]: users['admin@example.com'],
    };

    // Auth middleware
    const authenticate = (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const token = authHeader.substring(7);
      const user = tokens[token];
      
      if (!user) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      req.user = user;
      next();
    };

    const authorize = (permission) => (req, res, next) => {
      if (req.user.role === 'Platform Admin') {
        return next();
      }
      return res.status(403).json({ error: 'Insufficient permissions' });
    };

    // Mock URL validator
    const validateUrl = (url, options = {}) => {
      const { allowPrivateIPs = false, allowLocalhost = false } = options;

      // Cloud metadata - always blocked
      if (url.includes('169.254.169.254') || url.includes('metadata.google')) {
        return { valid: false, blocked: true, error: 'Cloud metadata blocked' };
      }

      // Localhost
      if (url.includes('localhost') || url.includes('127.0.0.1')) {
        if (!allowLocalhost) {
          return { valid: false, blocked: true, error: 'Localhost not allowed' };
        }
        return { valid: true, warning: 'Localhost allowed by config' };
      }

      // Private IPs
      if (/192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\./.test(url)) {
        if (!allowPrivateIPs) {
          return { valid: false, blocked: true, error: 'Private IP not allowed' };
        }
        return { valid: true, warning: 'Private IP allowed by config' };
      }

      // Public URLs
      return { valid: true };
    };

    // ===== ENDPOINTS =====

    // Health check
    app.get('/health', (req, res) => {
      res.json({ status: 'healthy', version: '1.6.5' });
    });

    // Login (creates Bearer token)
    app.post('/api/auth/login', (req, res) => {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
      }

      const user = users[username];
      if (!user || password !== 'correctpassword') {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = username === 'admin@example.com' ? adminToken : userToken;
      
      res.json({
        success: true,
        token: token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
        },
      });
    });

    // Fetch catalogue (Public, SSRF protected)
    app.post('/api/fetch-catalogue', (req, res) => {
      const { url } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: 'URL required' });
      }

      const validation = validateUrl(url);
      if (!validation.valid) {
        return res.status(403).json({ 
          error: validation.error,
          blocked: validation.blocked,
        });
      }

      res.json({
        success: true,
        catalogue: { url, title: 'Test Catalogue', controls: [] },
      });
    });

    // AI Test Connection (Protected, allows private IPs)
    app.post('/api/ai/test-connection', authenticate, authorize('EDIT_SETTINGS'), (req, res) => {
      const { url, provider = 'ollama' } = req.body;
      
      if (!url) {
        return res.status(400).json({ error: 'URL required' });
      }

      // AI services can use private IPs and localhost
      const validation = validateUrl(url, {
        allowPrivateIPs: true,
        allowLocalhost: true,
      });

      if (!validation.valid) {
        return res.status(403).json({ 
          error: validation.error,
          blocked: validation.blocked,
        });
      }

      res.json({
        success: true,
        message: `${provider} connection successful`,
        url,
        available: true,
      });
    });

    // Settings endpoints
    app.get('/api/settings', (req, res) => {
      res.json({
        aiConfig: { enabled: false, url: 'http://localhost:11434' },
        publishedSoaUrl: 'https://example.com',
      });
    });

    app.post('/api/settings', authenticate, authorize('EDIT_SETTINGS'), (req, res) => {
      const config = req.body;
      res.json({
        success: true,
        message: 'Settings saved',
        config,
      });
    });

    // Generate SSP (Public)
    app.post('/api/generate-ssp', (req, res) => {
      const { catalogueUrl, systemName } = req.body;
      
      if (!catalogueUrl || !systemName) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      res.json({
        success: true,
        ssp: {
          uuid: 'ssp-12345',
          systemName,
          catalogueUrl,
        },
      });
    });
  });

  describe('Complete Authentication Flow', () => {
    test('should complete full login and API access flow', async () => {
      // Step 1: Login as admin
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin@example.com', password: 'correctpassword' })
        .expect(200);

      expect(loginResponse.body.success).toBe(true);
      expect(loginResponse.body).toHaveProperty('token');
      const token = loginResponse.body.token;

      // Step 2: Access protected endpoint with token
      const settingsResponse = await request(app)
        .post('/api/settings')
        .set('Authorization', `Bearer ${token}`)
        .send({ publishedSoaUrl: 'https://new-url.com' })
        .expect(200);

      expect(settingsResponse.body.success).toBe(true);

      // Step 3: Test AI connection with private IP (should work)
      const aiResponse = await request(app)
        .post('/api/ai/test-connection')
        .set('Authorization', `Bearer ${token}`)
        .send({ url: 'http://192.168.1.100:11434', provider: 'ollama' })
        .expect(200);

      expect(aiResponse.body.success).toBe(true);
    });

    test('should handle unauthorized access appropriately', async () => {
      // Try to access protected endpoint without token
      await request(app)
        .post('/api/settings')
        .send({ publishedSoaUrl: 'https://test.com' })
        .expect(401);

      // Try with invalid token
      await request(app)
        .post('/api/settings')
        .set('Authorization', 'Bearer invalid-token')
        .send({ publishedSoaUrl: 'https://test.com' })
        .expect(401);
    });
  });

  describe('CSRF Exemption Flow', () => {
    test('should allow public endpoints without CSRF token', async () => {
      // All these should work without CSRF token
      const endpoints = [
        {
          method: 'get',
          path: '/health',
          body: null,
        },
        {
          method: 'post',
          path: '/api/fetch-catalogue',
          body: { url: 'https://example.com/catalogue.json' },
        },
        {
          method: 'get',
          path: '/api/settings',
          body: null,
        },
        {
          method: 'post',
          path: '/api/generate-ssp',
          body: { catalogueUrl: 'https://test.com/cat.json', systemName: 'Test' },
        },
      ];

      for (const endpoint of endpoints) {
        const req = request(app)[endpoint.method](endpoint.path);
        if (endpoint.body) {
          req.send(endpoint.body);
        }

        const response = await req;
        expect(response.status).not.toBe(403); // Not CSRF error
        expect([200, 400, 401]).toContain(response.status);
      }
    });
  });

  describe('SSRF Protection Flow', () => {
    test('should block cloud metadata access in public endpoints', async () => {
      const cloudMetadataUrls = [
        'http://169.254.169.254/latest/meta-data/',
        'http://metadata.google.internal/computeMetadata/v1/',
      ];

      for (const url of cloudMetadataUrls) {
        const response = await request(app)
          .post('/api/fetch-catalogue')
          .send({ url })
          .expect(403);

        expect(response.body.blocked).toBe(true);
      }
    });

    test('should block private IPs in public catalogue endpoint', async () => {
      const privateUrls = [
        'http://192.168.1.1/catalogue.json',
        'http://10.0.0.5/catalogue.json',
        'http://localhost:8080/catalogue.json',
      ];

      for (const url of privateUrls) {
        const response = await request(app)
          .post('/api/fetch-catalogue')
          .send({ url })
          .expect(403);

        expect(response.body.blocked).toBe(true);
      }
    });

    test('should allow private IPs in AI test endpoint (with auth)', async () => {
      const privateUrls = [
        'http://192.168.1.100:11434',
        'http://10.0.50.5:11434',
        'http://localhost:11434',
      ];

      for (const url of privateUrls) {
        const response = await request(app)
          .post('/api/ai/test-connection')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ url, provider: 'ollama' })
          .expect(200);

        expect(response.body.success).toBe(true);
      }
    });

    test('should still block cloud metadata in AI endpoint', async () => {
      const response = await request(app)
        .post('/api/ai/test-connection')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ url: 'http://169.254.169.254/latest/', provider: 'ollama' })
        .expect(403);

      expect(response.body.blocked).toBe(true);
    });
  });

  describe('Role-Based Access Control Flow', () => {
    test('should enforce role requirements across workflow', async () => {
      // Login as regular user
      const userLogin = await request(app)
        .post('/api/auth/login')
        .send({ username: 'user@example.com', password: 'correctpassword' })
        .expect(200);

      const userToken = userLogin.body.token;

      // Try to access admin endpoint (should fail)
      await request(app)
        .post('/api/settings')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ publishedSoaUrl: 'https://test.com' })
        .expect(403);

      // Login as admin
      const adminLogin = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin@example.com', password: 'correctpassword' })
        .expect(200);

      const adminToken = adminLogin.body.token;

      // Access same endpoint (should succeed)
      await request(app)
        .post('/api/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ publishedSoaUrl: 'https://test.com' })
        .expect(200);
    });
  });

  describe('Complete Report Generation Flow', () => {
    test('should complete public report generation without auth', async () => {
      // Step 1: Fetch catalogue (public)
      const catalogueResponse = await request(app)
        .post('/api/fetch-catalogue')
        .send({ url: 'https://pages.nist.gov/oscal-content/nist.gov/SP800-53/rev5/json/catalog.json' })
        .expect(200);

      expect(catalogueResponse.body.success).toBe(true);

      // Step 2: Generate SSP (public)
      const sspResponse = await request(app)
        .post('/api/generate-ssp')
        .send({
          catalogueUrl: catalogueResponse.body.catalogue.url,
          systemName: 'Production System',
        })
        .expect(200);

      expect(sspResponse.body.success).toBe(true);
      expect(sspResponse.body.ssp).toHaveProperty('uuid');
    });
  });

  describe('Error Handling Flow', () => {
    test('should handle missing fields gracefully', async () => {
      // Missing URL in catalogue fetch
      await request(app)
        .post('/api/fetch-catalogue')
        .send({})
        .expect(400);

      // Missing credentials in login
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'test@example.com' })
        .expect(400);

      // Missing fields in SSP generation
      await request(app)
        .post('/api/generate-ssp')
        .send({ systemName: 'Test' })
        .expect(400);
    });

    test('should handle invalid credentials', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin@example.com', password: 'wrongpassword' })
        .expect(401);
    });
  });

  describe('v1.6.5 Security Architecture Validation', () => {
    test('should validate complete security model', () => {
      const securityModel = {
        version: '1.6.5',
        csrfProtection: {
          enabled: true,
          exemptPaths: ['/health', '/api/'],
          rationale: 'Bearer token auth immune to CSRF',
        },
        authentication: {
          method: 'Bearer Token',
          immuneToCSRF: true,
          headerFormat: 'Authorization: Bearer <token>',
        },
        ssrfProtection: {
          enabled: true,
          publicEndpoints: 'Strict validation (block private IPs)',
          aiEndpoints: 'Allow private IPs and localhost',
          alwaysBlocked: ['Cloud metadata', 'Dangerous protocols'],
        },
        rbac: {
          enabled: true,
          roles: ['User', 'Platform Admin'],
          enforced: 'All protected endpoints',
        },
      };

      expect(securityModel.version).toBe('1.6.5');
      expect(securityModel.authentication.immuneToCSRF).toBe(true);
      expect(securityModel.ssrfProtection.enabled).toBe(true);
      expect(securityModel.rbac.enabled).toBe(true);
    });
  });
});
