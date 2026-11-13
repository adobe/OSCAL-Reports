/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Local Guardian E2E mode must keep working when .env also holds the real Authentik endpoint settings.
 */
import { describe, it, expect } from '@jest/globals';
import { localGuardianEnv } from '../../../scripts/lib/localGuardianEnv.mjs';
import { readGuardianAssessmentConfig, readGenericSsoConfig } from '../../../backend/guardianAssessments.js';

const REAL_HOST = 'abc123.execute-api.ap-southeast-2.amazonaws.com';
// What the backend's dotenv adds: only variables that are not already defined (an empty string counts as defined).
const dotenvFile = {
  OSCAL_GUARDIAN_ASSESSMENTS_ENABLED: 'true',
  OSCAL_GUARDIAN_GENERIC_SSO_ASSESSMENTS_URL: `https://${REAL_HOST}/v1/guardian`,
  OSCAL_GUARDIAN_ASSESSMENTS_ALLOWED_HOSTS: REAL_HOST,
  OSCAL_GENERIC_SSO_ISSUER: 'https://sso.example.test/application/o/app/',
  OSCAL_GENERIC_SSO_CLIENT_ID: 'app',
  OSCAL_GUARDIAN_GENERIC_SSO_SCOPE: 'guardian-assessments',
  OSCAL_GUARDIAN_ASSESSMENT_TARGETS_JSON: '[]',
};
const afterDotenv = (env) => {
  const merged = { ...env };
  for (const [key, value] of Object.entries(dotenvFile)) { if (!(key in merged)) { merged[key] = value; } }
  return merged;
};

describe('local Guardian E2E environment', () => {
  const local = localGuardianEnv({ baseUrl: 'http://127.0.0.1:8768', group: 'OSCAL_Platform Admin',
    grants: ['cloudflare#PROD_AEMGovAu', 'okta#AEMGovAu'] });

  it('stays configured (loopback only) even when .env holds the real Authentik endpoint', () => {
    const config = readGuardianAssessmentConfig(afterDotenv(local));
    expect(config.local).toBe(true);
    expect(config.url).toBe('http://127.0.0.1:8768/v1/guardian');
    expect(config.genericUrl).toBe(config.url);
    expect(config.targets.map(target => `${target.provider}#${target.targetId}`)).toEqual(['cloudflare#PROD_AEMGovAu', 'okta#AEMGovAu']);
  });

  it('does not blank the shared issuer, so sign-in keeps working in local mode', () => {
    expect(local).not.toHaveProperty('OSCAL_GENERIC_SSO_ISSUER');
    expect(local).not.toHaveProperty('OSCAL_GENERIC_SSO_CLIENT_ID');
  });
});

describe('shared SSO issuer without a Guardian scope', () => {
  it('leaves the Guardian Generic SSO path unconfigured instead of failing', () => {
    expect(readGenericSsoConfig({ OSCAL_GENERIC_SSO_ISSUER: 'https://sso.example.test/a/', OSCAL_GENERIC_SSO_CLIENT_ID: 'app' })).toBeNull();
  });
});
