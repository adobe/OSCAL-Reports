/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * SSRF remediation regression tests (hex IP bypass, strict profiles, trusted domains).
 */
import { describe, test, expect } from '@jest/globals';
import { validateUrl } from '../../../backend/utils/urlValidator.js';
import { getSsrfValidationOptions } from '../../../backend/utils/securityConfig.js';

const strictOptions = getSsrfValidationOptions('strictUserFetch');
const aiOptions = getSsrfValidationOptions('aiIntegration');
const catalogueOptions = getSsrfValidationOptions('strictCatalogueFetch');

describe('SSRF remediation — non-canonical IP encodings', () => {
  const encodedLocalhostUrls = [
    'http://0x7f000001:3020/health',
    'http://2130706433:3020/health',
    'http://0177.0.0.1:3020/health',
  ];

  test.each(encodedLocalhostUrls)('strict profile blocks %s', async (url) => {
    const result = await validateUrl(url, strictOptions);
    expect(result.valid).toBe(false);
    expect(result.blocked).toBe(true);
  });

  test('aiIntegration still allows canonical localhost for Ollama', async () => {
    const result = await validateUrl('http://127.0.0.1:11434', aiOptions);
    expect(result.valid).toBe(true);
  });

  test('aiIntegration blocks encoded localhost bypass', async () => {
    const result = await validateUrl('http://0x7f000001:11434', aiOptions);
    expect(result.valid).toBe(false);
    expect(result.blocked).toBe(true);
  });

  test('direct IMDS remains blocked under strict profile', async () => {
    const result = await validateUrl(
      'http://169.254.169.254/latest/meta-data/iam/security-credentials/',
      strictOptions,
    );
    expect(result.valid).toBe(false);
    expect(result.blocked).toBe(true);
  });

  test('public HTTPS URL passes strict profile', async () => {
    const result = await validateUrl('https://example.com/catalog.json', strictOptions);
    expect(result.valid).toBe(true);
  });
});

describe('SSRF remediation — trusted domain allowlist', () => {
  test('requireTrustedDomain rejects unknown host when enabled', async () => {
    const result = await validateUrl('https://evil.example.net/catalog.json', {
      ...strictOptions,
      requireTrustedDomain: true,
      trustedDomains: ['github.com', 'pages.nist.gov'],
    });
    expect(result.valid).toBe(false);
    expect(result.blocked).toBe(true);
  });

  test('requireTrustedDomain allows github host', async () => {
    const result = await validateUrl(
      'https://raw.githubusercontent.com/usnistgov/oscal-content/main/catalog.json',
      {
        ...strictOptions,
        requireTrustedDomain: true,
        trustedDomains: ['raw.githubusercontent.com'],
      },
    );
    expect(result.valid).toBe(true);
  });

  test('catalogue profile defaults requireTrustedDomain from env (false in tests)', () => {
    expect(catalogueOptions.requireTrustedDomain).toBe(false);
  });
});

describe('SSRF validation profiles', () => {
  test('strictUserFetch disables private network access', () => {
    expect(strictOptions.allowLocalhost).toBe(false);
    expect(strictOptions.allowPrivateIPs).toBe(false);
    expect(strictOptions.maxRedirects).toBe(0);
  });

  test('aiIntegration keeps private network access for admin AI tests', () => {
    expect(aiOptions.allowLocalhost).toBe(true);
    expect(aiOptions.allowPrivateIPs).toBe(true);
  });
});
