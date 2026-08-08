/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { describe, test, expect } from '@jest/globals';
import {
  buildProxyFetchHeaders,
  isAllowedProxyFetchMethod,
  sanitizeProxyResponseHeaders,
} from '../../../backend/utils/proxyFetchHelpers.js';

describe('proxyFetchHelpers', () => {
  test('isAllowedProxyFetchMethod allows GET and HEAD only', () => {
    expect(isAllowedProxyFetchMethod('GET')).toBe(true);
    expect(isAllowedProxyFetchMethod('HEAD')).toBe(true);
    expect(isAllowedProxyFetchMethod('PUT')).toBe(false);
    expect(isAllowedProxyFetchMethod('POST')).toBe(false);
  });

  test('buildProxyFetchHeaders strips IMDS token headers', () => {
    const headers = buildProxyFetchHeaders({
      Accept: 'application/json',
      'X-aws-ec2-metadata-token': 'stolen-token',
      'X-aws-ec2-metadata-token-ttl-seconds': '21600',
      Authorization: 'Bearer secret',
    });
    expect(headers['X-aws-ec2-metadata-token']).toBeUndefined();
    expect(headers['X-aws-ec2-metadata-token-ttl-seconds']).toBeUndefined();
    expect(headers.Authorization).toBeUndefined();
    expect(headers.Accept).toBe('application/json');
    expect(headers['User-Agent']).toContain('OSCAL-Report-Generator');
  });

  test('sanitizeProxyResponseHeaders returns content-type only', () => {
    const sanitized = sanitizeProxyResponseHeaders({
      'content-type': 'application/json',
      'x-powered-by': 'Express',
      server: 'nginx',
    });
    expect(sanitized).toEqual({ 'content-type': 'application/json' });
  });
});
