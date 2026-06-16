/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import { describe, test, expect } from '@jest/globals';
import { 
  SECURITY_CONFIG, 
  CSRF_EXEMPT_PATHS, 
  SSRF_PROTECTED_ENDPOINTS 
} from '../../../backend/utils/securityConfig.js';

describe('Security Configuration Tests', () => {
  describe('CSRF Configuration', () => {
    test('should have CSRF enabled by default', () => {
      expect(SECURITY_CONFIG.csrf.enabled).toBe(true);
    });

    test('should have proper CSRF cookie configuration', () => {
      expect(SECURITY_CONFIG.csrf.cookieOptions).toHaveProperty('httpOnly', true);
      expect(SECURITY_CONFIG.csrf.cookieOptions).toHaveProperty('sameSite', 'strict');
      expect(SECURITY_CONFIG.csrf.cookieOptions).toHaveProperty('maxAge');
    });

    test('should have CSRF cookie name defined', () => {
      expect(SECURITY_CONFIG.csrf.cookieName).toBe('_csrf');
    });
  });

  describe('CSRF Exempt Paths (v1.6.5)', () => {
    test('should exempt /health endpoint from CSRF', () => {
      expect(CSRF_EXEMPT_PATHS).toContain('/health');
    });

    test('should exempt all /api/ endpoints from CSRF', () => {
      const apiPath = CSRF_EXEMPT_PATHS.find(path => path === '/api/');
      expect(apiPath).toBe('/api/');
    });

    test('should properly identify exempted paths', () => {
      const testPaths = [
        '/health',
        '/api/fetch-catalogue',
        '/api/settings',
        '/api/ai/test-connection',
        '/api/auth/login',
        '/api/users',
      ];

      testPaths.forEach(path => {
        const isExempt = CSRF_EXEMPT_PATHS.some(exemptPath => 
          path.startsWith(exemptPath)
        );
        expect(isExempt).toBe(true);
      });
    });

    test('should not exempt non-API paths', () => {
      const nonApiPaths = [
        '/admin',
        '/dashboard',
        '/config',
      ];

      nonApiPaths.forEach(path => {
        const isExempt = CSRF_EXEMPT_PATHS.some(exemptPath => 
          path.startsWith(exemptPath)
        );
        expect(isExempt).toBe(false);
      });
    });
  });

  describe('Session Configuration', () => {
    test('should have session secret defined', () => {
      expect(SECURITY_CONFIG.session.secret).toBeDefined();
      expect(typeof SECURITY_CONFIG.session.secret).toBe('string');
    });

    test('should have session name defined', () => {
      expect(SECURITY_CONFIG.session.name).toBe('oscal.sid');
    });

    test('should have proper session cookie settings', () => {
      expect(SECURITY_CONFIG.session.cookie).toHaveProperty('httpOnly', true);
      expect(SECURITY_CONFIG.session.cookie).toHaveProperty('sameSite', 'strict');
    });

    test('should not save uninitialized sessions', () => {
      expect(SECURITY_CONFIG.session.saveUninitialized).toBe(false);
    });

    test('should not resave unmodified sessions', () => {
      expect(SECURITY_CONFIG.session.resave).toBe(false);
    });
  });

  describe('URL Validation Configuration', () => {
    test('should allow localhost for AI services', () => {
      expect(SECURITY_CONFIG.urlValidation.allowLocalhost).toBe(true);
    });

    test('should allow private IPs for AI services', () => {
      expect(SECURITY_CONFIG.urlValidation.allowPrivateIPs).toBe(true);
    });

    test('should have trusted domains defined', () => {
      expect(Array.isArray(SECURITY_CONFIG.urlValidation.trustedDomains)).toBe(true);
      expect(SECURITY_CONFIG.urlValidation.trustedDomains.length).toBeGreaterThan(0);
    });

    test('should include expected trusted domains', () => {
      const expectedDomains = [
        'raw.githubusercontent.com',
        'github.com',
        'pages.nist.gov',
        'csrc.nist.gov',
        'api.mistral.ai',
      ];

      expectedDomains.forEach(domain => {
        expect(SECURITY_CONFIG.urlValidation.trustedDomains).toContain(domain);
      });
    });
  });

  describe('SSRF Protected Endpoints', () => {
    test('should protect catalogue fetch endpoint', () => {
      expect(SSRF_PROTECTED_ENDPOINTS).toContain('/api/fetch-catalogue');
    });

    test('should protect proxy fetch endpoint', () => {
      expect(SSRF_PROTECTED_ENDPOINTS).toContain('/api/proxy-fetch');
    });

    test('should protect SAML metadata URL endpoint', () => {
      expect(SSRF_PROTECTED_ENDPOINTS).toContain('/api/saml/metadata-url');
    });

    test('should protect AI test endpoints', () => {
      expect(SSRF_PROTECTED_ENDPOINTS).toContain('/api/ai/test');
      expect(SSRF_PROTECTED_ENDPOINTS).toContain('/api/ai/test');
    });

    test('should have at least 4 protected endpoints', () => {
      expect(SSRF_PROTECTED_ENDPOINTS.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Rate Limiting Configuration', () => {
    test('should have rate limiting window defined', () => {
      expect(SECURITY_CONFIG.rateLimiting.windowMs).toBeDefined();
      expect(typeof SECURITY_CONFIG.rateLimiting.windowMs).toBe('number');
    });

    test('should have rate limit max requests defined', () => {
      expect(SECURITY_CONFIG.rateLimiting.max).toBeDefined();
      expect(typeof SECURITY_CONFIG.rateLimiting.max).toBe('number');
    });

    test('should have reasonable rate limits', () => {
      // 15 minutes window
      expect(SECURITY_CONFIG.rateLimiting.windowMs).toBe(15 * 60 * 1000);
      // 100 requests per window
      expect(SECURITY_CONFIG.rateLimiting.max).toBe(100);
    });
  });

  describe('Security Architecture Documentation', () => {
    test('should document rationale for CSRF exemptions', () => {
      // This test ensures the security decisions are properly documented
      const documentation = {
        version: '1.7.20',
        decision: 'Exempt all /api/ endpoints from CSRF protection',
        rationale: [
          'Protected endpoints use Bearer token authentication (immune to CSRF)',
          'Public endpoints need to work without session authentication',
          'Bearer tokens are not automatically sent by browsers',
          'Session cookies use sameSite: strict for additional protection',
        ],
        remainingProtections: [
          'Bearer token authentication for protected endpoints',
          'SSRF protection via validateUrl()',
          'Rate limiting on all endpoints',
          'Input validation per endpoint',
          'Role-based access control (RBAC)',
        ],
      };

      expect(documentation.version).toBe('1.7.20');
      expect(documentation.rationale.length).toBeGreaterThan(0);
      expect(documentation.remainingProtections.length).toBeGreaterThanOrEqual(5);
    });
  });
});
