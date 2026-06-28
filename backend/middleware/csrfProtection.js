/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Cookie-based CSRF protection using the maintained `csrf` package.
 * Replaces deprecated `csurf` with equivalent behavior for Okta exchange-token.
 */
import Tokens from 'csrf';
import { SECURITY_CONFIG } from '../utils/securityConfig.js';

const tokens = new Tokens();
const COOKIE_NAME = SECURITY_CONFIG.csrf.cookieName;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function readSecret(req) {
  return req.cookies?.[COOKIE_NAME];
}

function ensureSecret(req, res) {
  let secret = readSecret(req);
  if (!secret) {
    secret = tokens.secretSync();
    res.cookie(COOKIE_NAME, secret, SECURITY_CONFIG.csrf.cookieOptions);
  }
  return secret;
}

function readSubmittedToken(req) {
  const headers = req.headers;
  return (
    headers['csrf-token'] ||
    headers['xsrf-token'] ||
    headers['x-csrf-token'] ||
    headers['x-xsrf-token'] ||
    (req.body && req.body._csrf)
  );
}

/**
 * Express middleware: issue req.csrfToken(); validate token on unsafe methods.
 */
export function csrfProtection(req, res, next) {
  const secret = ensureSecret(req, res);
  req.csrfToken = () => tokens.create(secret);

  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const submitted = readSubmittedToken(req);
  if (!submitted || !tokens.verify(secret, submitted)) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }

  return next();
}

export default csrfProtection;
