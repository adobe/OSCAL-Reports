/**
 * Authentication and Authorization Middleware
 */

import { validateSession } from './userManager.js';
import { hasPermission } from './roles.js';

/**
 * Authentication middleware - verifies session token
 */
export function authenticate(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '') || 
                req.cookies?.sessionToken ||
                req.query.token;
  
  if (!token) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'No authentication token provided' 
    });
  }
  
  const session = validateSession(token);
  
  if (!session) {
    return res.status(401).json({ 
      error: 'Invalid or expired session',
      message: 'Please log in again' 
    });
  }
  
  // Attach user info to request
  req.user = session;
  next();
}

/**
 * Authorization middleware - checks if user has required permission
 * @param {string} permission - Required permission
 */
export function authorize(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required' 
      });
    }
    
    if (!hasPermission(req.user.role, permission)) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: `Your role (${req.user.role}) does not have permission: ${permission}` 
      });
    }
    
    next();
  };
}

/**
 * Role-based authorization middleware - checks if user has specific role(s)
 * @param {string|Array<string>} allowedRoles - Allowed role(s)
 */
export function requireRole(allowedRoles) {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Authentication required' 
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: `Access denied. Required role(s): ${roles.join(', ')}. Your role: ${req.user.role}` 
      });
    }
    
    next();
  };
}

/**
 * Optional authentication middleware - attaches user if token is valid, but doesn't require it
 */
export function optionalAuth(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '') || 
                req.cookies?.sessionToken ||
                req.query.token;
  
  if (token) {
    const session = validateSession(token);
    if (session) {
      req.user = session;
    }
  }
  
  next();
}

export default {
  authenticate,
  authorize,
  requireRole,
  optionalAuth
};

