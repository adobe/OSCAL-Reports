/**
 * Rate Limiter Middleware
 * IP-based rate limiting for self-registration endpoint
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license GPL-3.0-or-later
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { atomicWriteJSON } from '../utils/atomicWrite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Rate limit configuration
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour in milliseconds
const MAX_ATTEMPTS_PER_IP = 3; // Maximum registrations per IP per hour

// Rate limit file path (optional persistence)
const RATE_LIMIT_DIR = path.join(__dirname, '..', '..', 'config', 'app');
const RATE_LIMIT_FILE = path.join(RATE_LIMIT_DIR, 'rate_limit.json');

// In-memory store for rate limiting
// Structure: { ip: { count: number, resetAt: timestamp } }
let rateLimitStore = {};

/**
 * Load rate limit data from file (optional persistence)
 * @returns {Object} - Rate limit store
 */
function loadRateLimitStore() {
  try {
    if (fs.existsSync(RATE_LIMIT_FILE)) {
      const data = fs.readFileSync(RATE_LIMIT_FILE, 'utf8');
      const store = JSON.parse(data);
      
      // Clean up expired entries
      const now = Date.now();
      Object.keys(store).forEach(ip => {
        if (store[ip].resetAt < now) {
          delete store[ip];
        }
      });
      
      return store;
    }
  } catch (error) {
    console.error('❌ Error loading rate limit store:', error);
  }
  return {};
}

/**
 * Save rate limit data to file (optional persistence)
 * @param {Object} store - Rate limit store
 */
async function saveRateLimitStore(store) {
  try {
    // Ensure directory exists
    if (!fs.existsSync(RATE_LIMIT_DIR)) {
      fs.mkdirSync(RATE_LIMIT_DIR, { recursive: true });
    }
    
    await atomicWriteJSON(RATE_LIMIT_FILE, store);
  } catch (error) {
    console.error('❌ Error saving rate limit store:', error);
  }
}

/**
 * Get client IP address from request
 * @param {Object} req - Express request object
 * @returns {string} - Client IP address
 */
function getClientIP(req) {
  // Check for various headers that might contain the real IP
  return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
         req.headers['x-real-ip'] ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         req.ip ||
         'unknown';
}

/**
 * Clean up expired rate limit entries
 */
function cleanupExpiredEntries() {
  const now = Date.now();
  Object.keys(rateLimitStore).forEach(ip => {
    if (rateLimitStore[ip].resetAt < now) {
      delete rateLimitStore[ip];
    }
  });
}

/**
 * Registration rate limiter middleware
 * Limits registrations to MAX_ATTEMPTS_PER_IP per hour per IP
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware function
 */
export function registrationRateLimiter(req, res, next) {
  const clientIP = getClientIP(req);
  const now = Date.now();
  
  // Clean up expired entries periodically
  cleanupExpiredEntries();
  
  // Get or initialize rate limit data for this IP
  if (!rateLimitStore[clientIP]) {
    rateLimitStore[clientIP] = {
      count: 0,
      resetAt: now + RATE_LIMIT_WINDOW
    };
  }
  
  const ipData = rateLimitStore[clientIP];
  
  // Check if rate limit window has expired
  if (ipData.resetAt < now) {
    // Reset the counter
    ipData.count = 0;
    ipData.resetAt = now + RATE_LIMIT_WINDOW;
  }
  
  // Check if limit exceeded
  if (ipData.count >= MAX_ATTEMPTS_PER_IP) {
    const timeUntilReset = Math.ceil((ipData.resetAt - now) / 1000 / 60); // Minutes
    console.log(`⚠️ Rate limit exceeded for IP: ${clientIP}`);
    
    return res.status(429).json({
      success: false,
      error: 'Too many registration attempts',
      message: `You have exceeded the maximum number of registration attempts (${MAX_ATTEMPTS_PER_IP} per hour). Please try again in ${timeUntilReset} minutes.`,
      retryAfter: timeUntilReset
    });
  }
  
  // Increment counter
  ipData.count++;
  
  // Optionally persist to file (async, don't wait)
  saveRateLimitStore(rateLimitStore).catch(err => {
    console.error('Failed to persist rate limit data:', err);
  });
  
  // Add rate limit info to response headers
  res.setHeader('X-RateLimit-Limit', MAX_ATTEMPTS_PER_IP);
  res.setHeader('X-RateLimit-Remaining', MAX_ATTEMPTS_PER_IP - ipData.count);
  res.setHeader('X-RateLimit-Reset', new Date(ipData.resetAt).toISOString());
  
  next();
}

/**
 * Reset rate limit for a specific IP (admin function)
 * @param {string} ip - IP address to reset
 * @returns {boolean} - True if reset, false if not found
 */
export function resetRateLimitForIP(ip) {
  if (rateLimitStore[ip]) {
    delete rateLimitStore[ip];
    console.log(`✅ Rate limit reset for IP: ${ip}`);
    return true;
  }
  return false;
}

/**
 * Get current rate limit status for an IP
 * @param {string} ip - IP address to check
 * @returns {Object|null} - Rate limit status or null
 */
export function getRateLimitStatus(ip) {
  if (rateLimitStore[ip]) {
    const now = Date.now();
    const timeUntilReset = Math.max(0, rateLimitStore[ip].resetAt - now);
    
    return {
      count: rateLimitStore[ip].count,
      limit: MAX_ATTEMPTS_PER_IP,
      remaining: Math.max(0, MAX_ATTEMPTS_PER_IP - rateLimitStore[ip].count),
      resetAt: new Date(rateLimitStore[ip].resetAt).toISOString(),
      resetIn: Math.ceil(timeUntilReset / 1000 / 60) // Minutes
    };
  }
  
  return {
    count: 0,
    limit: MAX_ATTEMPTS_PER_IP,
    remaining: MAX_ATTEMPTS_PER_IP,
    resetAt: new Date(Date.now() + RATE_LIMIT_WINDOW).toISOString(),
    resetIn: 60 // Minutes
  };
}

// Initialize rate limit store on startup
rateLimitStore = loadRateLimitStore();

export default {
  registrationRateLimiter,
  resetRateLimitForIP,
  getRateLimitStatus
};

