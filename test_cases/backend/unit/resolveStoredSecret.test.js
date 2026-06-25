/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { jest } from '@jest/globals';
import { encryptConfigSecret } from '../../../backend/utils/configFieldCrypto.js';
import { resolveStoredSecretValue, coalesceSecretForTest } from '../../../backend/utils/resolveStoredSecret.js';

describe('resolveStoredSecretValue', () => {
  beforeEach(() => {
    process.env.OSCAL_CONFIG_FIELD_SECRET = 'db-test-field-secret';
  });

  afterEach(() => {
    delete process.env.OSCAL_CONFIG_FIELD_SECRET;
  });

  it('decrypts _cfgenc database password to string', () => {
    const enc = encryptConfigSecret('my-db-password');
    const plain = resolveStoredSecretValue(enc);
    expect(typeof plain).toBe('string');
    expect(plain).toBe('my-db-password');
  });

  it('coalesceSecretForTest uses stored _cfgenc when form sends MASK', () => {
    const enc = encryptConfigSecret('gmail-app-pass');
    expect(coalesceSecretForTest('********', '', enc)).toBe('gmail-app-pass');
    expect(coalesceSecretForTest('', '', enc)).toBe('gmail-app-pass');
  });
});
