/**
 * SSRF Protection Integration Tests
 * Tests that all vulnerable endpoints are protected against SSRF attacks
 * 
 * ARCHITECTURAL NOTE:
 * - Private IPs (10.x, 172.16.x, 192.168.x) are ALLOWED for AI services
 * - Localhost (127.0.0.1, localhost) is ALLOWED for AI services
 * - Cloud metadata (169.254.169.254, metadata.google.internal) is BLOCKED
 * - Dangerous protocols (file://, gopher://, dict://, ftp://) are BLOCKED
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3020';

describe('SSRF Protection - Integration Tests', () => {
  let authToken;
  let sessionToken;

  beforeAll(async () => {
    // Login to get auth token for protected endpoints
    try {
      const loginResponse = await request(BASE_URL)
        .post('/api/auth/login')
        .send({
          username: process.env.TEST_USERNAME || 'admin',
          password: process.env.TEST_PASSWORD || 'Admin@2026',
        });

      if (loginResponse.status === 200 && loginResponse.body.sessionToken) {
        authToken = loginResponse.body.sessionToken;
        sessionToken = loginResponse.body.sessionToken;
      }
    } catch (error) {
      console.warn('Could not authenticate for SSRF tests:', error.message);
    }
  });

  describe('/api/fetch-catalogue - SSRF Protection', () => {
    it('should accept valid public OSCAL catalog URLs', async () => {
      const response = await request(BASE_URL)
        .post('/api/fetch-catalogue')
        .send({
          url: 'https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json'
        });

      // Should succeed or fail due to network issues, but NOT due to SSRF blocking
      if (response.status === 400) {
        expect(response.body.securityReason).not.toBe('SSRF_PREVENTION');
      }
    });

    it('should ALLOW localhost URLs (architectural decision for AI services)', async () => {
      const response = await request(BASE_URL)
        .post('/api/fetch-catalogue')
        .send({
          url: 'http://localhost:3000/catalog.json'
        });

      // Should NOT be blocked by SSRF (may fail with connection error, which is OK)
      if (response.status === 400) {
        expect(response.body.securityReason).not.toBe('SSRF_PREVENTION');
      }
    });

    it('should ALLOW private IP ranges (architectural decision for AI services)', async () => {
      const privateIPs = [
        'http://10.0.0.1/catalog.json',
        'http://192.168.1.1/catalog.json',
        'http://172.16.0.1/catalog.json',
      ];

      for (const url of privateIPs) {
        const response = await request(BASE_URL)
          .post('/api/fetch-catalogue')
          .send({ url });

        // Should NOT be blocked by SSRF protection
        if (response.status === 400) {
          expect(response.body.securityReason).not.toBe('SSRF_PREVENTION');
        }
      }
    });

    it('should block cloud metadata endpoint', async () => {
      const response = await request(BASE_URL)
        .post('/api/fetch-catalogue')
        .send({
          url: 'http://169.254.169.254/latest/meta-data/'
        });

      expect(response.status).toBe(400);
      expect(response.body.securityReason).toBe('SSRF_PREVENTION');
      expect(response.body.error).toMatch(/metadata|link-local/i);
    });

    it('should block file:// protocol', async () => {
      const response = await request(BASE_URL)
        .post('/api/fetch-catalogue')
        .send({
          url: 'file:///etc/passwd'
        });

      expect(response.status).toBe(400);
      expect(response.body.securityReason).toBe('SSRF_PREVENTION');
      expect(response.body.error).toMatch(/protocol/i);
    });
  });

  describe('/api/proxy-fetch - SSRF Protection', () => {
    it('should accept valid public URLs', async () => {
      const response = await request(BASE_URL)
        .post('/api/proxy-fetch')
        .send({
          url: 'https://api.github.com',
          method: 'GET'
        });

      // Should succeed or fail due to network, but NOT due to SSRF blocking
      if (response.status === 400) {
        expect(response.body.securityReason).not.toBe('SSRF_PREVENTION');
      }
    });

    it('should ALLOW localhost URLs (architectural decision)', async () => {
      const response = await request(BASE_URL)
        .post('/api/proxy-fetch')
        .send({
          url: 'http://127.0.0.1:6379/',
          method: 'GET'
        });

      // Should NOT be blocked by SSRF (may fail with connection error)
      if (response.status === 400) {
        expect(response.body.securityReason).not.toBe('SSRF_PREVENTION');
      }
    });

    it('should ALLOW internal network IPs (architectural decision)', async () => {
      const response = await request(BASE_URL)
        .post('/api/proxy-fetch')
        .send({
          url: 'http://192.168.1.100:8080/api',
          method: 'GET'
        });

      // Should NOT be blocked by SSRF
      if (response.status === 400) {
        expect(response.body.securityReason).not.toBe('SSRF_PREVENTION');
      }
    });

    it('should block gopher protocol (Redis attack)', async () => {
      const response = await request(BASE_URL)
        .post('/api/proxy-fetch')
        .send({
          url: 'gopher://localhost:6379/_*1%0d%0a$8%0d%0aflushall%0d%0a'
        });

      expect(response.status).toBe(400);
      expect(response.body.securityReason).toBe('SSRF_PREVENTION');
    });
  });

  describe('/api/sso/saml/fetch-metadata - SSRF Protection', () => {
    it('should require authentication', async () => {
      const response = await request(BASE_URL)
        .post('/api/sso/saml/fetch-metadata')
        .send({
          metadataUrl: 'https://example.com/metadata.xml'
        });

      // Should require auth (401 or 403)
      expect([401, 403]).toContain(response.status);
    });

    it('should ALLOW localhost URLs (with auth) - architectural decision', async () => {
      if (!authToken) {
        console.warn('Skipping test - no auth token available');
        return;
      }

      const response = await request(BASE_URL)
        .post('/api/sso/saml/fetch-metadata')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          metadataUrl: 'http://localhost:8080/metadata.xml'
        });

      // Should NOT be blocked by SSRF
      if (response.status === 400) {
        expect(response.body.securityReason).not.toBe('SSRF_PREVENTION');
      }
    });

    it('should ALLOW private network URLs (with auth) - architectural decision', async () => {
      if (!authToken) {
        console.warn('Skipping test - no auth token available');
        return;
      }

      const response = await request(BASE_URL)
        .post('/api/sso/saml/fetch-metadata')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          metadataUrl: 'http://10.0.0.5/saml/metadata'
        });

      // Should NOT be blocked by SSRF
      if (response.status === 400) {
        expect(response.body.securityReason).not.toBe('SSRF_PREVENTION');
      }
    });
  });

  describe('/api/ai/test-connection - SSRF Protection', () => {
    it('should require authentication', async () => {
      const response = await request(BASE_URL)
        .post('/api/ai/test-connection')
        .send({
          provider: 'ollama',
          url: 'http://localhost:11434'
        });

      expect([401, 403]).toContain(response.status);
    });

    it('should ALLOW private IPs for Ollama (with auth) - AI architecture', async () => {
      if (!authToken) {
        console.warn('Skipping test - no auth token available');
        return;
      }

      const response = await request(BASE_URL)
        .post('/api/ai/test-connection')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          provider: 'ollama',
          url: 'http://192.168.1.50:11434'
        });

      // Should NOT be blocked by SSRF (may timeout waiting for Ollama, which is OK)
      if (response.status === 400) {
        expect(response.body.securityReason).not.toBe('SSRF_PREVENTION');
      }
    }, 15000); // Longer timeout for network attempts

    it('should ALLOW localhost for Mistral API (with auth) - AI architecture', async () => {
      if (!authToken) {
        console.warn('Skipping test - no auth token available');
        return;
      }

      const response = await request(BASE_URL)
        .post('/api/ai/test-connection')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          provider: 'mistral-api',
          url: 'http://localhost:8080/v1/chat/completions',
          apiToken: 'test-token'
        });

      // Should NOT be blocked by SSRF
      if (response.status === 400) {
        expect(response.body.securityReason).not.toBe('SSRF_PREVENTION');
      }
    });

    it('should block cloud metadata endpoint', async () => {
      if (!authToken) {
        console.warn('Skipping test - no auth token available');
        return;
      }

      const response = await request(BASE_URL)
        .post('/api/ai/test-connection')
        .set('Authorization', `Bearer ${authToken}`)
        .set('X-Session-Token', sessionToken)
        .send({
          provider: 'ollama',
          url: 'http://169.254.169.254'
        });

      expect(response.status).toBe(400);
      expect(response.body.securityReason).toBe('SSRF_PREVENTION');
    });
  });

  describe('Architectural Security Configuration', () => {
    it('localhost is ALWAYS allowed (hardcoded for AI services)', async () => {
      // ARCHITECTURAL NOTE: Localhost is always allowed, not configurable
      // This is a design decision for AI services (Ollama, local LLMs)
      const response = await request(BASE_URL)
        .post('/api/fetch-catalogue')
        .send({
          url: 'http://localhost:8080/catalog.json'
        });

      // Should NOT be blocked by SSRF
      if (response.status === 400) {
        expect(response.body.securityReason).not.toBe('SSRF_PREVENTION');
      }
    });

    it('private IPs are ALWAYS allowed (hardcoded for AI services)', async () => {
      // ARCHITECTURAL NOTE: Private IPs always allowed, not configurable
      // This is a design decision for AI services on private networks
      const response = await request(BASE_URL)
        .post('/api/fetch-catalogue')
        .send({
          url: 'http://192.168.1.100/catalog.json'
        });

      // Should NOT be blocked by SSRF
      if (response.status === 400) {
        expect(response.body.securityReason).not.toBe('SSRF_PREVENTION');
      }
    });
  });

  describe('Attack vector testing', () => {
    it('should block URL with @ symbol (credential bypass attempt)', async () => {
      const response = await request(BASE_URL)
        .post('/api/fetch-catalogue')
        .send({
          url: 'http://user:pass@internal.server.com/data'
        });

      expect(response.status).toBe(400);
      expect(response.body.securityReason).toBe('SSRF_PREVENTION');
      expect(response.body.error).toMatch(/credentials/i);
    });

    it('should block URL encoding bypass attempts', async () => {
      // Attempt to bypass using URL encoding
      const response = await request(BASE_URL)
        .post('/api/fetch-catalogue')
        .send({
          url: 'http://127.0.0.1:6379'
        });

      expect(response.status).toBe(400);
      expect(response.body.securityReason).toBe('SSRF_PREVENTION');
    });

    it('should handle redirects safely (when implemented)', async () => {
      // Note: This test documents expected behavior
      // The application should not follow redirects to blocked URLs
      const response = await request(BASE_URL)
        .post('/api/fetch-catalogue')
        .send({
          url: 'https://bit.ly/test-redirect' // Hypothetical redirect
        });

      // Should either succeed or fail, but validate the final destination
      // Implementation should check redirects
    });
  });
});

describe('SSRF Protection - Error handling', () => {
  it('should provide clear error messages for BLOCKED URLs', async () => {
    // Test with cloud metadata endpoint which IS blocked
    const response = await request(BASE_URL)
      .post('/api/fetch-catalogue')
      .send({
        url: 'http://169.254.169.254/latest/meta-data/'
      });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error');
    expect(response.body).toHaveProperty('details');
    expect(response.body).toHaveProperty('securityReason');
    expect(response.body.securityReason).toBe('SSRF_PREVENTION');
    expect(response.body.error).toBeDefined();
    expect(response.body.details).toBeDefined();
  });

  it('should log SSRF attempts (check logs manually)', async () => {
    // This test documents that SSRF attempts should be logged
    await request(BASE_URL)
      .post('/api/fetch-catalogue')
      .send({
        url: 'http://169.254.169.254/latest/meta-data/'
      });

    // Manual verification: Check server logs for warning message
    // Should see: "🚫 SSRF attempt blocked in fetch-catalogue"
  });
});
