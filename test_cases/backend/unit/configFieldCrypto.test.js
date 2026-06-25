/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import {
  encryptConfigSecret,
  decryptConfigSecret,
  isCfgEncPointer,
  resolveCfgEncPointers,
  canResolveCfgEnc,
} from '../../../backend/utils/configFieldCrypto.js';

describe('configFieldCrypto', () => {
  const prevSecret = process.env.OSCAL_CONFIG_FIELD_SECRET;

  beforeEach(() => {
    process.env.OSCAL_CONFIG_FIELD_SECRET = 'unit-test-cfgenc-secret';
  });

  afterEach(() => {
    if (prevSecret === undefined) {
      delete process.env.OSCAL_CONFIG_FIELD_SECRET;
    } else {
      process.env.OSCAL_CONFIG_FIELD_SECRET = prevSecret;
    }
  });

  it('encrypt/decrypt roundtrip', () => {
    const enc = encryptConfigSecret('my-client-secret-value');
    expect(isCfgEncPointer(enc)).toBe(true);
    expect(decryptConfigSecret(enc)).toBe('my-client-secret-value');
  });

  it('resolveCfgEncPointers replaces nested _cfgenc objects', () => {
    const enc = encryptConfigSecret('nested-secret');
    const cfg = { ssoConfig: { oauth: { providers: { Generic_OIDC: { clientSecret: enc } } } } };
    resolveCfgEncPointers(cfg);
    expect(cfg.ssoConfig.oauth.providers.Generic_OIDC.clientSecret).toBe('nested-secret');
  });

  it('fails on tampered envelope', () => {
    const enc = encryptConfigSecret('x');
    const tampered = { _cfgenc: `${enc._cfgenc.slice(0, -4)}XXXX` };
    expect(() => decryptConfigSecret(tampered)).toThrow();
  });

  it('fails on wrong version', () => {
    expect(() => decryptConfigSecret({ _cfgenc: 'v0$bad' })).toThrow();
  });

  it('canResolveCfgEnc is false in production without env secrets', () => {
    const prevNode = process.env.NODE_ENV;
    const prevCfg = process.env.OSCAL_CONFIG_FIELD_SECRET;
    const prevSess = process.env.SESSION_SECRET;
    process.env.NODE_ENV = 'production';
    delete process.env.OSCAL_CONFIG_FIELD_SECRET;
    delete process.env.SESSION_SECRET;
    expect(canResolveCfgEnc()).toBe(false);
    const cfg = { ssoConfig: { oauth: { providers: { Generic_OIDC: { clientSecret: { _cfgenc: 'v1$placeholder' } } } } } };
    resolveCfgEncPointers(cfg);
    expect(isCfgEncPointer(cfg.ssoConfig.oauth.providers.Generic_OIDC.clientSecret)).toBe(true);
    process.env.NODE_ENV = prevNode;
    if (prevCfg === undefined) delete process.env.OSCAL_CONFIG_FIELD_SECRET;
    else process.env.OSCAL_CONFIG_FIELD_SECRET = prevCfg;
    if (prevSess === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = prevSess;
  });
});
