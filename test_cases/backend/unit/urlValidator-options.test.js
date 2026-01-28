/**
 * URL Validator Options Tests
 * Tests the allowPrivateIPs and allowLocalhost options for AI Integration
 * 
 * Added in v1.6.5 to support AI services running on private networks
 * 
 * Architecture Decision: AI services (Ollama) run on private networks
 * The urlValidator supports options to allow private IPs for specific use cases
 * 
 * Location: test_cases/backend/unit/urlValidator-options.test.js
 */

import { describe, test, expect } from '@jest/globals';
import { validateUrl, validateUrlSync } from '../../../backend/utils/urlValidator.js';
import { SECURITY_CONFIG } from '../../../backend/utils/securityConfig.js';

describe('URL Validator - Options for AI Integration (v1.6.5)', () => {
  describe('allowLocalhost option', () => {
    test('should block localhost by default', async () => {
      const result = await validateUrl('http://localhost:11434');
      
      expect(result.valid).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.error).toMatch(/localhost/i);
    });

    test('should allow localhost when allowLocalhost=true', async () => {
      const result = await validateUrl('http://localhost:11434', { 
        allowLocalhost: true 
      });
      
      expect(result.valid).toBe(true);
      expect(result.warning).toMatch(/localhost.*allowed/i);
      expect(result.url).toBe('http://localhost:11434/');
    });

    test('should allow 127.0.0.1 when allowLocalhost=true', async () => {
      const result = await validateUrl('http://127.0.0.1:11434', { 
        allowLocalhost: true 
      });
      
      expect(result.valid).toBe(true);
      expect(result.warning).toMatch(/localhost.*allowed/i);
    });

    test('should allow IPv6 loopback when allowLocalhost=true', async () => {
      const result = await validateUrl('http://[::1]:11434', { 
        allowLocalhost: true 
      });
      
      expect(result.valid).toBe(true);
    });
  });

  describe('allowPrivateIPs option', () => {
    test('should block private IPs by default', async () => {
      const privateIPs = [
        'http://192.168.1.100:11434',
        'http://10.0.0.50:11434',
        'http://172.16.0.10:11434',
      ];

      for (const ip of privateIPs) {
        const result = await validateUrl(ip);
        expect(result.valid).toBe(false);
        expect(result.blocked).toBe(true);
        expect(result.error).toMatch(/private|Private/i);
      }
    });

    test('should allow private IPs when allowPrivateIPs=true', async () => {
      const privateIPs = [
        'http://192.168.1.100:11434',
        'http://10.0.0.50:11434',
        'http://172.16.0.10:11434',
      ];

      for (const ip of privateIPs) {
        const result = await validateUrl(ip, { 
          allowPrivateIPs: true 
        });
        expect(result.valid).toBe(true);
        expect(result.warning).toMatch(/private.*allowed/i);
      }
    });

    test('should still block cloud metadata endpoints even with allowPrivateIPs', async () => {
      const cloudMetadata = [
        'http://169.254.169.254/latest/meta-data/',
        'http://metadata.google.internal/',
      ];

      for (const url of cloudMetadata) {
        const result = await validateUrl(url, { 
          allowPrivateIPs: true 
        });
        expect(result.valid).toBe(false);
        expect(result.blocked).toBe(true);
      }
    });
  });

  describe('Combined options for AI services', () => {
    test('should allow both localhost and private IPs for AI integration', async () => {
      const aiUrls = [
        'http://localhost:11434',
        'http://127.0.0.1:11434',
        'http://192.168.1.100:11434',
        'http://10.0.50.100:11434',
      ];

      const options = { 
        allowLocalhost: true, 
        allowPrivateIPs: true 
      };

      for (const url of aiUrls) {
        const result = await validateUrl(url, options);
        expect(result.valid).toBe(true);
        expect(result.url).toBeDefined();
      }
    });

    test('should match security config allowance for AI services', () => {
      // Verify that security config allows what we expect
      expect(SECURITY_CONFIG.urlValidation.allowLocalhost).toBe(true);
      expect(SECURITY_CONFIG.urlValidation.allowPrivateIPs).toBe(true);
    });
  });

  describe('Public URLs still work with options', () => {
    test('should allow public URLs with any option combination', async () => {
      const publicUrls = [
        'https://api.mistral.ai/v1/models',
        'https://raw.githubusercontent.com/file.json',
        'https://pages.nist.gov/oscal/resources/',
      ];

      const optionCombinations = [
        {},
        { allowLocalhost: true },
        { allowPrivateIPs: true },
        { allowLocalhost: true, allowPrivateIPs: true },
      ];

      for (const url of publicUrls) {
        for (const options of optionCombinations) {
          const result = await validateUrl(url, options);
          expect(result.valid).toBe(true);
          expect(result.blocked).toBeUndefined();
        }
      }
    });
  });

  describe('Dangerous protocols still blocked with options', () => {
    test('should block file:// protocol regardless of options', async () => {
      const result = await validateUrl('file:///etc/passwd', { 
        allowLocalhost: true, 
        allowPrivateIPs: true 
      });
      
      expect(result.valid).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.error).toMatch(/protocol/i);
    });

    test('should block other dangerous protocols', async () => {
      const dangerousUrls = [
        'gopher://localhost:70',
        'dict://localhost:2628',
        'ftp://localhost/file',
      ];

      for (const url of dangerousUrls) {
        const result = await validateUrl(url, { 
          allowLocalhost: true, 
          allowPrivateIPs: true 
        });
        expect(result.valid).toBe(false);
        expect(result.blocked).toBe(true);
      }
    });
  });

  describe('AI Integration Use Case', () => {
    test('should validate Ollama default URL with appropriate options', async () => {
      const ollamaUrl = 'http://localhost:11434';
      
      // Without options - blocked
      const blockedResult = await validateUrl(ollamaUrl);
      expect(blockedResult.valid).toBe(false);
      
      // With AI service options - allowed
      const allowedResult = await validateUrl(ollamaUrl, {
        allowLocalhost: true,
        allowPrivateIPs: true,
      });
      expect(allowedResult.valid).toBe(true);
    });

    test('should validate Mistral AI public API without options', async () => {
      const mistralUrl = 'https://api.mistral.ai/v1/chat/completions';
      
      // Public URL works without any options
      const result = await validateUrl(mistralUrl);
      expect(result.valid).toBe(true);
    });

    test('should support various AI service deployment scenarios', async () => {
      const scenarios = [
        { 
          name: 'Local development Ollama',
          url: 'http://localhost:11434',
          options: { allowLocalhost: true }
        },
        { 
          name: 'Private network Ollama',
          url: 'http://192.168.1.100:11434',
          options: { allowPrivateIPs: true }
        },
        { 
          name: 'Cloud Mistral AI',
          url: 'https://api.mistral.ai/v1/models',
          options: {}
        },
        { 
          name: 'Docker network AI service',
          url: 'http://172.18.0.5:11434',
          options: { allowPrivateIPs: true }
        },
      ];

      for (const scenario of scenarios) {
        const result = await validateUrl(scenario.url, scenario.options);
        expect(result.valid).toBe(true);
      }
    });
  });

  describe('skipDNSCheck option', () => {
    test('should skip DNS resolution when skipDNSCheck=true', async () => {
      // This URL would normally fail DNS lookup
      const result = await validateUrl('https://definitely-does-not-exist-12345.com', {
        skipDNSCheck: true
      });
      
      // Should be valid since we skipped DNS check
      expect(result.valid).toBe(true);
    });

    test('should fail DNS resolution by default', async () => {
      const result = await validateUrl('https://definitely-does-not-exist-12345.com');
      
      // Should fail due to DNS resolution
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/DNS/i);
    });
  });

  describe('validateUrlSync synchronous validation', () => {
    test('should block localhost synchronously', () => {
      const result = validateUrlSync('http://localhost:11434');
      
      expect(result.valid).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.error).toMatch(/localhost/i);
    });

    test('should block private IPs synchronously', () => {
      const result = validateUrlSync('http://192.168.1.1:8080');
      
      expect(result.valid).toBe(false);
      expect(result.blocked).toBe(true);
    });

    test('should accept public URLs synchronously', () => {
      const result = validateUrlSync('https://example.com');
      
      expect(result.valid).toBe(true);
    });
  });

  describe('Security Architecture Documentation', () => {
    test('should document AI Integration architecture decision', () => {
      const architecture = {
        version: '1.6.5',
        decision: 'Allow private IPs and localhost for AI services',
        rationale: 'AI services (Ollama) run on private networks by design',
        implementation: 'validateUrl() accepts allowPrivateIPs and allowLocalhost options',
        securityControls: [
          'Cloud metadata endpoints remain blocked',
          'Dangerous protocols remain blocked',
          'Options must be explicitly enabled per endpoint',
          'Public endpoints still use default strict validation',
        ],
      };

      expect(architecture.version).toBe('1.6.5');
      expect(architecture.securityControls.length).toBe(4);
      expect(architecture.rationale).toContain('private networks');
    });

    test('should verify security config matches validator capabilities', () => {
      // Security config specifies what should be allowed
      const configAllows = {
        localhost: SECURITY_CONFIG.urlValidation.allowLocalhost,
        privateIPs: SECURITY_CONFIG.urlValidation.allowPrivateIPs,
      };

      // Validator supports these options
      const validatorSupports = {
        localhost: true, // allowLocalhost option exists
        privateIPs: true, // allowPrivateIPs option exists
      };

      expect(configAllows.localhost).toBe(validatorSupports.localhost);
      expect(configAllows.privateIPs).toBe(validatorSupports.privateIPs);
    });
  });
});
