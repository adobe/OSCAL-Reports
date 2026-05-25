/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Regression tests for qs CVE-2026-8723 / GHSA-q8mj-m7cp-5q26:
 * stringify must not throw on null/undefined in comma + encodeValuesOnly arrays (fixed in 6.15.2).
 */
import { describe, it, expect } from '@jest/globals';
import { createRequire } from 'module';
import qs from 'qs';

const require = createRequire(import.meta.url);
const qsPkg = require('../../../backend/node_modules/qs/package.json');

function parseVersion(version) {
  const [major, minor, patch] = version.split('.').map(Number);
  return { major, minor, patch };
}

function isQsAtLeast6152(version) {
  const { major, minor, patch } = parseVersion(version);
  if (major !== 6) return false;
  if (minor > 15) return true;
  if (minor < 15) return false;
  return patch >= 2;
}

describe('qs CVE-2026-8723 (comma + encodeValuesOnly null arrays)', () => {
  it('uses qs >= 6.15.2 with the null-array stringify fix', () => {
    expect(isQsAtLeast6152(qsPkg.version)).toBe(true);
  });

  it('does not throw when null or undefined appear in comma encodeValuesOnly arrays', () => {
    const opts = { arrayFormat: 'comma', encodeValuesOnly: true };

    expect(() => qs.stringify({ a: [null, 'b'] }, opts)).not.toThrow();
    expect(() => qs.stringify({ a: [undefined, 'b'] }, opts)).not.toThrow();
    expect(() => qs.stringify({ a: [null] }, opts)).not.toThrow();

    expect(qs.stringify({ a: [null, 'b'] }, opts)).toBe('a=,b');
  });
});
