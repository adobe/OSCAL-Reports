/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { isGenericOidcTlsRelaxed } from '../../../backend/utils/oidcHttpsAgent.js';

describe('oidcHttpsAgent', () => {
  const prevEnv = process.env.OSCAL_GENERIC_OIDC_TLS_RELAXED;

  afterEach(() => {
    if (prevEnv === undefined) delete process.env.OSCAL_GENERIC_OIDC_TLS_RELAXED;
    else process.env.OSCAL_GENERIC_OIDC_TLS_RELAXED = prevEnv;
  });

  it('env OSCAL_GENERIC_OIDC_TLS_RELAXED=1 overrides config tlsRelaxed:false', () => {
    process.env.OSCAL_GENERIC_OIDC_TLS_RELAXED = '1';
    expect(isGenericOidcTlsRelaxed({ tlsRelaxed: false })).toBe(true);
  });

  it('config tlsRelaxed:true when env unset', () => {
    delete process.env.OSCAL_GENERIC_OIDC_TLS_RELAXED;
    expect(isGenericOidcTlsRelaxed({ tlsRelaxed: true })).toBe(true);
  });

  it('env OSCAL_GENERIC_OIDC_TLS_RELAXED=0 disables even when config true', () => {
    process.env.OSCAL_GENERIC_OIDC_TLS_RELAXED = '0';
    expect(isGenericOidcTlsRelaxed({ tlsRelaxed: true })).toBe(false);
  });
});
