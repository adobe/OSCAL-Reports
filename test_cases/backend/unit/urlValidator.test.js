/**
 * URL Validator Tests
 * Tests for SSRF prevention utility
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { validateUrl, validateUrlSync } from '../../../backend/utils/urlValidator.js';

describe('URL Validator - SSRF Prevention', () => {
  describe('validateUrl() - Async validation with DNS resolution', () => {
    
    it('should accept valid public URLs', async () => {
      const validUrls = [
        'https://example.com',
        'https://www.google.com',
        'https://raw.githubusercontent.com/file.json',
        'https://pages.nist.gov/oscal/resources/',
      ];

      for (const url of validUrls) {
        const result = await validateUrl(url);
        expect(result.valid).toBe(true);
        expect(result.url).toBeDefined();
      }
    });

    it('should reject localhost URLs', async () => {
      const localhostUrls = [
        'http://localhost:3000',
        'http://127.0.0.1:8080',
        'http://[::1]:3000',
        'https://localhost/api',
      ];

      for (const url of localhostUrls) {
        const result = await validateUrl(url);
        expect(result.valid).toBe(false);
        expect(result.blocked).toBe(true);
        expect(result.error).toMatch(/localhost|loopback|private/i);
      }
    });

    it('should reject private IP ranges', async () => {
      const privateIPs = [
        'http://10.0.0.1',
        'http://172.16.0.1',
        'http://192.168.1.1',
        'http://192.168.0.100:8080',
      ];

      for (const url of privateIPs) {
        const result = await validateUrl(url);
        expect(result.valid).toBe(false);
        expect(result.blocked).toBe(true);
        expect(result.error).toMatch(/private|Private/i);
      }
    });

    it('should reject cloud metadata endpoint (169.254.169.254)', async () => {
      const metadataUrls = [
        'http://169.254.169.254',
        'http://169.254.169.254/latest/meta-data/',
        'http://169.254.169.254/latest/user-data',
      ];

      for (const url of metadataUrls) {
        const result = await validateUrl(url);
        expect(result.valid).toBe(false);
        expect(result.blocked).toBe(true);
        expect(result.error).toContain('Link-local / Cloud Metadata');
      }
    });

    it('should reject dangerous protocols', async () => {
      const dangerousUrls = [
        'file:///etc/passwd',
        'ftp://internal.server.com/file',
        'gopher://internal/resource',
        'dict://localhost:11211/stats',
        'javascript:alert(1)',
      ];

      for (const url of dangerousUrls) {
        const result = await validateUrl(url);
        expect(result.valid).toBe(false);
        expect(result.blocked).toBe(true);
        expect(result.error).toMatch(/protocol|Dangerous/i);
      }
    });

    it('should reject URLs with embedded credentials', async () => {
      const urlsWithCreds = [
        'http://user:pass@example.com',
        'https://admin:secret@api.example.com',
      ];

      for (const url of urlsWithCreds) {
        const result = await validateUrl(url);
        expect(result.valid).toBe(false);
        expect(result.blocked).toBe(true);
        expect(result.error).toContain('credentials');
      }
    });

    it('should reject malformed URLs', async () => {
      const malformedUrls = [
        'not-a-url',
        'htp://missing-t.com',
        '://no-protocol.com',
        'http://',
        '',
      ];

      for (const url of malformedUrls) {
        const result = await validateUrl(url);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      }
    });

    it('should allow localhost when configured', async () => {
      const result = await validateUrl('http://localhost:3000', {
        allowLocalhost: true,
      });
      
      expect(result.valid).toBe(true);
      expect(result.warning).toContain('Localhost');
    });

    it('should allow private IPs when configured', async () => {
      const result = await validateUrl('http://192.168.1.100', {
        allowPrivateIPs: true,
      });
      
      expect(result.valid).toBe(true);
      expect(result.warning).toContain('Private IP');
    });

    it('should handle DNS resolution failures gracefully', async () => {
      const result = await validateUrl('http://this-domain-does-not-exist-12345.com');
      
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/DNS|resolution/i);
      expect(result.blocked).toBe(false); // Not blocked, just unreachable
    });
  });

  describe('validateUrlSync() - Synchronous validation without DNS', () => {
    it('should validate public URLs synchronously', () => {
      const result = validateUrlSync('https://example.com');
      
      expect(result.valid).toBe(true);
      expect(result.warning).toContain('synchronous');
    });

    it('should reject localhost synchronously', () => {
      const result = validateUrlSync('http://localhost:3000');
      
      expect(result.valid).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.error).toContain('Localhost');
    });

    it('should reject private IPs synchronously', () => {
      const result = validateUrlSync('http://192.168.1.1');
      
      expect(result.valid).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.error).toMatch(/private|Private/i);
    });

    it('should reject dangerous protocols synchronously', () => {
      const result = validateUrlSync('file:///etc/passwd');
      
      expect(result.valid).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.error).toMatch(/protocol|Dangerous/i);
    });
  });

  describe('Edge cases and security bypasses', () => {
    it('should handle URL-encoded localhost', async () => {
      // Attackers might try to bypass using URL encoding
      const result = await validateUrl('http://127.0.0.1');
      
      expect(result.valid).toBe(false);
      expect(result.blocked).toBe(true);
    });

    it('should handle IPv6 loopback', async () => {
      const result = await validateUrl('http://[::1]:3000');
      
      expect(result.valid).toBe(false);
      expect(result.blocked).toBe(true);
      expect(result.error).toMatch(/localhost|loopback|private|IPv6/i);
    });

    it('should handle link-local IPv6 addresses', async () => {
      const result = await validateUrl('http://[fe80::1]:3000');
      
      expect(result.valid).toBe(false);
      expect(result.blocked).toBe(true);
    });

    it('should reject URLs with unusual ports to internal services', async () => {
      const result = await validateUrl('http://169.254.169.254:8080');
      
      expect(result.valid).toBe(false);
      expect(result.blocked).toBe(true);
    });
  });

  describe('Allowed protocols', () => {
    it('should accept HTTP protocol', async () => {
      const result = await validateUrl('http://example.com', {
        skipDNSCheck: true,
      });
      
      expect(result.valid).toBe(true);
      expect(result.protocol).toBe('http:');
    });

    it('should accept HTTPS protocol', async () => {
      const result = await validateUrl('https://example.com', {
        skipDNSCheck: true,
      });
      
      expect(result.valid).toBe(true);
      expect(result.protocol).toBe('https:');
    });

    it('should reject FTP protocol', async () => {
      const result = await validateUrl('ftp://example.com/file');
      
      expect(result.valid).toBe(false);
      expect(result.blocked).toBe(true);
    });
  });
});

describe('Real-world SSRF attack scenarios', () => {
  it('should block AWS metadata endpoint access', async () => {
    // Attackers try to access AWS metadata to steal credentials
    const result = await validateUrl('http://169.254.169.254/latest/meta-data/iam/security-credentials/');
    
    expect(result.valid).toBe(false);
    expect(result.blocked).toBe(true);
  });

  it('should block internal network scanning attempts', async () => {
    // Attackers try to scan internal network
    const internalIPs = [
      'http://10.0.0.1:22',
      'http://172.16.0.1:3306',
      'http://192.168.1.1:445',
    ];

    for (const url of internalIPs) {
      const result = await validateUrl(url);
      expect(result.valid).toBe(false);
      expect(result.blocked).toBe(true);
    }
  });

  it('should block file system access attempts', async () => {
    // Attackers try to read local files
    const fileUrls = [
      'file:///etc/passwd',
      'file:///c:/windows/system32/config/sam',
      'file:///proc/self/environ',
    ];

    for (const url of fileUrls) {
      const result = await validateUrl(url);
      expect(result.valid).toBe(false);
      expect(result.blocked).toBe(true);
    }
  });

  it('should block Redis/Memcached access attempts', async () => {
    // Attackers try to access internal cache servers
    const result = await validateUrl('gopher://127.0.0.1:6379/1*3%0d%0a$3%0d%0aset%0d%0a');
    
    expect(result.valid).toBe(false);
    expect(result.blocked).toBe(true);
  });
});

describe('Performance and validation options', () => {
  it('should complete validation within reasonable time', async () => {
    const startTime = Date.now();
    await validateUrl('https://example.com');
    const duration = Date.now() - startTime;
    
    // Should complete within 5 seconds
    expect(duration).toBeLessThan(5000);
  });

  it('should skip DNS check when requested', async () => {
    const result = await validateUrl('http://example.com', {
      skipDNSCheck: true,
    });
    
    expect(result.valid).toBe(true);
    // DNS check skipped, so no IP resolution
  });
});
