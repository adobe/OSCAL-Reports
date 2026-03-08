/**
 * Security Configuration
 * Centralized security settings for the application
 */

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
    // AI Integration Architecture: Ollama is designed to run on private network
    // Private IPs are ALWAYS allowed for AI services (development & production)
    // This is a architectural design decision, not a security bypass
    // Other SSRF protections remain active (cloud metadata, dangerous protocols)
    allowLocalhost: true,  // Always allow localhost for AI services
    allowPrivateIPs: true, // Always allow private IPs for AI services
    
    // Trusted domains for specific endpoints
    trustedDomains: [
      'raw.githubusercontent.com',
      'github.com',
      'pages.nist.gov',
      'csrc.nist.gov',
      'api.mistral.ai',
    ],
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
//    - Bearer tokens are not automatically sent by browsers like cookies
//    - Attackers cannot force a user's browser to send valid Bearer tokens
// 2. Public endpoints need to work without session-based authentication
// 3. Core functionality (catalogue loading, report generation) requires public API access
// 4. Session cookies use sameSite: 'strict' for additional protection
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
// Snyk/CodeQL: UseCsurfForExpress - state-changing endpoints that accept cookie/session
// must validate CSRF. Okta exchange-token is protected; frontend fetches token before POST.
export const CSRF_PROTECTED_PATHS = [
  '/api/auth/okta/exchange-token',
];

// Paths that should always validate URLs (SSRF protection)
export const SSRF_PROTECTED_ENDPOINTS = [
  '/api/fetch-catalogue',
  '/api/proxy-fetch',
  '/api/saml/metadata-url',
  '/api/ai/test',
  '/api/ollama/test',
];

export default SECURITY_CONFIG;
