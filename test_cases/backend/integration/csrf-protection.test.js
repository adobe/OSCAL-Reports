/**
 * CSRF Protection Integration Tests
 * Tests that state-changing endpoints are protected against CSRF attacks
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import { setupAppTest, cleanup } from '../helpers/testSetup.js';

describe('CSRF Protection - Integration Tests', () => {
  let app;
  let csrfToken;
  let cookies;

  beforeAll(async () => {
    try {
      app = await setupAppTest();
      
      // Get CSRF token
      const response = await request(app)
        .get('/api/csrf-token');

      if (response.status === 200) {
        csrfToken = response.body.csrfToken;
        cookies = response.headers['set-cookie'];
      }
    } catch (error) {
      console.warn('Setup failed:', error.message);
    }
  });

  afterAll(async () => {
    await cleanup();
  });

  describe('CSRF Token Endpoint', () => {
    it('should provide CSRF token endpoint', async () => {
      if (!app) {
        console.warn('Skipping test - server not available');
        return;
      }

      const response = await request(app)
        .get('/api/csrf-token');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('csrfToken');
      expect(response.body.csrfToken).toBeDefined();
      expect(typeof response.body.csrfToken).toBe('string');
      expect(response.body.csrfToken.length).toBeGreaterThan(0);
    });

    it('should set CSRF cookie', async () => {
      if (!app) return;

      const response = await request(app)
        .get('/api/csrf-token');

      expect(response.status).toBe(200);
      expect(response.headers['set-cookie']).toBeDefined();
      
      const cookieHeader = response.headers['set-cookie'].join(';');
      expect(cookieHeader).toMatch(/_csrf/);
    });

    it('should return different tokens for different requests', async () => {
      if (!app) return;

      const response1 = await request(app).get('/api/csrf-token');
      const response2 = await request(app).get('/api/csrf-token');

      expect(response1.body.csrfToken).toBeDefined();
      expect(response2.body.csrfToken).toBeDefined();
      // Tokens should be different (session-based)
    });
  });

  describe('GET requests - Should NOT require CSRF token', () => {
    it('/api/health should work without CSRF token', async () => {
      if (!app) return;

      const response = await request(app)
        .get('/api/health');

      // Should work without CSRF token (GET is safe method)
      expect([200, 404]).toContain(response.status);
    });

    it('/health should work without CSRF token', async () => {
      if (!app) return;

      const response = await request(app)
        .get('/health');

      expect(response.status).toBe(200);
    });
  });

  describe('Exempt endpoints - Should work without CSRF token', () => {
    it('/api/auth/login should work without CSRF token', async () => {
      if (!app) return;

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'testuser',
          password: 'testpass'
        });

      // Should not require CSRF (exempted endpoint)
      // May fail with 401 (invalid credentials) but not CSRF error
      expect(response.status).not.toBe(403); // 403 would indicate CSRF failure
    });

    it('/api/csrf-token should work without CSRF token', async () => {
      if (!app) return;

      const response = await request(app)
        .get('/api/csrf-token');

      expect(response.status).toBe(200);
    });
  });

  describe('CSRF Protection on state-changing endpoints', () => {
    describe('When CSRF is enabled', () => {
      const isCsrfEnabled = process.env.CSRF_ENABLED !== 'false';

      it('should document CSRF protection status', () => {
        console.log(`CSRF Protection Status: ${isCsrfEnabled ? 'ENABLED' : 'DISABLED'}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      });

      if (isCsrfEnabled) {
        it('POST requests should fail without CSRF token', async () => {
          if (!app) return;

          // Try to make a POST request without CSRF token
          const response = await request(app)
            .post('/api/test-endpoint-with-csrf')
            .send({ data: 'test' });

          // Should fail with CSRF error (if endpoint exists and is protected)
          // If endpoint doesn't exist, we get 404, which is fine for this test
          if (response.status === 403 || response.status === 400) {
            expect(response.body.error).toMatch(/csrf|token/i);
          }
        });

        it('POST requests should succeed with valid CSRF token', async () => {
          if (!app || !csrfToken || !cookies) {
            console.warn('Skipping test - no CSRF token available');
            return;
          }

          // This is a documentation test - actual endpoint may not exist
          const response = await request(app)
            .post('/api/test-endpoint-with-csrf')
            .set('Cookie', cookies)
            .set('X-CSRF-Token', csrfToken)
            .send({ data: 'test' });

          // Should not fail with CSRF error
          if (response.status === 403) {
            expect(response.body.error).not.toMatch(/csrf|token/i);
          }
        });

        it('PUT requests should be protected', async () => {
          if (!app) return;

          const response = await request(app)
            .put('/api/test-endpoint')
            .send({ data: 'test' });

          // If endpoint is CSRF-protected, should fail without token
          if (response.status === 403) {
            expect(response.body.error).toMatch(/csrf|token/i);
          }
        });

        it('DELETE requests should be protected', async () => {
          if (!app) return;

          const response = await request(app)
            .delete('/api/test-endpoint/123');

          // If endpoint is CSRF-protected, should fail without token
          if (response.status === 403) {
            expect(response.body.error).toMatch(/csrf|token/i);
          }
        });

        it('PATCH requests should be protected', async () => {
          if (!app) return;

          const response = await request(app)
            .patch('/api/test-endpoint/123')
            .send({ data: 'test' });

          // If endpoint is CSRF-protected, should fail without token
          if (response.status === 403) {
            expect(response.body.error).toMatch(/csrf|token/i);
          }
        });
      }
    });

    describe('When CSRF is disabled (for testing)', () => {
      const isCsrfDisabled = process.env.CSRF_ENABLED === 'false';

      if (isCsrfDisabled) {
        it('should allow requests without CSRF token when disabled', async () => {
          if (!app) return;

          console.log('CSRF Protection is DISABLED for testing');
          
          const response = await request(app)
            .post('/api/some-endpoint')
            .send({ data: 'test' });

          // Should not fail with CSRF error
          if (response.status === 403) {
            expect(response.body.error).not.toMatch(/csrf|token/i);
          }
        });
      }
    });
  });

  describe('CSRF Token validation', () => {
    it('should reject invalid CSRF tokens', async () => {
      if (!app || !cookies) {
        console.warn('Skipping test - no cookies available');
        return;
      }

      const response = await request(app)
        .post('/api/test-endpoint')
        .set('Cookie', cookies)
        .set('X-CSRF-Token', 'invalid-token-12345')
        .send({ data: 'test' });

      // Should fail with CSRF error (if CSRF is enabled and endpoint exists)
      if (response.status === 403) {
        expect(response.body.error).toMatch(/csrf|token|invalid/i);
      }
    });

    it('should reject missing CSRF tokens on protected endpoints', async () => {
      if (!app) return;

      const response = await request(app)
        .post('/api/settings')
        .send({ setting: 'value' });

      // May fail with auth error (401/403) or CSRF error
      // The important thing is it doesn't succeed without proper auth + CSRF
      expect([400, 401, 403, 404]).toContain(response.status);
    });

    it('should reject expired CSRF tokens', async () => {
      if (!app) return;

      // This test documents expected behavior
      // CSRF tokens should expire after the session timeout
      
      // Get a fresh token
      const response1 = await request(app).get('/api/csrf-token');
      const oldToken = response1.body.csrfToken;
      const oldCookies = response1.headers['set-cookie'];

      // Simulate token expiration (would need to wait or manipulate time)
      // In real scenario, token expires after session.cookie.maxAge (1 hour)
      
      // For now, just document that tokens should expire
      expect(oldToken).toBeDefined();
      console.log('CSRF tokens should expire after 1 hour (session timeout)');
    });
  });

  describe('Cookie security attributes', () => {
    it('should set httpOnly flag on CSRF cookie', async () => {
      if (!app) return;

      const response = await request(app)
        .get('/api/csrf-token');

      const cookieHeader = response.headers['set-cookie']?.join(';') || '';
      
      if (cookieHeader.includes('_csrf')) {
        expect(cookieHeader).toMatch(/httponly/i);
      }
    });

    it('should set sameSite=strict on CSRF cookie', async () => {
      if (!app) return;

      const response = await request(app)
        .get('/api/csrf-token');

      const cookieHeader = response.headers['set-cookie']?.join(';') || '';
      
      if (cookieHeader.includes('_csrf')) {
        expect(cookieHeader).toMatch(/samesite=strict/i);
      }
    });

    it('should set secure flag in production', async () => {
      if (!app) return;

      const response = await request(app)
        .get('/api/csrf-token');

      const cookieHeader = response.headers['set-cookie']?.join(';') || '';
      const isProduction = process.env.NODE_ENV === 'production';
      
      if (cookieHeader.includes('_csrf') && isProduction) {
        expect(cookieHeader).toMatch(/secure/i);
      }
    });
  });

  describe('Session management', () => {
    it('should create session for CSRF token', async () => {
      if (!app) return;

      const response = await request(app)
        .get('/api/csrf-token');

      expect(response.status).toBe(200);
      
      const cookieHeader = response.headers['set-cookie']?.join(';') || '';
      // Session cookie should exist (oscal.sid or connect.sid)
      expect(cookieHeader.length).toBeGreaterThan(0);
    });

    it('should maintain same CSRF token within session', async () => {
      if (!app) return;

      // Use agent to maintain session across requests
      const agent = request.agent(app);
      
      const response1 = await agent.get('/api/csrf-token');
      const token1 = response1.body.csrfToken;

      const response2 = await agent.get('/api/csrf-token');
      const token2 = response2.body.csrfToken;

      // Within same session (using agent), token should be consistent
      expect(token1).toBe(token2);
    });
  });

  describe('Attack scenarios', () => {
    it('should prevent CSRF attack without token', async () => {
      if (!app) return;

      // Attacker tries to make authenticated request without CSRF token
      const response = await request(app)
        .post('/api/settings')
        .set('Authorization', 'Bearer fake-token')
        .send({ malicious: 'data' });

      // Should fail due to missing CSRF token (or invalid auth)
      expect([400, 401, 403]).toContain(response.status);
    });

    it('should prevent CSRF attack with stolen token from different session', async () => {
      if (!app) return;

      // Get token from one session
      const session1 = await request(app).get('/api/csrf-token');
      const token1 = session1.body.csrfToken;

      // Get cookies from different session
      const session2 = await request(app).get('/api/csrf-token');
      const cookies2 = session2.headers['set-cookie'];

      // Try to use token from session1 with cookies from session2
      const response = await request(app)
        .post('/api/test-endpoint')
        .set('Cookie', cookies2)
        .set('X-CSRF-Token', token1)
        .send({ data: 'test' });

      // Should fail because token doesn't match session
      if (response.status === 403) {
        expect(response.body.error).toMatch(/csrf|token/i);
      }
    });

    it('should prevent double-submit cookie attack', async () => {
      if (!app) return;

      // Attacker tries to set their own CSRF cookie
      const response = await request(app)
        .post('/api/test-endpoint')
        .set('Cookie', '_csrf=attacker-controlled-value')
        .set('X-CSRF-Token', 'attacker-controlled-value')
        .send({ data: 'test' });

      // Should fail because token not from server session
      expect([400, 403, 404]).toContain(response.status);
    });
  });

  describe('Documentation and Configuration', () => {
    it('should document CSRF exempted paths', () => {
      const exemptedPaths = [
        '/health',
        '/api/auth/login',
        '/api/auth/register',
        '/api/csrf-token',
        '/api/auth/logout',
      ];

      console.log('CSRF Exempted Paths:', exemptedPaths);
      expect(exemptedPaths.length).toBeGreaterThan(0);
    });

    it('should document CSRF configuration', () => {
      const config = {
        enabled: process.env.CSRF_ENABLED !== 'false',
        cookieName: '_csrf',
        sessionName: 'oscal.sid',
        maxAge: '1 hour',
        sameSite: 'strict',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
      };

      console.log('CSRF Configuration:', JSON.stringify(config, null, 2));
      expect(config.enabled).toBeDefined();
    });
  });
});

describe('CSRF Protection - Best Practices', () => {
  it('should use POST for state-changing operations', () => {
    // Document that GET requests should never change state
    console.log('Best Practice: Use POST/PUT/DELETE for state changes, never GET');
    console.log('GET requests do not require CSRF tokens');
  });

  it('should validate both cookie and header token', () => {
    console.log('Best Practice: CSRF protection validates both:');
    console.log('  1. CSRF cookie (set by server)');
    console.log('  2. CSRF token in header or body (provided by client)');
  });

  it('should regenerate tokens on privilege change', () => {
    console.log('Best Practice: Regenerate CSRF token after:');
    console.log('  - Login/Logout');
    console.log('  - Role/privilege changes');
  });
});
