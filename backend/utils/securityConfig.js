/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */

/** Domains permitted for OSCAL catalogue fetch when requireTrustedDomain is enabled. */
export const CATALOGUE_TRUSTED_DOMAINS = [
  'raw.githubusercontent.com',
  'github.com',
  'pages.nist.gov',
  'csrc.nist.gov',
  'api.mistral.ai',
];

/**
 * Per-endpoint SSRF validation profiles.
 * Do not use aiIntegration flags on unauthenticated user-controlled URL fetches.
 */
export const SSRF_VALIDATION_PROFILES = {
  /** User proxy / published SOA URL fetch — public HTTPS only, no redirects. */
  strictUserFetch: {
    allowLocalhost: false,
    allowPrivateIPs: false,
    maxRedirects: 0,
    rejectNonCanonicalIpEncoding: true,
    requireTrustedDomain: false,
  },
  /** OSCAL catalogue fetch — strict network posture; optional domain allowlist via env. */
  strictCatalogueFetch: {
    allowLocalhost: false,
    allowPrivateIPs: false,
    maxRedirects: 0,
    rejectNonCanonicalIpEncoding: true,
    requireTrustedDomain: process.env.OSCAL_CATALOGUE_STRICT_DOMAINS === 'true',
    trustedDomains: CATALOGUE_TRUSTED_DOMAINS,
  },
  /** Authenticated AI / Ollama admin test endpoints only. */
  aiIntegration: {
    allowLocalhost: true,
    allowPrivateIPs: true,
    maxRedirects: 0,
    rejectNonCanonicalIpEncoding: true,
    requireTrustedDomain: false,
  },
};

/**
 * @param {'strictUserFetch'|'strictCatalogueFetch'|'aiIntegration'} profileName
 * @returns {object}
 */
export function getSsrfValidationOptions(profileName) {
  const profile = SSRF_VALIDATION_PROFILES[profileName];
  if (!profile) {
    return { ...SSRF_VALIDATION_PROFILES.strictUserFetch };
  }
  return { ...profile };
}

export const SECURITY_CONFIG = {
  // CSRF Protection
  csrf: {
    enabled: process.env.CSRF_ENABLED !== 'false', // Enable by default
    cookieName: '_csrf',
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'strict',
      maxAge: 3600000, // 1 hour
    },
  },

  // Session Configuration
  session: {
    secret: process.env.SESSION_SECRET || 'oscal-ssp-session-secret-change-in-production',
    name: 'oscal.sid',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 3600000, // 1 hour
    },
  },

  // URL Validation for SSRF Prevention
  urlValidation: {
    // Legacy fields — prefer SSRF_VALIDATION_PROFILES per endpoint
    allowLocalhost: SSRF_VALIDATION_PROFILES.aiIntegration.allowLocalhost,
    allowPrivateIPs: SSRF_VALIDATION_PROFILES.aiIntegration.allowPrivateIPs,
    trustedDomains: CATALOGUE_TRUSTED_DOMAINS,
  },

  // Rate Limiting
  rateLimiting: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
  },
};

// CSRF exempted paths (paths that don't need CSRF protection)
//
// ARCHITECTURAL DECISION: All /api/ endpoints are exempt from CSRF protection
//
// Rationale:
// 1. Protected endpoints use Bearer token authentication (immune to CSRF attacks)
// 2. Session cookies use sameSite: 'strict' for additional protection
//
// Security measures that remain active:
// - Bearer token authentication and authorization for protected endpoints
// - SSRF protection via validateUrl() and SSRF_PROTECTED_ENDPOINTS
// - Rate limiting on all endpoints
// - Input validation per endpoint
// - Role-based access control (RBAC) for admin operations
export const CSRF_EXEMPT_PATHS = [
  '/health',
  '/api/', // Exempt all API endpoints - see rationale above
];

// Paths that MUST have CSRF protection (even though they are under /api/)
export const CSRF_PROTECTED_PATHS = [
  '/api/auth/okta/exchange-token',
  '/api/auth/oidc/generic-oidc/exchange-token',
];

// Paths that should always validate URLs (SSRF protection)
export const SSRF_PROTECTED_ENDPOINTS = [
  '/api/fetch-catalogue',
  '/api/proxy-fetch',
  '/api/saml/metadata-url',
  '/api/ai/test',
];

export default SECURITY_CONFIG;
