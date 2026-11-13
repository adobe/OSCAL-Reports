/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
// Environment for the local Guardian E2E mode (loopback gateway, test-only authentication).
// The backend's dotenv only fills variables that are NOT already defined, so the real Authentik endpoint settings in
// .env are set to empty strings here; otherwise the backend would see a loopback and a real endpoint together and
// refuse to start the feature. The shared OSCAL_GENERIC_SSO_* issuer is left alone so Generic SSO sign-in still works.
export function localGuardianEnv({ baseUrl, grants, group }) {
  return {
    NODE_ENV: 'development',
    OSCAL_GUARDIAN_ASSESSMENTS_ENABLED: 'true',
    OSCAL_GUARDIAN_LOCAL_GATEWAY: 'true',
    OSCAL_GUARDIAN_ASSESSMENTS_URL: `${baseUrl}/v1/guardian`,
    OSCAL_GUARDIAN_GENERIC_SSO_ASSESSMENTS_URL: '',
    OSCAL_GUARDIAN_ASSESSMENTS_ALLOWED_HOSTS: '',
    OSCAL_GUARDIAN_ASSESSMENT_TARGETS_JSON: JSON.stringify(grants.map(grant => {
      const [provider, targetId] = grant.split('#');
      return { provider, targetId, label: `${provider === 'okta' ? 'Okta' : 'Cloudflare'} ${targetId} (local cache)`, groups: [group] };
    })),
    // Placeholders only satisfy configuration validation; the local gateway trusts its own test issuer.
    OSCAL_GUARDIAN_ISSUER: 'https://dev-assessment.example.test/oauth2/dev',
    OSCAL_GUARDIAN_JWKS_URL: 'https://dev-assessment.example.test/oauth2/dev/v1/keys',
    OSCAL_GUARDIAN_AUDIENCE: 'dev-assessment',
    OSCAL_GUARDIAN_CLIENT_ID: 'dev-oscal',
    OSCAL_GUARDIAN_SCOPES: 'dev:assessment',
  };
}
