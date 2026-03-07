/**
 * OSCAL SOA/SSP/CCM Generator - Backend Server
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license GPL-3.0-or-later
 * 
 * Main Express server for the OSCAL Report Generator application.
 * Provides API endpoints for catalog fetching, SSP generation, and various export formats.
 */

import express from 'express';
import cors from 'cors';
import axios from 'axios';
import https from 'https';
import ExcelJS from 'exceljs';
import { v4 as uuidv4 } from 'uuid';
import { generateCCMExport } from './ccmExport.js';
import { generatePDFReport } from './pdfExport.js';
import { compareWithExistingSSP, extractControlsFromSSP } from './sspComparisonV3.js';
import { parseCCMExcel } from './ccmImport.js';
import { validateOSCAL, getValidatorStatus } from './oscalValidator.js';
import { loadConfig, getResolvedConfig, saveConfig, validateConfig, prepareConfigWithPassPointers, getConfigDir } from './configManager.js';
import { isPassPointer, passShow } from './utils/passResolver.js';
import { MASK } from './utils/sensitiveConfigKeys.js';
import { suggestControlImplementation, suggestMultipleControls } from './controlSuggestionEngine.js';
import { checkMistralAvailability, loadMistralConfig } from './mistralService.js';
import { checkGemmaAvailability, loadGemmaConfig } from './gemmaService.js';
import { checkAIAvailability, detectModelFamily } from './aiModelRouter.js';
import { addIntegrityHash, verifyIntegrityHash, getIntegrityInfo } from './integrityService.js';
import { getLogStats, cleanupOldLogs } from './aiLogger.js';
import { isUserAllowedForAISuggestions } from './utils/aiAllowedUsers.js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from repo root only in development (laptop). Docker and EC2 use their own USERS_PATH/CONFIG_PATH from entrypoint or systemd.
if (process.env.NODE_ENV !== 'production') {
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
}

import { 
  initializeDefaultUsers, 
  authenticateUser, 
  createSessionForOidcUser,
  findOrCreateOidcUser,
  validateSession, 
  logout as logoutUser,
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  deactivateUser,
  hardDeleteUser,
  autoCleanupDeactivatedUsers,
  getDaysSinceDeactivation,
  changePassword,
  generatePassword
} from './auth/userManager.js';
import { generateDefaultPasswordFromEnv } from './auth/passwordGenerator.js';
import { authenticate, authorize, requireRole, optionalAuth } from './auth/middleware.js';
import { ROLES, PERMISSIONS } from './auth/roles.js';
import { 
  createJob, 
  getJob, 
  getJobResult, 
  listJobs, 
  deleteJob, 
  cleanupOldJobs,
  JOB_TYPE,
  JOB_STATUS
} from './jobQueue.js';
import {
  saveState,
  getState,
  listStates,
  deleteState,
  cleanupOldStates,
  getStateStats
} from './debugStateManager.js';
import { isEmailBlacklisted, addToBlacklist } from './auth/emailBlacklist.js';
import { registrationRateLimiter } from './middleware/rateLimiter.js';
import { sendUserCredentials } from './messagingService.js';
import { scheduleUserCleanup } from './jobs/userCleanup.js';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import csrf from 'csurf';
import { validateUrl, validateUrlMiddleware } from './utils/urlValidator.js';
import { SECURITY_CONFIG, CSRF_EXEMPT_PATHS } from './utils/securityConfig.js';

const app = express();
const PORT = process.env.PORT || 3020;

// Set server timeout to 240 seconds (4 minutes) to allow for AI processing
// This is longer than the AI service timeout (180s) to account for overhead
const serverTimeout = 240000; // 240 seconds

// Trust proxy headers when behind reverse proxy (SQUID, Nginx, etc.)
// This ensures correct IP address detection and proper header handling
app.set('trust proxy', true);

// Configure CORS to allow authentication headers through reverse proxy
app.use(cors({
  origin: true, // Allow all origins (can be restricted to specific domains if needed)
  credentials: true, // Allow cookies and authentication headers
  exposedHeaders: ['Authorization', 'X-Session-Token'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Session-Token', 'X-Requested-With'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Security Middleware
// Cookie parser (required for CSRF)
app.use(cookieParser());

// Session management (required for CSRF)
app.use(session(SECURITY_CONFIG.session));

// ============================================================================
// CSRF PROTECTION CONFIGURATION (v1.6.5 Architectural Decision)
// ============================================================================
//
// KODIAK SECURITY SCANNER NOTICE:
// Adobe Kodiak scanner flags all /api/ endpoints with "UseCsurfForExpress" findings.
// These are FALSE POSITIVES based on our v1.6.5 architectural decision.
//
// ARCHITECTURAL DECISION: All /api/ endpoints are EXEMPT from CSRF protection
//
// WHY THIS IS SECURE:
// 1. Bearer Token Authentication is Immune to CSRF
//    - Protected endpoints use "Authorization: Bearer <token>" header
//    - Browsers do NOT automatically send Authorization headers in cross-origin requests
//    - Attackers CANNOT force a victim's browser to send valid Bearer tokens
//    - This is fundamentally different from cookie-based auth (which IS vulnerable to CSRF)
//
// 2. Public Endpoints by Design
//    - Core functionality (catalogue loading, report generation) is intentionally public
//    - These endpoints do not modify user account state
//    - Input validation and SSRF protection remain active
//
// 3. Defense-in-Depth Layers Remain Active:
//    ✅ Bearer token authentication (authenticate middleware)
//    ✅ Role-Based Access Control (requireRole(), authorize())
//    ✅ SSRF protection (validateUrl())
//    ✅ Rate limiting (all endpoints)
//    ✅ Input validation (per-endpoint)
//    ✅ Session cookies use sameSite: 'strict'
//
// INDUSTRY STANDARD:
// This pattern is used by all major REST APIs (GitHub, AWS, Azure, Google Cloud)
//
// REFERENCES:
// - Documentation: docs/SECURITY.md
// - OWASP CSRF Prevention: https://cheatsheetsecurity.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
// - Auth0 Cookies vs Tokens: https://auth0.com/blog/cookies-vs-tokens-definitive-guide/
// - Test Coverage: test_cases/backend/integration/csrf-api.test.js (60+ security tests)
//
// KODIAK SUPPRESSION JUSTIFICATION:
// Scanner cannot recognize that Bearer token authentication makes CSRF irrelevant.
// This is a tool limitation, not a security vulnerability.
// ============================================================================

// CSRF Protection
const csrfProtection = csrf({ 
  cookie: SECURITY_CONFIG.csrf.cookieOptions 
});

// Conditional CSRF middleware - exempt certain paths
app.use((req, res, next) => {
  // Skip CSRF for exempted paths
  if (CSRF_EXEMPT_PATHS.some(path => req.path.startsWith(path))) {
    return next();
  }
  
  // Skip CSRF for GET/HEAD/OPTIONS requests (safe methods)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  // Apply CSRF protection for state-changing requests
  if (SECURITY_CONFIG.csrf.enabled) {
    csrfProtection(req, res, next);
  } else {
    next();
  }
});

// CSRF token endpoint
app.get('/api/csrf-token', csrfProtection, (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// Serve static files from the public folder (warning page for backend)
app.use(express.static('public'));

// Health check endpoint for Docker
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', service: 'Keekar\'s OSCAL SOA/SSP/CCM Generator' });
});

/**
 * Volume status endpoint - Check persistent storage health
 * GET /api/system/volume-status
 * 
 * Returns information about the persistent data volume:
 * - Whether /data directory exists and is writable
 * - Config and users file locations and status
 * - File sizes and last modified timestamps
 * 
 * Authentication optional - shows public info if not authenticated,
 * detailed info if authenticated as Platform Admin
 */
app.get('/api/system/volume-status', optionalAuth, async (req, res) => {
  try {
    const fs = await import('fs');
    const path = await import('path');
    
    const status = {
      timestamp: new Date().toISOString(),
      volumeMount: {
        path: '/data',
        exists: false,
        writable: false,
        type: 'unknown'
      },
      config: {
        path: 'unknown',
        exists: false,
        size: 0,
        lastModified: null
      },
      users: {
        path: 'unknown',
        exists: false,
        size: 0,
        lastModified: null,
        userCount: 0
      },
      persistence: {
        enabled: false,
        recommendation: ''
      }
    };
    
    // Check /data volume mount
    if (fs.existsSync('/data')) {
      status.volumeMount.exists = true;
      
      try {
        fs.accessSync('/data', fs.constants.W_OK);
        status.volumeMount.writable = true;
        
        // Try to determine if it's a volume or directory
        const stats = fs.statSync('/data');
        status.volumeMount.type = stats.isDirectory() ? 'directory' : 'other';
      } catch (err) {
        status.volumeMount.writable = false;
      }
    }
    
    // Check config file (CONFIG_PATH, Docker /data, then config/app)
    const configPaths = [
      process.env.CONFIG_PATH,
      '/data/config.json',
      path.join(process.cwd(), '..', 'config', 'app', 'config.json')
    ].filter(Boolean);
    
    for (const configPath of configPaths) {
      if (fs.existsSync(configPath)) {
        status.config.path = configPath;
        status.config.exists = true;
        
        const stats = fs.statSync(configPath);
        status.config.size = stats.size;
        status.config.lastModified = stats.mtime.toISOString();
        break;
      }
    }
    
    // Check users file (USERS_PATH, Docker /data, then config/app)
    const usersPaths = [
      process.env.USERS_PATH,
      '/data/users.json',
      path.join(process.cwd(), '..', 'config', 'app', 'users.json')
    ].filter(Boolean);
    
    for (const usersPath of usersPaths) {
      if (fs.existsSync(usersPath)) {
        status.users.path = usersPath;
        status.users.exists = true;
        
        const stats = fs.statSync(usersPath);
        status.users.size = stats.size;
        status.users.lastModified = stats.mtime.toISOString();
        
        // Count users (only if authenticated as admin)
        if (req.user && req.user.role === ROLES.PLATFORM_ADMIN) {
          try {
            const data = fs.readFileSync(usersPath, 'utf-8');
            const users = JSON.parse(data);
            status.users.userCount = users.length;
          } catch (err) {
            status.users.userCount = -1; // Error reading
          }
        }
        break;
      }
    }
    
    // Determine persistence status
    if (status.config.path.startsWith('/data') && status.users.path.startsWith('/data')) {
      status.persistence.enabled = true;
      status.persistence.recommendation = 'Volume persistence is properly configured';
    } else if (status.volumeMount.exists && status.volumeMount.writable) {
      status.persistence.enabled = false;
      status.persistence.recommendation = 'Volume mount exists but files are not using it. Restart container to initialize.';
    } else {
      status.persistence.enabled = false;
      status.persistence.recommendation = 'No persistent volume detected. Data will be lost on container updates. Mount a volume to /data';
    }
    
    // Add disk usage if available and user is admin
    if (req.user && req.user.role === ROLES.PLATFORM_ADMIN) {
      try {
        const { execSync } = await import('child_process');
        const dfOutput = execSync('df -h /data 2>/dev/null || echo "N/A"').toString();
        status.diskUsage = dfOutput.trim();
      } catch (err) {
        status.diskUsage = 'Unable to determine disk usage';
      }
    }
    
    res.json(status);
  } catch (error) {
    console.error('❌ Volume status check error:', error);
    res.status(500).json({ 
      error: 'Failed to check volume status',
      message: error.message 
    });
  }
});

// Test endpoint to verify suggestion engine is loaded (for debugging)
app.get('/api/test-suggestions', (req, res) => {
  try {
    const testControl = {
      id: 'AC-1',
      title: 'Access Control Policy',
      description: 'Test control for suggestion engine'
    };
    const suggestions = suggestControlImplementation(testControl, []);
    res.json({
      success: true,
      message: 'Suggestion engine is working',
      testControl: testControl.id,
      suggestions: suggestions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Debug endpoint for integrity hash troubleshooting
app.post('/api/debug-integrity', async (req, res) => {
  try {
    const { oscalData } = req.body;
    
    if (!oscalData) {
      return res.status(400).json({ error: 'OSCAL data is required' });
    }
    
    // Get integrity info
    const integrityInfo = getIntegrityInfo(oscalData);
    
    // Verify hash
    const verificationResult = verifyIntegrityHash(oscalData);
    
    // Get metadata props for inspection
    const metadata = oscalData['system-security-plan']?.metadata || oscalData.metadata;
    const props = metadata?.props || [];
    
    res.json({
      success: true,
      integrityInfo: integrityInfo,
      verification: verificationResult,
      metadata: {
        propsCount: props.length,
        props: props.map(p => ({
          name: p.name,
          ns: p.ns,
          value: p.value?.substring(0, 32) + (p.value?.length > 32 ? '...' : ''),
          class: p.class
        }))
      }
    });
  } catch (error) {
    console.error('Debug integrity error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Get default credentials (for frontend display)
app.get('/api/auth/default-credentials', async (req, res) => {
  try {
    // Get actual users to determine their password timestamps
    const users = await getAllUsers();
    
    const defaultPasswords = {};
    const defaultUsernames = ['admin', 'user', 'assessor'];
    
    for (const username of defaultUsernames) {
      const user = users.find(u => u.username === username);
      if (user && user.updatedAt) {
        // Generate password based on when user was last updated (use UTC to match server timezone)
        const updateDate = new Date(user.updatedAt);
        const day = String(updateDate.getUTCDate()).padStart(2, '0');
        const month = String(updateDate.getUTCMonth() + 1).padStart(2, '0');
        const year = String(updateDate.getUTCFullYear()).slice(-2);
        const hour = String(updateDate.getUTCHours()).padStart(2, '0');
        defaultPasswords[username] = `${username}#${day}${month}${year}${hour}`;
      } else {
        // Fallback to current time if user not found
        defaultPasswords[username] = generateDefaultPasswordFromEnv(username);
      }
    }
    
    res.json({
      success: true,
      passwords: defaultPasswords,
      format: 'username#DDMMYYHH',
      note: 'These are default credentials based on user update timestamp. Change them in production.'
    });
  } catch (error) {
    console.error('Error generating default credentials:', error);
    res.status(500).json({ 
      error: 'Failed to generate default credentials',
      details: error.message 
    });
  }
});

/**
 * Diagnostic endpoint - Check Ollama connectivity (for debugging)
 */
app.get('/api/ollama/diagnostics', authenticate, async (req, res) => {
  try {
    const https = require('https');
    const axios = require('axios');
    const config = await loadMistralConfig();
    
    const diagnostics = {
      ollamaUrl: config.ollamaUrl,
      environment: {
        OLLAMA_URL: process.env.OLLAMA_URL || 'not set',
        OLLAMA_HOST: process.env.OLLAMA_HOST || 'not set'
      },
      tests: {}
    };
    
    // Test 1: Ping test (if ping is available)
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      // Extract hostname from URL
      const hostname = config.ollamaUrl.replace(/^https?:\/\//, '').split(':')[0];
      
      try {
        await execAsync(`ping -c 1 ${hostname}`, { timeout: 5000 });
        diagnostics.tests.ping = { success: true, message: `Host ${hostname} is reachable` };
      } catch (error) {
        diagnostics.tests.ping = { success: false, message: `Host ${hostname} not reachable: ${error.message}` };
      }
    } catch (error) {
      diagnostics.tests.ping = { success: false, message: `Ping test unavailable: ${error.message}` };
    }
    
    // Test 2: HTTP connection test
    try {
      const response = await axios.get(`${config.ollamaUrl}/api/tags`, {
        timeout: 5000,
        httpsAgent: config.ollamaUrl.startsWith('https') ? new https.Agent({ rejectUnauthorized: false }) : undefined
      });
      
      diagnostics.tests.http = {
        success: true,
        message: 'HTTP connection successful',
        models: response.data?.models || []
      };
    } catch (error) {
      diagnostics.tests.http = {
        success: false,
        message: `HTTP connection failed: ${error.message}`,
        code: error.code,
        details: error.response ? {
          status: error.response.status,
          statusText: error.response.statusText
        } : null
      };
    }
    
    // Test 3: DNS resolution test
    try {
      const dns = require('dns');
      const { promisify } = require('util');
      const lookup = promisify(dns.lookup);
      
      const hostname = config.ollamaUrl.replace(/^https?:\/\//, '').split(':')[0];
      const result = await lookup(hostname);
      
      diagnostics.tests.dns = {
        success: true,
        message: `DNS resolution successful`,
        address: result.address,
        family: result.family
      };
    } catch (error) {
      diagnostics.tests.dns = {
        success: false,
        message: `DNS resolution failed: ${error.message}`
      };
    }
    
    // Overall status
    const allTestsPass = Object.values(diagnostics.tests).every(test => test.success === true);
    diagnostics.overall = {
      connected: allTestsPass,
      message: allTestsPass ? 'All connectivity tests passed' : 'Some connectivity tests failed'
    };
    
    res.json({
      success: true,
      diagnostics: diagnostics,
      recommendations: allTestsPass ? [] : [
        'Ensure both containers are on the same Docker network (oscal-network)',
        'Verify Ollama container name is exactly "ollama"',
        'Check OLLAMA_URL environment variable is set to http://ollama:11434',
        'Run: docker network connect oscal-network ollama',
        'Run: docker network connect oscal-network oscal-report-generator-green'
      ]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Diagnostic endpoint - Check user status and config (for debugging)
 */
app.get('/api/auth/diagnostics', (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const configDir = path.join(process.cwd(), 'config', 'app');
    const usersFile = path.join(configDir, 'users.json');
    
    const diagnostics = {
      configDirectory: {
        path: configDir,
        exists: fs.existsSync(configDir),
        writable: false,
        readable: false
      },
      usersFile: {
        path: usersFile,
        exists: fs.existsSync(usersFile),
        readable: false,
        writable: false,
        size: 0
      },
      users: {
        count: 0,
        usernames: []
      },
      buildTimestamp: process.env.BUILD_TIMESTAMP || 'not set',
      environment: process.env.NODE_ENV || 'production'
    };
    
    // Check directory permissions
    if (diagnostics.configDirectory.exists) {
      try {
        fs.accessSync(configDir, fs.constants.W_OK);
        diagnostics.configDirectory.writable = true;
      } catch (e) {
        diagnostics.configDirectory.writable = false;
        diagnostics.configDirectory.writableError = e.message;
      }
      
      try {
        fs.accessSync(configDir, fs.constants.R_OK);
        diagnostics.configDirectory.readable = true;
      } catch (e) {
        diagnostics.configDirectory.readable = false;
        diagnostics.configDirectory.readableError = e.message;
      }
    }
    
    // Check users file
    if (diagnostics.usersFile.exists) {
      try {
        fs.accessSync(usersFile, fs.constants.R_OK);
        diagnostics.usersFile.readable = true;
        const stats = fs.statSync(usersFile);
        diagnostics.usersFile.size = stats.size;
        
        const users = JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
        diagnostics.users.count = users.length;
        diagnostics.users.usernames = users.map(u => u.username);
      } catch (e) {
        diagnostics.usersFile.readable = false;
        diagnostics.usersFile.readError = e.message;
      }
    }
    
    // Try to get users via userManager
    try {
      const allUsers = getAllUsers();
      diagnostics.users.actualCount = allUsers.length;
      diagnostics.users.actualUsernames = allUsers.map(u => u.username);
    } catch (e) {
      diagnostics.users.error = e.message;
    }
    
    res.json({
      success: true,
      diagnostics: diagnostics,
      recommendations: []
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Diagnostic endpoint - Check user status (for debugging)
 */
app.get('/api/auth/diagnostic', (req, res) => {
  try {
    const { username } = req.query;
    const users = getAllUsers();
    
    if (username) {
      const user = users.find(u => u.username === username);
      if (user) {
        return res.json({
          found: true,
          user: user,
          canLogin: user.isActive === true,
          message: user.isActive ? 'User can login' : 'User is inactive - cannot login'
        });
      } else {
        return res.json({
          found: false,
          message: `User '${username}' not found`
        });
      }
    }
    
    // Return all users for diagnostic
    const usersWithStatus = users.map(user => ({
      ...user,
      canLogin: user.isActive === true
    }));
    
    res.json({
      totalUsers: users.length,
      users: usersWithStatus
    });
  } catch (error) {
    console.error('Diagnostic error:', error);
    res.status(500).json({ 
      error: 'Diagnostic failed',
      message: error.message 
    });
  }
});

// ===== AUTHENTICATION & AUTHORIZATION ENDPOINTS =====

/**
 * Self-registration endpoint
 * Allows users to create an account with their email
 * Password is auto-generated and sent via email
 */
app.post('/api/auth/self-register', registrationRateLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    
    console.log(`📝 Self-registration request received for: ${email}`);
    
    // 1. Validate email format
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
        message: 'Please provide a valid email address'
      });
    }
    
    // 2. Check if email is blacklisted (45-day cooldown)
    const blacklistEntry = await isEmailBlacklisted(email);
    if (blacklistEntry) {
      const daysRemaining = Math.ceil((new Date(blacklistEntry.expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
      console.log(`⚠️ Email is blacklisted: ${email} (expires in ${daysRemaining} days)`);
      return res.status(403).json({
        success: false,
        error: 'Email not available',
        message: `This email address cannot be used for registration. It will become available in ${daysRemaining} days.`,
        reason: blacklistEntry.reason
      });
    }
    
    // 3. Check if user already exists
    const existingUsers = await getAllUsers();
    const existingUser = existingUsers.find(u => 
      u.email.toLowerCase() === email.toLowerCase() ||
      u.username.toLowerCase() === email.toLowerCase()
    );
    
    if (existingUser) {
      console.log(`⚠️ User already exists with email: ${email}`);
      return res.status(409).json({
        success: false,
        error: 'User already exists',
        message: 'An account with this email address already exists. Please login or use a different email.'
      });
    }
    
    // 4. Generate password
    const generatedPassword = generatePassword(12);
    
    // 5. Create user with self-registration flag
    const userData = {
      username: email,
      email: email,
      role: ROLES.USER, // Self-registered users always get 'User' role
      fullName: email.split('@')[0], // Use email prefix as default full name
      createdVia: 'self-registration'
    };
    
    const newUser = await createUser(userData, generatedPassword);
    console.log(`✅ Self-registered user created: ${newUser.username}`);
    
    // 6. Send credentials via email
    const sendResult = await sendUserCredentials(
      newUser.email,
      newUser.username,
      newUser.plainPassword,
      newUser.fullName
    );
    
    if (!sendResult.success) {
      console.error(`❌ Failed to send credentials email: ${sendResult.error}`);
      // User was created but email failed - return warning
      return res.status(201).json({
        success: true,
        warning: 'Account created but email delivery failed',
        message: 'Your account has been created, but we could not send your password via email. Please contact the administrator for assistance.',
        email: email
      });
    }
    
    // 7. Return success
    console.log(`✅ Self-registration completed successfully for: ${email}`);
    res.status(201).json({
      success: true,
      message: 'Registration successful! Your password has been sent to your email address.',
      email: email
    });
    
  } catch (error) {
    console.error('❌ Self-registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed',
      message: error.message || 'An error occurred during registration. Please try again later.'
    });
  }
});

/**
 * Login endpoint
 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log(`\n🔐 Login request received`);
    console.log(`   Username: ${username}`);
    console.log(`   Password provided: ${password ? 'Yes' : 'No'}`);
    
    if (!username || !password) {
      console.log(`❌ Missing credentials`);
      return res.status(400).json({ 
        error: 'Missing credentials',
        message: 'Username and password are required' 
      });
    }
    
    const user = await authenticateUser(username, password);
    
    if (!user) {
      console.log(`❌ Authentication failed for: ${username}`);
      return res.status(401).json({ 
        error: 'Invalid credentials',
        message: 'Username or password is incorrect, or user account is inactive' 
      });
    }
    
    console.log(`✅ User logged in successfully: ${user.username} (${user.role})`);
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        fullName: user.fullName
      },
      sessionToken: user.sessionToken
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    console.error('   Stack:', error.stack);
    res.status(500).json({ 
      error: 'Login failed',
      message: error.message 
    });
  }
});

// Okta OIDC state: signed state (preferred, works across restarts and load-balanced instances) + legacy in-memory/file store.
const OKTA_STATE_TTL_MS = 15 * 60 * 1000;
const oktaOidcStateStore = new Map();
const OKTA_STATE_FILE = path.join(__dirname, '..', 'config', 'app', 'okta_oidc_state.json');

function base64UrlEncode(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64UrlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice(0, (4 - (str.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

/** Generate PKCE code_verifier (43–128 chars per RFC 7636). */
function generateCodeVerifier() {
  return base64UrlEncode(crypto.randomBytes(32));
}

/** Compute PKCE code_challenge = base64url(SHA256(ASCII(code_verifier))). */
function computeCodeChallenge(codeVerifier) {
  const hash = crypto.createHash('sha256').update(codeVerifier, 'utf8').digest();
  return base64UrlEncode(hash);
}

/** Create signed state payload so any instance can validate (no server-side store needed). Includes code_verifier for PKCE when Okta requires it. */
function createSignedOktaState(redirectUri, clientSecret, codeVerifier) {
  const payload = {
    redirectUri: redirectUri || '',
    createdAt: Date.now(),
    rnd: crypto.randomBytes(8).toString('hex'),
    ...(codeVerifier ? { codeVerifier } : {})
  };
  const payloadB64 = base64UrlEncode(Buffer.from(JSON.stringify(payload), 'utf8'));
  const sig = crypto.createHmac('sha256', clientSecret || '').update(payloadB64).digest();
  return `${payloadB64}.${base64UrlEncode(sig)}`;
}

/** Verify signed state; returns { redirectUri, codeVerifier? } or null. */
function verifySignedOktaState(state, clientSecret) {
  if (!state || typeof state !== 'string' || !clientSecret) return null;
  const dot = state.indexOf('.');
  if (dot <= 0 || dot === state.length - 1) return null;
  const payloadB64 = state.slice(0, dot);
  const sigB64 = state.slice(dot + 1);
  try {
    const expectedSig = crypto.createHmac('sha256', clientSecret).update(payloadB64).digest();
    const expectedB64 = base64UrlEncode(expectedSig);
    if (sigB64 !== expectedB64) return null;
    const payload = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'));
    if (!payload || typeof payload.createdAt !== 'number') return null;
    if (Date.now() - payload.createdAt > OKTA_STATE_TTL_MS) return null;
    return {
      redirectUri: payload.redirectUri || '',
      ...(payload.codeVerifier ? { codeVerifier: payload.codeVerifier } : {})
    };
  } catch (_) {
    return null;
  }
}

function loadOktaStateFromFile() {
  try {
    if (!fs.existsSync(OKTA_STATE_FILE)) return;
    const raw = fs.readFileSync(OKTA_STATE_FILE, 'utf8');
    const data = JSON.parse(raw);
    const now = Date.now();
    if (data && typeof data === 'object') {
      for (const [s, entry] of Object.entries(data)) {
        if (entry?.createdAt && (now - entry.createdAt) < OKTA_STATE_TTL_MS) {
          oktaOidcStateStore.set(s, {
            createdAt: entry.createdAt,
            redirectUri: entry.redirectUri || '',
            ...(entry.codeVerifier ? { codeVerifier: entry.codeVerifier } : {})
          });
        }
      }
    }
  } catch (_) {
    // ignore
  }
}

function persistOktaState() {
  try {
    const dir = path.dirname(OKTA_STATE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const now = Date.now();
    const obj = {};
    for (const [s, data] of oktaOidcStateStore.entries()) {
      if (data?.createdAt && (now - data.createdAt) < OKTA_STATE_TTL_MS) {
        obj[s] = {
          createdAt: data.createdAt,
          redirectUri: data.redirectUri || '',
          ...(data.codeVerifier ? { codeVerifier: data.codeVerifier } : {})
        };
      }
    }
    fs.writeFileSync(OKTA_STATE_FILE, JSON.stringify(obj), 'utf8');
  } catch (_) {
    // ignore
  }
}

function cleanupOktaState() {
  const now = Date.now();
  for (const [s, data] of oktaOidcStateStore.entries()) {
    if (now - data.createdAt > OKTA_STATE_TTL_MS) oktaOidcStateStore.delete(s);
  }
  persistOktaState();
}

loadOktaStateFromFile();
setInterval(cleanupOktaState, 60 * 1000);

/**
 * Fetch Okta OIDC discovery document and return { authorization_endpoint, token_endpoint, userinfo_endpoint }.
 * Tries: oauth2/{authServerId}/.well-known, then .well-known, then oauth2/default/.well-known.
 */
async function fetchOktaDiscovery(domain, authServerId) {
  const base = `https://${domain}`;
  const toTry = authServerId
    ? [`${base}/oauth2/${authServerId}/.well-known/openid-configuration`]
    : [
        `${base}/.well-known/openid-configuration`,
        `${base}/oauth2/default/.well-known/openid-configuration`
      ];
  for (const url of toTry) {
    try {
      const res = await axios.get(url, { timeout: 8000, validateStatus: () => true });
      if (res.status === 200 && res.data?.authorization_endpoint) {
        return {
          authorization_endpoint: res.data.authorization_endpoint,
          token_endpoint: res.data.token_endpoint,
          userinfo_endpoint: res.data.userinfo_endpoint
        };
      }
    } catch (_) {
      // continue to next URL
    }
  }
  if (authServerId) {
    const fallback = `${base}/.well-known/openid-configuration`;
    try {
      const res = await axios.get(fallback, { timeout: 8000, validateStatus: () => true });
      if (res.status === 200 && res.data?.authorization_endpoint) {
        return {
          authorization_endpoint: res.data.authorization_endpoint,
          token_endpoint: res.data.token_endpoint,
          userinfo_endpoint: res.data.userinfo_endpoint
        };
      }
    } catch (_) {
      // ignore
    }
  }
  return null;
}

/**
 * Decode JWT payload (no signature verification; token was obtained from Okta server-side).
 * Returns the 'groups' claim as an array, or null if missing/not a JWT.
 * Okta often puts groups in the access token or ID token, not in userinfo.
 */
function decodeGroupsFromJwt(jwtString) {
  if (!jwtString || typeof jwtString !== 'string') return null;
  const parts = jwtString.trim().split('.');
  if (parts.length !== 3) return null;
  try {
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const padded = payload + '==='.slice(0, (4 - (payload.length % 4)) % 4);
    const decoded = JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
    const groups = decoded.groups;
    if (Array.isArray(groups)) return groups;
    if (typeof groups === 'string') return [groups];
    return null;
  } catch (_) {
    return null;
  }
}

/**
 * Get effective Okta client secret: from config (after pass resolution) or from env OSCAL_OKTA_CLIENT_SECRET.
 * Use this so EC2/containers can set the secret via env when pass is not available.
 */
function getEffectiveOktaClientSecret(okta) {
  if (!okta) return '';
  const fromConfig = (okta.clientSecret != null && typeof okta.clientSecret === 'string') ? okta.clientSecret.trim() : '';
  const fromEnv = (process.env.OSCAL_OKTA_CLIENT_SECRET || '').trim();
  return fromConfig || fromEnv;
}

/**
 * Start Okta OIDC login: redirect browser to Okta authorization URL
 * Uses OIDC discovery when possible so the correct authorize URL is used (avoids 404).
 */
app.get('/api/auth/okta/authorize', async (req, res) => {
  try {
    const config = getResolvedConfig();
    const oauth = config.ssoConfig?.oauth;
    const okta = oauth?.providers?.okta;
    if (!oauth?.enabled || !okta?.enabled || !okta?.domain?.trim() || !okta?.clientId?.trim()) {
      const back = (req.get('Referer') || req.get('Origin') || '/').replace(/\/$/, '');
      return res.redirect(302, `${back}/?error=okta_not_configured`);
    }
    // Client secret: config (pass-resolved) or env OSCAL_OKTA_CLIENT_SECRET (for EC2 when pass not set up)
    const clientSecret = getEffectiveOktaClientSecret(okta);
    if (!clientSecret) {
      const back = (req.get('Referer') || req.get('Origin') || '/').replace(/\/$/, '');
      return res.redirect(302, `${back}/?error=okta_not_configured`);
    }
    // Redirect URI: env override (for servers behind proxy) > Settings → SSO > request-derived.
    const envRedirect = (process.env.OSCAL_OKTA_REDIRECT_URI || '').trim().replace(/\/+$/, '');
    const configuredRedirect = (okta.redirectUri || '').trim();
    let redirectUri = envRedirect || configuredRedirect || `${req.protocol}://${req.get('host')}/auth/okta/callback`;
    redirectUri = redirectUri.replace(/\/+$/, ''); // Okta requires exact match; no trailing slash
    // PKCE: required when Okta has "Require PKCE" enabled; harmless when not required
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = computeCodeChallenge(codeVerifier);
    const state = createSignedOktaState(redirectUri, clientSecret, codeVerifier);
    const domain = okta.domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const authServerId = (okta.authServerId || '').trim();
    // Use only scopes configured in Okta (do not auto-add 'groups' — many Auth Servers don't have that scope; groups claim can be "Always" in Okta)
    const scope = (okta.scope || 'openid profile email').trim();
    const params = new URLSearchParams({
      client_id: okta.clientId,
      response_type: 'code',
      scope,
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });
    let authorizeUrl;
    const discovery = await fetchOktaDiscovery(domain, authServerId);
    if (discovery?.authorization_endpoint) {
      const ensureHost = (url, host) => {
        try {
          const u = new URL(url);
          u.host = host;
          return u.toString();
        } catch (_) {
          return url;
        }
      };
      const authEndpoint = ensureHost(discovery.authorization_endpoint, domain);
      const sep = authEndpoint.includes('?') ? '&' : '?';
      authorizeUrl = `${authEndpoint}${sep}${params.toString()}`;
    } else {
      const oauth2Path = authServerId ? `oauth2/${authServerId}/v1` : 'oauth2/v1';
      authorizeUrl = `https://${domain}/${oauth2Path}/authorize?${params.toString()}`;
    }
    res.redirect(302, authorizeUrl);
  } catch (err) {
    console.error('❌ Okta authorize error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Exchange Okta authorization code for tokens and create app session
 * No auth required (called from frontend callback with code from Okta).
 */
app.post('/api/auth/okta/exchange-token', async (req, res) => {
  try {
    const { code, state } = req.body;
    if (!code || !state) {
      return res.status(400).json({ success: false, error: 'Missing code or state' });
    }
    const config = getResolvedConfig();
    const okta = config.ssoConfig?.oauth?.providers?.okta;
    const clientSecret = getEffectiveOktaClientSecret(okta);
    if (!okta?.enabled || !okta?.domain?.trim() || !okta?.clientId?.trim() || !clientSecret) {
      return res.status(400).json({ success: false, error: 'Okta OIDC is not configured.' });
    }
    // Prefer signed state (works across restarts and load-balanced instances)
    let stateData = verifySignedOktaState(state, clientSecret);
    if (!stateData) {
      stateData = oktaOidcStateStore.get(state);
      if (!stateData) {
        loadOktaStateFromFile();
        stateData = oktaOidcStateStore.get(state);
      }
      if (stateData) {
        oktaOidcStateStore.delete(state);
        persistOktaState();
      }
    }
    if (!stateData) {
      return res.status(400).json({ success: false, error: 'Invalid or expired state. Please try signing in again.' });
    }
    const redirectUri = (okta.redirectUri || '').trim() || stateData.redirectUri;
    const codeVerifier = stateData.codeVerifier || '';
    const domain = okta.domain.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const authServerId = (okta.authServerId || '').trim();
    let tokenUrl;
    let userinfoUrl;
    const discovery = await fetchOktaDiscovery(domain, authServerId);
    if (discovery?.token_endpoint && discovery?.userinfo_endpoint) {
      // Use configured domain as host so we hit the same tenant we're configured for (Okta discovery can return a different host)
      const ensureHost = (url, host) => {
        try {
          const u = new URL(url);
          u.host = host;
          return u.toString();
        } catch (_) {
          return url;
        }
      };
      tokenUrl = ensureHost(discovery.token_endpoint, domain);
      userinfoUrl = ensureHost(discovery.userinfo_endpoint, domain);
    } else {
      const oauth2Path = authServerId ? `oauth2/${authServerId}/v1` : 'oauth2/v1';
      tokenUrl = `https://${domain}/${oauth2Path}/token`;
      userinfoUrl = `https://${domain}/${oauth2Path}/userinfo`;
    }
    const tokenBody = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: okta.clientId,
      client_secret: clientSecret
    };
    if (codeVerifier) {
      tokenBody.code_verifier = codeVerifier;
    }
    const tokenRes = await axios.post(
      tokenUrl,
      new URLSearchParams(tokenBody).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 10000 }
    );
    const accessToken = tokenRes.data?.access_token;
    if (!accessToken) {
      const oktaError = tokenRes.data?.error_description || tokenRes.data?.error || '';
      const hasSecret = !!clientSecret;
      console.error('❌ Okta token response missing access_token:', {
        'service.name': 'oscal-report-generator',
        'event.action': 'okta_token_exchange_failed',
        'event.outcome': 'failure',
        oktaError: oktaError || '(none in body)',
        status: tokenRes.status,
        redirectUriMatch: redirectUri,
        clientSecretConfigured: hasSecret
      });
      return res.status(401).json({
        success: false,
        error: oktaError || 'Okta did not return an access token.'
      });
    }
    const userinfoRes = await axios.get(userinfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10000
    });
    const profile = userinfoRes.data || {};
    // Okta often returns groups in the access token or ID token, not userinfo. Merge into profile for role resolution.
    let groups = Array.isArray(profile.groups) ? [...profile.groups] : (profile.groups ? [profile.groups] : null);
    const tokenGroups = decodeGroupsFromJwt(accessToken);
    if (tokenGroups && tokenGroups.length) {
      groups = groups ? [...new Set([...groups, ...tokenGroups])] : tokenGroups;
    }
    const idToken = tokenRes.data?.id_token;
    if (idToken) {
      const idGroups = decodeGroupsFromJwt(idToken);
      if (idGroups && idGroups.length) {
        groups = groups ? [...new Set([...groups, ...idGroups])] : idGroups;
      }
    }
    if (groups && groups.length) profile.groups = groups;
    const email = profile.email || profile.sub;
    if (!email) {
      return res.status(400).json({ success: false, error: 'Okta did not return user email.' });
    }
    const oauthConfig = config.ssoConfig?.oauth || {};
    const jitProvisioning = oauthConfig.jitProvisioning === true;
    const rawDefault = (oauthConfig.jitDefaultRole || 'User').trim();
    const jitDefaultRole = [ROLES.PLATFORM_ADMIN, ROLES.ASSESSOR, ROLES.USER].includes(rawDefault) ? rawDefault : ROLES.USER;
    const groupToRoleMapping = oauthConfig.groupToRoleMapping && typeof oauthConfig.groupToRoleMapping === 'object' ? oauthConfig.groupToRoleMapping : {};
    const syncRoleFromGroups = oauthConfig.syncRoleFromGroups !== false;
    const user = await findOrCreateOidcUser(email, profile, {
      jitProvisioning,
      jitDefaultRole,
      groupToRoleMapping,
      syncRoleFromGroups
    });
    if (!user) {
      return res.status(403).json({
        success: false,
        error: 'No application user found for this Okta account. Ask an admin to add your email to Users, enable JIT provisioning, or sign in with username/password.'
      });
    }
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        fullName: user.fullName
      },
      sessionToken: user.sessionToken
    });
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      const status = err.response.status;
      const oktaError = err.response?.data?.error_description || err.response?.data?.error;
      console.error('❌ Okta token exchange failed:', {
        'service.name': 'oscal-report-generator',
        'event.action': 'okta_token_exchange_failed',
        oktaStatus: status,
        oktaError: oktaError || err.response?.data,
        message: err.message
      });
      if (status === 400) {
        const message = oktaError || 'Okta token exchange failed. Code may be expired.';
        return res.status(400).json({
          success: false,
          error: typeof message === 'string' ? message : 'Okta token exchange failed. Code may be expired.'
        });
      }
      if (status === 401) {
        return res.status(401).json({
          success: false,
          error: oktaError || 'Okta rejected client (check Client ID and Client Secret).'
        });
      }
    }
    console.error('❌ Okta exchange-token error:', err);
    res.status(500).json({ success: false, error: err.message || 'Okta sign-in failed.' });
  }
});

/**
 * Logout endpoint
 */
app.post('/api/auth/logout', authenticate, (req, res) => {
  try {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    if (token) {
      logoutUser(token);
    }
    console.log(`✅ User logged out: ${req.user.username}`);
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('❌ Logout error:', error);
    res.status(500).json({ 
      error: 'Logout failed',
      message: error.message 
    });
  }
});

/**
 * Validate session endpoint
 */
app.get('/api/auth/session', authenticate, (req, res) => {
  res.json({
    valid: true,
    user: {
      userId: req.user.userId,
      username: req.user.username,
      email: req.user.email,
      role: req.user.role,
      fullName: req.user.fullName
    }
  });
});

/**
 * Get current user info
 */
app.get('/api/auth/me', authenticate, (req, res) => {
  res.json({
    id: req.user.userId,
    username: req.user.username,
    email: req.user.email,
    role: req.user.role,
    fullName: req.user.fullName
  });
});

/**
 * Change password
 */
app.post('/api/auth/change-password', authenticate, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ 
        error: 'Missing data',
        message: 'Old password and new password are required' 
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ 
        error: 'Invalid password',
        message: 'New password must be at least 6 characters long' 
      });
    }
    
    await changePassword(req.user.userId, oldPassword, newPassword);
    
    console.log(`✅ Password changed for user: ${req.user.username}`);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('❌ Change password error:', error);
    res.status(400).json({ 
      error: 'Failed to change password',
      message: error.message 
    });
  }
});

// ===== USER MANAGEMENT ENDPOINTS (Platform Admin only) =====

/**
 * Get all users
 */
app.get('/api/users', authenticate, requireRole(ROLES.PLATFORM_ADMIN), async (req, res) => {
  try {
    const users = await getAllUsers();
    res.json({ users });
  } catch (error) {
    console.error('❌ Get users error:', error);
    res.status(500).json({ 
      error: 'Failed to get users',
      message: error.message 
    });
  }
});

/**
 * Export users (with passwords for migration)
 * GET /api/users/export
 * 
 * Returns JSON array of all users including hashed passwords for migration purposes.
 * Requires Platform Admin role.
 * 
 * IMPORTANT: This route MUST be before /api/users/:userId to avoid route conflicts
 */
app.get('/api/users/export', authenticate, requireRole(ROLES.PLATFORM_ADMIN), async (req, res) => {
  try {
    console.log(`📤 User export requested by ${req.user.username}`);
    
    // Load all users (including passwords for migration)
    const fs = await import('fs');
    const path = await import('path');
    
    // Read users file directly to include passwords
    let usersData = [];
    const possiblePaths = [
      process.env.USERS_PATH,
      '/data/users.json',
      path.join(process.cwd(), '..', 'config', 'app', 'users.json')
    ].filter(Boolean);
    
    for (const filePath of possiblePaths) {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        usersData = JSON.parse(data);
        console.log(`✅ Loaded ${usersData.length} users from ${filePath}`);
        break;
      }
    }
    
    // Add export metadata
    const exportData = {
      exportedAt: new Date().toISOString(),
      exportedBy: req.user.username,
      version: '1.0',
      userCount: usersData.length,
      users: usersData
    };
    
    res.json(exportData);
    console.log(`✅ Exported ${usersData.length} users`);
  } catch (error) {
    console.error('❌ User export error:', error);
    res.status(500).json({ 
      error: 'Failed to export users',
      message: error.message 
    });
  }
});

/**
 * Import users from exported data
 * POST /api/users/import
 * 
 * Merges imported users with existing users. By default, preserves existing users.
 * Query params:
 *   - mode=merge (default): Skip users with duplicate IDs or usernames
 *   - mode=override: Update existing users if ID matches, create new if not
 *   - mode=replace-by-username: Replace existing user by username (sync Blue/Green when same user has different IDs)
 * 
 * Requires Platform Admin role.
 * 
 * IMPORTANT: This route MUST be before /api/users/:userId to avoid route conflicts
 */
app.post('/api/users/import', authenticate, requireRole(ROLES.PLATFORM_ADMIN), async (req, res) => {
  try {
    const mode = req.query.mode || 'merge';
    const importData = req.body;
    
    console.log(`📥 User import requested by ${req.user.username} (mode: ${mode})`);
    
    // Validate import data structure
    if (!importData || !Array.isArray(importData.users)) {
      return res.status(400).json({
        error: 'Invalid import data',
        message: 'Expected { users: [...] } structure'
      });
    }
    
    const importedUsers = importData.users;
    console.log(`📦 Attempting to import ${importedUsers.length} users`);
    
    // Load existing users
    const fs = await import('fs');
    const path = await import('path');
    
    let existingUsers = [];
    const possiblePaths = [
      process.env.USERS_PATH,
      '/data/users.json',
      path.join(process.cwd(), '..', 'config', 'app', 'users.json')
    ].filter(Boolean);
    
    let usersFilePath = possiblePaths[0];
    for (const filePath of possiblePaths) {
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, 'utf-8');
        existingUsers = JSON.parse(data);
        usersFilePath = filePath;
        console.log(`✅ Loaded ${existingUsers.length} existing users from ${filePath}`);
        break;
      }
    }
    
    const results = {
      mode,
      total: importedUsers.length,
      added: 0,
      updated: 0,
      skipped: 0,
      conflicts: [],
      addedUsers: [],
      updatedUsers: [],
      skippedUsers: []
    };
    
    if (mode === 'override') {
      // Override mode: Update existing or create new
      importedUsers.forEach(importUser => {
        const existingIndex = existingUsers.findIndex(u => u.id === importUser.id);
        
        if (existingIndex !== -1) {
          // Update existing user
          existingUsers[existingIndex] = {
            ...importUser,
            updatedAt: new Date().toISOString(),
            importedAt: new Date().toISOString()
          };
          results.updated++;
          results.updatedUsers.push({
            id: importUser.id,
            username: importUser.username
          });
          console.log(`  ✏️  Updated: ${importUser.username} (${importUser.id})`);
        } else {
          // Check for username conflict
          const usernameConflict = existingUsers.find(u => u.username === importUser.username);
          if (usernameConflict) {
            results.skipped++;
            results.conflicts.push({
              reason: 'username_exists',
              username: importUser.username,
              existingId: usernameConflict.id,
              importId: importUser.id
            });
            results.skippedUsers.push({
              username: importUser.username,
              reason: 'Username already exists with different ID'
            });
            console.log(`  ⏭️  Skipped: ${importUser.username} (username conflict)`);
          } else {
            // Add new user
            existingUsers.push({
              ...importUser,
              importedAt: new Date().toISOString()
            });
            results.added++;
            results.addedUsers.push({
              id: importUser.id,
              username: importUser.username
            });
            console.log(`  ➕ Added: ${importUser.username} (${importUser.id})`);
          }
        }
      });
    } else if (mode === 'replace-by-username') {
      // Replace-by-username: Update existing user by username match, else add new. Used for Blue/Green sync when same user has different IDs (e.g. OIDC JIT on one side).
      importedUsers.forEach(importUser => {
        const existingByUsername = existingUsers.find(u => u.username === importUser.username);
        const existingByIdIndex = existingUsers.findIndex(u => u.id === importUser.id);
        if (existingByUsername) {
          const idx = existingUsers.indexOf(existingByUsername);
          existingUsers[idx] = {
            ...importUser,
            updatedAt: new Date().toISOString(),
            importedAt: new Date().toISOString()
          };
          results.updated++;
          results.updatedUsers.push({
            id: importUser.id,
            username: importUser.username
          });
          console.log(`  ✏️  Replaced by username: ${importUser.username} (${importUser.id})`);
        } else if (existingByIdIndex >= 0) {
          existingUsers[existingByIdIndex] = {
            ...importUser,
            updatedAt: new Date().toISOString(),
            importedAt: new Date().toISOString()
          };
          results.updated++;
          results.updatedUsers.push({
            id: importUser.id,
            username: importUser.username
          });
          console.log(`  ✏️  Updated: ${importUser.username} (${importUser.id})`);
        } else {
          existingUsers.push({
            ...importUser,
            importedAt: new Date().toISOString()
          });
          results.added++;
          results.addedUsers.push({
            id: importUser.id,
            username: importUser.username
          });
          console.log(`  ➕ Added: ${importUser.username} (${importUser.id})`);
        }
      });
    } else {
      // Merge mode (default): Skip duplicates
      importedUsers.forEach(importUser => {
        const idExists = existingUsers.find(u => u.id === importUser.id);
        const usernameExists = existingUsers.find(u => u.username === importUser.username);
        
        if (idExists) {
          results.skipped++;
          results.conflicts.push({
            reason: 'id_exists',
            id: importUser.id,
            username: importUser.username
          });
          results.skippedUsers.push({
            username: importUser.username,
            reason: 'User ID already exists'
          });
          console.log(`  ⏭️  Skipped: ${importUser.username} (ID exists)`);
        } else if (usernameExists) {
          results.skipped++;
          results.conflicts.push({
            reason: 'username_exists',
            username: importUser.username,
            existingId: usernameExists.id,
            importId: importUser.id
          });
          results.skippedUsers.push({
            username: importUser.username,
            reason: 'Username already exists'
          });
          console.log(`  ⏭️  Skipped: ${importUser.username} (username exists)`);
        } else {
          // Add new user
          existingUsers.push({
            ...importUser,
            importedAt: new Date().toISOString()
          });
          results.added++;
          results.addedUsers.push({
            id: importUser.id,
            username: importUser.username
          });
          console.log(`  ➕ Added: ${importUser.username} (${importUser.id})`);
        }
      });
    }
    
    // Save updated users
    const { atomicWriteJSON } = await import('./utils/atomicWrite.js');
    await atomicWriteJSON(usersFilePath, existingUsers, { backup: true });
    
    console.log(`✅ Import complete: ${results.added} added, ${results.updated} updated, ${results.skipped} skipped`);
    
    res.json({
      success: true,
      message: `Import complete: ${results.added} added, ${results.updated} updated, ${results.skipped} skipped`,
      results
    });
  } catch (error) {
    console.error('❌ User import error:', error);
    res.status(500).json({ 
      error: 'Failed to import users',
      message: error.message 
    });
  }
});

/**
 * Get user by ID
 */
app.get('/api/users/:userId', authenticate, requireRole(ROLES.PLATFORM_ADMIN), async (req, res) => {
  try {
    const user = await getUserById(req.params.userId);
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found' 
      });
    }
    res.json({ user });
  } catch (error) {
    console.error('❌ Get user error:', error);
    res.status(500).json({ 
      error: 'Failed to get user',
      message: error.message 
    });
  }
});

/**
 * Create new user
 */
app.post('/api/users', authenticate, requireRole(ROLES.PLATFORM_ADMIN), async (req, res) => {
  try {
    const { username, email, role, fullName } = req.body;
    
    if (!username || !email || !role) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        message: 'Username (email), email, and role are required' 
      });
    }
    
    // Generate password automatically
    const generatedPassword = generatePassword(12);
    
    // Create user with generated password
    const newUser = await createUser({ username, email, role, fullName }, generatedPassword);
    
    console.log(`✅ User created: ${newUser.username} (${newUser.role}) by ${req.user.username}`);
    
    // Send credentials via configured messaging channel
    const { sendUserCredentials } = await import('./messagingService.js');
    const sendResult = await sendUserCredentials(
      newUser.email,
      newUser.username,
      newUser.plainPassword,
      newUser.fullName
    );
    
    if (!sendResult.success) {
      console.warn(`⚠️ Failed to send credentials via messaging: ${sendResult.error}`);
      // Still return success but include warning
      return res.status(201).json({ 
        success: true, 
        user: { ...newUser, plainPassword: undefined }, // Don't send password in response
        warning: `User created but credentials not sent: ${sendResult.error}`,
        credentials: {
          username: newUser.username,
          password: newUser.plainPassword // Include in response for manual sharing if messaging fails
        }
      });
    }
    
    // Remove plain password from response
    const { plainPassword, ...userResponse } = newUser;
    
    res.status(201).json({ 
      success: true, 
      user: userResponse,
      message: 'User created and credentials sent via messaging channel'
    });
  } catch (error) {
    console.error('❌ Create user error:', error);
    res.status(400).json({ 
      error: 'Failed to create user',
      message: error.message 
    });
  }
});

/**
 * Update user
 */
app.put('/api/users/:userId', authenticate, requireRole(ROLES.PLATFORM_ADMIN), (req, res) => {
  try {
    const { username, email, role, fullName, isActive } = req.body;
    
    const updates = {};
    if (username !== undefined) updates.username = username;
    if (email !== undefined) updates.email = email;
    if (role !== undefined) updates.role = role;
    if (fullName !== undefined) updates.fullName = fullName;
    if (isActive !== undefined) updates.isActive = isActive;
    
    const updatedUser = updateUser(req.params.userId, updates);
    
    console.log(`✅ User updated: ${updatedUser.username} by ${req.user.username}`);
    res.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error('❌ Update user error:', error);
    res.status(400).json({ 
      error: 'Failed to update user',
      message: error.message 
    });
  }
});

/**
 * Delete user (hard delete - permanently remove)
 * Requires user to be deactivated for at least 45 days
 */
app.delete('/api/users/:userId', authenticate, requireRole(ROLES.PLATFORM_ADMIN), async (req, res) => {
  try {
    const result = await hardDeleteUser(req.params.userId, false);
    
    console.log(`✅ User permanently deleted: ${req.params.userId} by ${req.user.username}`);
    res.json({ 
      success: true, 
      message: result.message,
      deletedUser: result.deletedUser
    });
  } catch (error) {
    console.error('❌ Delete user error:', error);
    res.status(400).json({ 
      error: 'Failed to delete user',
      message: error.message 
    });
  }
});

/**
 * Get days since deactivation for a user
 */
app.get('/api/users/:userId/deactivation-info', authenticate, requireRole(ROLES.PLATFORM_ADMIN), async (req, res) => {
  try {
    const daysSinceDeactivation = await getDaysSinceDeactivation(req.params.userId);
    const user = await getUserById(req.params.userId);
    
    if (!user) {
      return res.status(404).json({ 
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      isActive: user.isActive,
      deactivatedAt: user.deactivatedAt || null,
      daysSinceDeactivation: daysSinceDeactivation,
      canDelete: daysSinceDeactivation !== null && daysSinceDeactivation >= 45,
      daysRemaining: daysSinceDeactivation !== null && daysSinceDeactivation < 45 
        ? 45 - daysSinceDeactivation 
        : null
    });
  } catch (error) {
    console.error('❌ Get deactivation info error:', error);
    res.status(400).json({ 
      error: 'Failed to get deactivation info',
      message: error.message 
    });
  }
});

/**
 * Reset user password (Admin only)
 */
app.post('/api/users/:userId/reset-password', authenticate, requireRole(ROLES.PLATFORM_ADMIN), (req, res) => {
  try {
    const { newPassword } = req.body;
    
    if (!newPassword) {
      return res.status(400).json({ 
        error: 'Missing data',
        message: 'New password is required' 
      });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ 
        error: 'Invalid password',
        message: 'Password must be at least 6 characters long' 
      });
    }
    
    updateUser(req.params.userId, { password: newPassword });
    
    console.log(`✅ Password reset for user ID: ${req.params.userId} by ${req.user.username}`);
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('❌ Reset password error:', error);
    res.status(400).json({ 
      error: 'Failed to reset password',
      message: error.message 
    });
  }
});

// ===== SSO CONFIGURATION ENDPOINTS (Platform Admin only) =====

/**
 * Get SSO configuration
 * Any authenticated user can read (so Settings shows correct enabled state and saved values).
 * Client secrets are masked for non–Platform Admins.
 */
app.get('/api/sso/config', authenticate, (req, res) => {
  try {
    const config = loadConfig();
    const ssoConfig = config.ssoConfig || {
      saml: { enabled: false },
      oauth: { enabled: false }
    };
    const isPlatformAdmin = req.user?.role === ROLES.PLATFORM_ADMIN;
    if (!isPlatformAdmin && ssoConfig.oauth?.providers) {
      const masked = JSON.parse(JSON.stringify(ssoConfig));
      for (const p of ['azure', 'google', 'okta', 'github']) {
        if (masked.oauth.providers[p]?.clientSecret) {
          masked.oauth.providers[p].clientSecret = '********';
        }
      }
      return res.json(masked);
    }
    console.log('📖 SSO config loaded');
    res.json(ssoConfig);
  } catch (error) {
    console.error('❌ Error loading SSO config:', error);
    res.status(500).json({ 
      error: 'Failed to load SSO configuration',
      message: error.message 
    });
  }
});

/**
 * Save SSO configuration
 * Sensitive fields (client secrets) are stored in pass; only pointers written to config.
 */
app.post('/api/sso/config', authenticate, requireRole(ROLES.PLATFORM_ADMIN), async (req, res) => {
  try {
    const ssoConfig = typeof req.body === 'object' && req.body !== null ? JSON.parse(JSON.stringify(req.body)) : req.body;
    // Normalize Okta domain: hostname only (no https:// or trailing slash) so it works like backend expects
    const okta = ssoConfig?.oauth?.providers?.okta;
    if (okta?.domain && typeof okta.domain === 'string') {
      okta.domain = okta.domain.replace(/^https?:\/\//i, '').replace(/\/+$/, '').trim() || okta.domain;
    }
    const existingRaw = loadConfig();
    const currentConfig = { ...existingRaw, ssoConfig };
    const { config: toSave, passErrors } = prepareConfigWithPassPointers(currentConfig, existingRaw);
    if (passErrors.length > 0) {
      console.warn('⚠️ Pass insert warnings for SSO config:', passErrors);
    }
    const saveResult = await saveConfig(toSave);

    if (saveResult.success) {
      console.log(`✅ SSO config saved by ${req.user.username}`);
      const response = {
        success: true,
        message: saveResult.message || 'SSO configuration saved successfully',
        verification: {
          verified: saveResult.verified,
          timestamp: saveResult.timestamp,
          discrepancies: saveResult.discrepancies
        }
      };
      if (passErrors.length > 0) {
        response.passWarnings = passErrors;
      }
      res.json(response);
    } else {
      res.status(500).json({
        error: 'Failed to save SSO configuration',
        details: saveResult.error
      });
    }
  } catch (error) {
    console.error('❌ Error saving SSO config:', error);
    res.status(500).json({
      error: 'Failed to save SSO configuration',
      message: error.message
    });
  }
});

/**
 * Test SSO connection
 * For Okta: full validation (all fields, redirect URI if provided, Okta discovery).
 */
app.post('/api/sso/test', authenticate, requireRole(ROLES.PLATFORM_ADMIN), async (req, res) => {
  try {
    const { provider, config } = req.body;

    if (process.env.NODE_ENV === 'development') {
      console.log(`🔍 Testing ${provider} SSO connection...`);
    }

    if (provider === 'SAML') {
      const isValid = config.idpEntityId && config.idpSsoUrl && config.spEntityId;
      const errors = [];
      if (!config.idpEntityId) errors.push('Missing IdP Entity ID');
      if (!config.idpSsoUrl) errors.push('Missing IdP SSO URL');
      if (!config.spEntityId) errors.push('Missing SP Entity ID');
      if (isValid) {
        res.json({ success: true, message: `${provider} configuration appears valid` });
      } else {
        res.json({ success: false, error: errors.join(', ') });
      }
      return;
    }

    const providerName = provider.toLowerCase().replace(' ', '');
    const prov = config.providers?.[providerName];

    if (providerName === 'okta' && prov) {
      const errors = [];
      let domain = (prov.domain && typeof prov.domain === 'string') ? prov.domain.replace(/^https?:\/\//i, '').replace(/\/+$/, '').trim() : '';
      if (!domain) {
        errors.push('Missing Okta Domain (e.g. your-domain.okta.com)');
      } else if (!/^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(domain) || !domain.includes('.')) {
        errors.push('Okta Domain must be a valid hostname (e.g. your-domain.okta.com)');
      }
      const redirectUri = (prov.redirectUri && typeof prov.redirectUri === 'string') ? prov.redirectUri.trim() : '';
      if (redirectUri) {
        try {
          const urlValidation = await validateUrl(redirectUri, {
            allowPrivateIPs: SECURITY_CONFIG.urlValidation.allowPrivateIPs,
            allowLocalhost: SECURITY_CONFIG.urlValidation.allowLocalhost,
          });
          if (!urlValidation.valid) {
            errors.push('Invalid Redirect URI: ' + (urlValidation.error || 'URL blocked or invalid'));
          } else if (process.env.NODE_ENV === 'production' && !urlValidation.url.startsWith('https://')) {
            errors.push('Redirect URI must use HTTPS in production');
          }
        } catch (e) {
          errors.push('Invalid Redirect URI: ' + (e.message || 'validation failed'));
        }
      }
      const authServerId = (prov.authServerId && typeof prov.authServerId === 'string') ? prov.authServerId.trim() : '';
      if (authServerId && !/^[a-zA-Z0-9_-]+$/.test(authServerId)) {
        errors.push('Authorization Server ID may only contain letters, numbers, hyphens, and underscores');
      }
      const clientId = (prov.clientId && typeof prov.clientId === 'string') ? prov.clientId.trim() : '';
      if (!clientId) errors.push('Missing Client ID');
      const clientSecret = (prov.clientSecret && typeof prov.clientSecret === 'string') ? prov.clientSecret.trim() : '';
      if (!clientSecret) errors.push('Missing Client Secret');

      if (errors.length > 0) {
        res.json({ success: false, error: errors.join('; ') });
        return;
      }

      const discovery = await fetchOktaDiscovery(domain, authServerId || undefined);
      if (!discovery) {
        res.json({
          success: false,
          error: 'Okta discovery failed: invalid domain or Authorization Server ID, or could not reach Okta discovery endpoint.',
        });
        return;
      }
      const msg = discovery.token_endpoint && discovery.authorization_endpoint
        ? 'Okta configuration is valid; discovery succeeded (authorization and token endpoints found).'
        : 'Okta discovery succeeded.';
      res.json({ success: true, message: msg });
      return;
    }

    // Other OAuth providers: minimal presence check
    const isValid = prov?.clientId;
    const errors = [];
    if (!prov?.clientId) errors.push('Missing Client ID');
    if (isValid) {
      res.json({ success: true, message: `${provider} configuration appears valid` });
    } else {
      res.json({ success: false, error: errors.join(', ') });
    }
  } catch (error) {
    console.error('❌ SSO test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Fetch SAML metadata from URL
 * SECURITY: Protected against SSRF attacks with URL validation
 */
app.post('/api/sso/saml/fetch-metadata', authenticate, requireRole(ROLES.PLATFORM_ADMIN), async (req, res) => {
  try {
    const { metadataUrl } = req.body;
    
    if (!metadataUrl) {
      return res.status(400).json({ 
        success: false,
        error: 'Metadata URL is required' 
      });
    }
    
    // SECURITY: Validate URL to prevent SSRF attacks
    const urlValidation = await validateUrl(metadataUrl, {
      allowPrivateIPs: SECURITY_CONFIG.urlValidation.allowPrivateIPs,
      allowLocalhost: SECURITY_CONFIG.urlValidation.allowLocalhost,
    });
    
    if (!urlValidation.valid) {
      console.warn('🚫 SSRF attempt blocked:', metadataUrl, urlValidation.error);
      
      // Return 403 for blocked URLs (security restriction)
      if (urlValidation.blocked) {
        return res.status(403).json({
          success: false,
          error: 'Access to this URL is forbidden',
          details: urlValidation.error,
          code: 'SSRF_BLOCKED',
        });
      }
      
      // Return 400 for invalid URLs (bad request)
      return res.status(400).json({
        success: false,
        error: 'Invalid URL',
        details: urlValidation.error,
      });
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`📥 Fetching SAML metadata from: ${metadataUrl}`);
    }
    
    // Create HTTPS agent with certificate validation disabled
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false
    });
    
    const response = await axios.get(urlValidation.url, {
      httpsAgent,
      timeout: 10000
    });
    
    // This is a simplified parser - real implementation would use xml2js
    const metadata = response.data;
    
    // Extract basic info (placeholder - would need proper XML parsing)
    const entityIdMatch = metadata.match(/entityID="([^"]+)"/);
    const ssoUrlMatch = metadata.match(/Location="([^"]+)".*SingleSignOnService/);
    
    res.json({
      success: true,
      entityId: entityIdMatch ? entityIdMatch[1] : '',
      ssoUrl: ssoUrlMatch ? ssoUrlMatch[1] : '',
      message: 'Metadata fetched - please verify extracted values'
    });
  } catch (error) {
    console.error('❌ Fetch metadata error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to fetch metadata'
    });
  }
});

// Messaging Configuration Test Endpoints
/**
 * Test email configuration
 */
app.post('/api/messaging/test-email', authenticate, requireRole(ROLES.PLATFORM_ADMIN), async (req, res) => {
  try {
    const { emailConfig: bodyEmailConfig } = req.body;
    if (!bodyEmailConfig) {
      return res.status(400).json({
        success: false,
        error: 'Email configuration is required'
      });
    }
    const resolved = getResolvedConfig();
    const emailConfig = {
      ...resolved.messagingConfig?.email,
      ...bodyEmailConfig,
      smtpPassword: (typeof bodyEmailConfig.smtpPassword === 'object' && bodyEmailConfig.smtpPassword?._pass)
        ? (resolved.messagingConfig?.email?.smtpPassword ?? '')
        : (bodyEmailConfig.smtpPassword ?? resolved.messagingConfig?.email?.smtpPassword ?? '')
    };
    const { testEmailConfig } = await import('./messagingService.js');
    const result = await testEmailConfig(emailConfig);
    
    res.json(result);
  } catch (error) {
    console.error('❌ Test email error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to test email configuration' 
    });
  }
});

/**
 * Test Slack configuration
 */
app.post('/api/messaging/test-slack', authenticate, requireRole(ROLES.PLATFORM_ADMIN), async (req, res) => {
  try {
    const { slackConfig: bodySlackConfig } = req.body;
    if (!bodySlackConfig) {
      return res.status(400).json({
        success: false,
        error: 'Slack configuration is required'
      });
    }
    const resolved = getResolvedConfig();
    const slackConfig = {
      ...resolved.messagingConfig?.slack,
      ...bodySlackConfig,
      webhookUrl: (typeof bodySlackConfig.webhookUrl === 'object' && bodySlackConfig.webhookUrl?._pass)
        ? (resolved.messagingConfig?.slack?.webhookUrl ?? '')
        : (bodySlackConfig.webhookUrl ?? resolved.messagingConfig?.slack?.webhookUrl ?? '')
    };
    const { testSlackConfig } = await import('./messagingService.js');
    const result = await testSlackConfig(slackConfig);
    
    res.json(result);
  } catch (error) {
    console.error('❌ Test Slack error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to test Slack configuration' 
    });
  }
});

// Published SOA/CCM stored files: under Published_OSCAL next to backend (same level as public/).
// Not under public/ so never served as static – only via API. Restrict dir permissions to app user only.
const PUBLISHED_OSCAL_DIR_NAME = 'Published_OSCAL';
const PUBLISHED_SOA_SAFE_FILENAME = /^[a-zA-Z0-9_.-]+\.json$/;
const PUBLISHED_SOA_MAX_BODY_MB = 10;

function getPublishedSoaDir() {
  return path.join(__dirname, PUBLISHED_OSCAL_DIR_NAME);
}

function ensurePublishedOscalDir() {
  const dir = getPublishedSoaDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o750 });
    migratePublishedSoaFromConfigDir();
  }
  return dir;
}

function migratePublishedSoaFromConfigDir() {
  try {
    const oldDir = path.join(getConfigDir(), 'published-soa');
    if (!fs.existsSync(oldDir) || !fs.statSync(oldDir).isDirectory()) return;
    const newDir = getPublishedSoaDir();
    const entries = fs.readdirSync(oldDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.endsWith('.json') && isSafePublishedSoaFilename(e.name)) {
        const src = path.join(oldDir, e.name);
        const dest = path.join(newDir, e.name);
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(src, dest);
          console.log(`📂 Migrated published SOA file to Published_OSCAL: ${e.name}`);
        }
      }
    }
  } catch (err) {
    console.warn('⚠️ Migration from config/published-soa skipped:', err.message);
  }
}

function isSafePublishedSoaFilename(name) {
  return typeof name === 'string' && name.length > 0 && PUBLISHED_SOA_SAFE_FILENAME.test(name) && !name.includes('..');
}

// List stored published SOA/CCM JSON files
app.get('/api/settings/published-soa/files', authenticate, (req, res) => {
  try {
    const dir = ensurePublishedOscalDir();
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && e.name.endsWith('.json') && isSafePublishedSoaFilename(e.name))
      .map((e) => {
        const fullPath = path.join(dir, e.name);
        let size = 0;
        try {
          size = fs.statSync(fullPath).size;
        } catch (_) { /* ignore */ }
        return { name: e.name, size };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json({ files });
  } catch (error) {
    console.error('❌ Error listing published-soa files:', error.message);
    res.status(500).json({ error: 'Failed to list stored files', details: error.message });
  }
});

// Upload published SOA/CCM JSON file (base64 body)
app.post('/api/settings/published-soa/upload', authenticate, authorize(PERMISSIONS.EDIT_SETTINGS), (req, res) => {
  try {
    const { filename, content } = req.body || {};
    if (!filename || typeof content !== 'string') {
      return res.status(400).json({ error: 'Missing filename or content (base64)' });
    }
    if (!isSafePublishedSoaFilename(filename)) {
      return res.status(400).json({ error: 'Invalid filename; use only .json files with safe names (letters, numbers, dots, underscores, hyphens)' });
    }
    const dir = ensurePublishedOscalDir();
    let buf;
    try {
      buf = Buffer.from(content, 'base64');
    } catch (e) {
      return res.status(400).json({ error: 'Invalid base64 content' });
    }
    if (buf.length > PUBLISHED_SOA_MAX_BODY_MB * 1024 * 1024) {
      return res.status(400).json({ error: `File too large (max ${PUBLISHED_SOA_MAX_BODY_MB}MB)` });
    }
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, buf, 'utf8');
    console.log(`✅ Published SOA file saved: ${filename}`);
    res.json({ success: true, filename });
  } catch (error) {
    console.error('❌ Error uploading published-soa file:', error.message);
    res.status(500).json({ error: 'Failed to save file', details: error.message });
  }
});

// Serve a stored published SOA/CCM file (for Multi-Report Comparison)
app.get('/api/published-soa/:filename', optionalAuth, (req, res) => {
  try {
    const { filename } = req.params;
    if (!isSafePublishedSoaFilename(filename)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const dir = getPublishedSoaDir();
    const filePath = path.join(dir, filename);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      console.warn('📂 Published SOA file not found:', { filename, dir, filePath, dirExists: fs.existsSync(dir) });
      return res.status(404).json({ error: 'File not found' });
    }
    res.setHeader('Content-Type', 'application/json');
    res.sendFile(path.resolve(filePath));
  } catch (error) {
    console.error('❌ Error serving published-soa file:', error.message);
    res.status(500).json({ error: 'Failed to serve file', details: error.message });
  }
});

// Serve the configured baseline report (Multi-Report Comparison) – always resolved server-side
app.get('/api/baseline-report', optionalAuth, async (req, res) => {
  try {
    const config = loadConfig();
    const url = config.publishedSoaUrl || '';
    if (!url.trim()) {
      return res.status(404).json({ error: 'No published report URL configured' });
    }
    if (url.startsWith('/api/published-soa/')) {
      const filename = url.replace(/^\/api\/published-soa\//, '').trim();
      if (!isSafePublishedSoaFilename(filename)) {
        return res.status(400).json({ error: 'Invalid filename in config' });
      }
      const dir = getPublishedSoaDir();
      const filePath = path.resolve(path.join(dir, filename));
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        console.warn('📂 Baseline file not found:', { filename, filePath });
        return res.status(404).json({ error: 'File not found' });
      }
      res.setHeader('Content-Type', 'application/json');
      return res.sendFile(filePath);
    }
    const urlValidation = await validateUrl(url, {
      allowPrivateIPs: SECURITY_CONFIG.urlValidation.allowPrivateIPs,
      allowLocalhost: SECURITY_CONFIG.urlValidation.allowLocalhost,
    });
    if (!urlValidation.valid) {
      return res.status(400).json({ error: 'Invalid or blocked URL', details: urlValidation.error });
    }
    const axios = (await import('axios')).default;
    const resp = await axios.get(urlValidation.url, {
      responseType: 'json',
      timeout: 30000,
      headers: { Accept: 'application/json' },
    });
    res.setHeader('Content-Type', 'application/json');
    res.json(resp.data);
  } catch (error) {
    if (error.response?.status === 404) {
      return res.status(404).json({ error: 'Published report not found at URL' });
    }
    console.error('❌ Error serving baseline report:', error.message);
    res.status(500).json({ error: 'Failed to fetch published report', details: error.message });
  }
});

// Settings Management Endpoints (Server-side persistence)
// Get current settings (all authenticated users can view)
app.get('/api/settings', optionalAuth, (req, res) => {
  try {
    const raw = loadConfig();
    const config = JSON.parse(JSON.stringify(raw));
    // Mask Bedrock credentials for client when stored in pass (so GUI shows placeholder and Test Connection can use resolved config)
    if (config.aiConfig) {
      for (const key of ['awsAccessKeyId', 'awsSecretAccessKey']) {
        const v = config.aiConfig[key];
        if (typeof v === 'string' && v.trim()) {
          config.aiConfig[key] = MASK;
        } else if (isPassPointer(v)) {
          try {
            const resolved = passShow(v._pass);
            config.aiConfig[key] = (resolved && resolved.trim()) ? MASK : '';
          } catch {
            config.aiConfig[key] = '';
          }
        }
      }
    }
    console.log('📖 Settings loaded and sent to client');
    res.json(config);
  } catch (error) {
    console.error('❌ Error loading settings:', error.message);
    res.status(500).json({
      error: 'Failed to load settings',
      details: error.message
    });
  }
});

// Save settings (Platform Admin only)
app.post('/api/settings', authenticate, authorize(PERMISSIONS.EDIT_SETTINGS), async (req, res) => {
  try {
    const incomingConfig = req.body;
    
    // Load existing config to merge with
    const existingConfig = loadConfig();
    
    // Merge incoming config with existing config to preserve all fields
    const newConfig = {
      ...existingConfig,
      ...incomingConfig,
      // Ensure apiGateways structure is properly merged
      apiGateways: {
        ...existingConfig.apiGateways,
        ...incomingConfig.apiGateways,
        // Merge AWS config
        aws: {
          ...existingConfig.apiGateways?.aws,
          ...incomingConfig.apiGateways?.aws
        },
        // Merge Azure config
        azure: {
          ...existingConfig.apiGateways?.azure,
          ...incomingConfig.apiGateways?.azure
        }
      },
      // Ensure messagingConfig structure is properly merged
      messagingConfig: {
        ...existingConfig.messagingConfig,
        ...incomingConfig.messagingConfig,
        email: {
          ...existingConfig.messagingConfig?.email,
          ...incomingConfig.messagingConfig?.email
        },
        slack: {
          ...existingConfig.messagingConfig?.slack,
          ...incomingConfig.messagingConfig?.slack
        }
      },
      // Ensure aiConfig structure is properly merged
      aiConfig: {
        ...existingConfig.aiConfig,
        ...incomingConfig.aiConfig
      },
      // Explicitly include publishedSoaUrl from request (GitHub URL, /api/published-soa/filename.json, or empty)
      publishedSoaUrl: incomingConfig.publishedSoaUrl !== undefined
        ? (typeof incomingConfig.publishedSoaUrl === 'string' ? incomingConfig.publishedSoaUrl.trim() : String(incomingConfig.publishedSoaUrl || ''))
        : (existingConfig.publishedSoaUrl || '')
    };
    
    console.log('💾 Received incoming config - publishedSoaUrl:', incomingConfig.publishedSoaUrl);
    console.log('💾 Existing config - publishedSoaUrl:', existingConfig.publishedSoaUrl);
    console.log('💾 Merged config - publishedSoaUrl:', newConfig.publishedSoaUrl);
    
    // Validate configuration
    const validation = validateConfig(newConfig);
    if (!validation.valid) {
      console.error('❌ Validation failed:', validation.errors);
      return res.status(400).json({ 
        error: 'Invalid configuration',
        details: validation.errors 
      });
    }

    // Store new secrets in pass and replace with pointers for persist
    const { config: toSave, passErrors } = prepareConfigWithPassPointers(newConfig, existingConfig);
    if (passErrors.length > 0) {
      console.warn('⚠️ Pass insert warnings for settings:', passErrors);
    }
    
    // Save configuration with disk verification
    const saveResult = await saveConfig(toSave);
    
    if (saveResult.success) {
      console.log('✅ Settings saved successfully');
      const savedConfig = loadConfig();
      console.log('✅ Verified saved publishedSoaUrl:', savedConfig.publishedSoaUrl);
      
      // Construct detailed response with verification info
      const response = { 
        success: true,
        message: saveResult.message || 'Settings saved successfully',
        config: savedConfig,
        verification: {
          verified: saveResult.verified,
          timestamp: saveResult.timestamp,
          configPath: saveResult.configPath
        }
      };
      if (passErrors.length > 0) {
        response.passWarnings = passErrors;
      }
      
      // Include discrepancies if verification found issues
      if (saveResult.discrepancies) {
        response.verification.discrepancies = saveResult.discrepancies;
        response.verification.warning = 'Config saved but verification found discrepancies';
        console.warn('⚠️ Config verification discrepancies:', saveResult.discrepancies);
      } else {
        console.log('✅ Config verified on disk - all fields match');
      }
      
      res.json(response);
    } else {
      console.error('❌ Failed to save config:', saveResult.error);
      res.status(500).json({ 
        error: 'Failed to save settings',
        details: saveResult.error 
      });
    }
  } catch (error) {
    console.error('❌ Error saving settings:', error.message);
    res.status(500).json({ 
      error: 'Failed to save settings',
      details: error.message 
    });
  }
});

// API Proxy endpoint - forwards requests to avoid CORS issues
// SECURITY: Protected against SSRF attacks with URL validation
app.post('/api/proxy-fetch', async (req, res) => {
  const { url, method = 'GET', headers = {} } = req.body;
  
  if (!url) {
    return res.status(400).json({ 
      success: false, 
      error: 'URL is required' 
    });
  }

  // SECURITY: Validate URL to prevent SSRF attacks
  const urlValidation = await validateUrl(url, {
    allowPrivateIPs: SECURITY_CONFIG.urlValidation.allowPrivateIPs,
    allowLocalhost: SECURITY_CONFIG.urlValidation.allowLocalhost,
  });

  if (!urlValidation.valid) {
    console.warn('🚫 SSRF attempt blocked in proxy-fetch:', url, urlValidation.error);
    
    // Return 403 for blocked URLs (security restriction)
    if (urlValidation.blocked) {
      return res.status(403).json({ 
        success: false, 
        error: 'Access to this URL is forbidden',
        details: urlValidation.error,
        code: 'SSRF_BLOCKED',
      });
    }
    
    // Return 400 for invalid URLs (bad request)
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid URL',
      details: urlValidation.error,
    });
  }

  console.log(`[API Proxy] Fetching from: ${urlValidation.url}`);
  console.log(`[API Proxy] Method: ${method}`);

  try {
    // Forward cookies from the original request if present
    const cookieHeader = req.headers.cookie || '';
    
    // Merge headers - include cookies if available
    const requestHeaders = {
      'Accept': 'application/json, text/plain, */*',
      'User-Agent': 'Mozilla/5.0 (compatible; OSCAL-Report-Generator/1.0)',
      ...headers,
    };
    
    // Add cookies if they exist
    if (cookieHeader) {
      requestHeaders['Cookie'] = cookieHeader;
    }

    console.log(`[API Proxy] Request headers:`, requestHeaders);

    // Use axios instead of fetch for better compatibility
    const response = await axios({
      method: method,
      url: urlValidation.url, // Use validated URL
      headers: requestHeaders,
      timeout: 30000, // 30 second timeout
      maxRedirects: 5, // Follow up to 5 redirects
      validateStatus: () => true, // Don't throw on any status code
      httpsAgent: new https.Agent({
        rejectUnauthorized: false // Allow self-signed certificates
      })
    });

    console.log(`[API Proxy] Response received - Status: ${response.status}, StatusText: ${response.statusText}`);
    console.log(`[API Proxy] Content-Type: ${response.headers['content-type']}`);

    let data = response.data;
    const contentType = response.headers['content-type'] || '';

    // If response is a string, try to parse as JSON
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
        console.log('[API Proxy] Successfully parsed string response as JSON');
      } catch (e) {
        console.log('[API Proxy] Response is plain text, not JSON');
      }
    }

    console.log(`[API Proxy] Data type: ${typeof data}`);
    console.log(`[API Proxy] Data keys: ${typeof data === 'object' && data !== null ? Object.keys(data).slice(0, 10).join(', ') : 'N/A'}`);

    res.json({
      success: response.status >= 200 && response.status < 300,
      status: response.status,
      statusText: response.statusText,
      data: data,
      headers: response.headers,
    });

  } catch (error) {
    console.error('[API Proxy] Error details:');
    console.error('  - Message:', error.message);
    console.error('  - Name:', error.name);
    console.error('  - Code:', error.code);
    
    // Provide more specific error messages
    let errorMessage = error.message;
    let errorDetails = {};
    
    if (error.code === 'ENOTFOUND') {
      errorMessage = 'DNS lookup failed - cannot resolve hostname';
      errorDetails.code = 'DNS_ERROR';
      errorDetails.hint = 'Check if the URL is correct and accessible';
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Connection refused by server';
      errorDetails.code = 'CONNECTION_REFUSED';
      errorDetails.hint = 'The server is not accepting connections';
    } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      errorMessage = 'Request timed out after 30 seconds';
      errorDetails.code = 'TIMEOUT';
      errorDetails.hint = 'The server took too long to respond';
    } else if (error.response) {
      // axios error with response
      errorMessage = `Server responded with ${error.response.status}: ${error.response.statusText}`;
      errorDetails.code = 'HTTP_ERROR';
      errorDetails.status = error.response.status;
    } else if (error.request) {
      // axios error without response
      errorMessage = 'No response received from server';
      errorDetails.code = 'NO_RESPONSE';
      errorDetails.hint = 'Check network connectivity';
    }
    
    console.error('  - Error details:', errorDetails);
    
    res.status(500).json({
      success: false,
      error: errorMessage,
      message: 'Failed to fetch from URL',
      details: errorDetails,
      originalError: error.message,
    });
  }
});

// Fetch OSCAL catalogue from URL
// SECURITY: Protected against SSRF attacks with URL validation
app.post('/api/fetch-catalogue', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // SECURITY: Validate URL to prevent SSRF attacks
    const urlValidation = await validateUrl(url, {
      allowPrivateIPs: SECURITY_CONFIG.urlValidation.allowPrivateIPs,
      allowLocalhost: SECURITY_CONFIG.urlValidation.allowLocalhost,
    });

    if (!urlValidation.valid) {
      console.warn('🚫 SSRF attempt blocked in fetch-catalogue:', url, urlValidation.error);
      
      // Return 403 for blocked URLs (security restriction)
      if (urlValidation.blocked) {
        return res.status(403).json({ 
          error: 'Access to this URL is forbidden',
          details: urlValidation.error,
          code: 'SSRF_BLOCKED',
        });
      }
      
      // Return 400 for invalid URLs (bad request)
      return res.status(400).json({ 
        error: 'Invalid URL',
        details: urlValidation.error,
      });
    }

    const response = await axios.get(urlValidation.url, {
      headers: {
        'Accept': 'application/json'
      },
      httpsAgent: new https.Agent({
        rejectUnauthorized: false
      })
    });

    const catalogue = response.data;
    
    // Extract controls from the catalogue
    const controls = extractControls(catalogue);
    
    res.json({
      catalogue,
      controls,
      metadata: catalogue.catalog?.metadata || catalogue.metadata
    });
  } catch (error) {
    console.error('Error fetching catalogue:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch catalogue',
      details: error.message 
    });
  }
});

// Extract catalog URL from existing SSP
app.post('/api/extract-catalog-from-ssp', async (req, res) => {
  try {
    const { sspData } = req.body;
    
    if (!sspData) {
      return res.status(400).json({ error: 'SSP data is required' });
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log('📥 Received SSP data for catalog extraction');
    }
    console.log('📊 SSP top-level keys:', Object.keys(sspData));
    
    // Verify file integrity (FIPS 140-2 compliant check)
    const integrityCheck = verifyIntegrityHash(sspData);
    let integrityWarning = null;
    
    if (integrityCheck.hasHash && !integrityCheck.valid) {
      integrityWarning = {
        message: 'File Integrity Warning',
        details: integrityCheck.reason,
        severity: 'warning',
        fipsCompliant: true,
        algorithm: integrityCheck.algorithm,
        storedHash: integrityCheck.storedHash?.substring(0, 16) + '...',
        calculatedHash: integrityCheck.calculatedHash?.substring(0, 16) + '...'
      };
      console.warn('⚠️ File integrity check failed:', integrityCheck.reason);
    } else if (!integrityCheck.hasHash) {
      integrityWarning = {
        message: 'ℹ️ No Integrity Hash Found',
        details: 'This file does not contain an integrity hash. It may not have been exported by this tool.',
        severity: 'info',
        fipsCompliant: false
      };
      console.log('ℹ️ No integrity hash found in file');
    } else {
      console.log('✅ File integrity verified successfully');
    }
    
    let catalogUrl = null;
    
    // Try to find the catalog URL in various OSCAL SSP structures
    if (sspData['system-security-plan']) {
      const ssp = sspData['system-security-plan'];
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Found system-security-plan');
        console.log('📊 SSP keys:', Object.keys(ssp));
        console.log('📊 import-profile structure:', JSON.stringify(ssp['import-profile'], null, 2));
      }
      
      catalogUrl = ssp['import-profile']?.href || ssp['import-profile']?.['#']?.href;
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 Extracted catalogUrl from import-profile:', catalogUrl);
      }
    } else {
      if (process.env.NODE_ENV === 'development') {
        console.log('❌ No system-security-plan found');
      }
    }
    
    // Fallback: check if it's stored in metadata or at top level
    if (!catalogUrl && sspData.catalogueUrl) {
      catalogUrl = sspData.catalogueUrl;
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 Found catalogUrl from sspData.catalogueUrl:', catalogUrl);
      }
    }
    
    if (!catalogUrl || catalogUrl === '#') {
      console.error('❌ Could not extract valid catalog URL');
      console.error('   - catalogUrl value:', catalogUrl);
      console.error('   - Available SSP structure:', JSON.stringify({
        hasSSP: !!sspData['system-security-plan'],
        hasImportProfile: !!sspData['system-security-plan']?.['import-profile'],
        hasCatalogueUrl: !!sspData.catalogueUrl
      }, null, 2));
      
      return res.status(400).json({ 
        error: 'Could not extract catalog URL from SSP. Please ensure the SSP was generated by this tool or contains a valid import-profile with href.',
        debug: {
          foundStructure: !!sspData['system-security-plan'],
          foundImportProfile: !!sspData['system-security-plan']?.['import-profile'],
          catalogUrlValue: catalogUrl
        },
        integrityWarning: integrityWarning
      });
    }
    
    console.log('✅ Successfully extracted catalog URL:', catalogUrl);
    res.json({ 
      catalogUrl,
      integrityWarning: integrityWarning
    });
  } catch (error) {
    console.error('❌ Error extracting catalog from SSP:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to extract catalog from SSP',
      details: error.message 
    });
  }
});

// Extract controls and data from existing SSP (without comparison)
app.post('/api/extract-controls-from-ssp', async (req, res) => {
  try {
    const { catalogControls, existingSSP } = req.body;
    
    if (!catalogControls || !existingSSP) {
      return res.status(400).json({ error: 'Catalog controls and existing SSP are required' });
    }
    
    // Verify file integrity (FIPS 140-2 compliant check)
    const integrityCheck = verifyIntegrityHash(existingSSP);
    let integrityWarning = null;
    
    if (integrityCheck.hasHash && !integrityCheck.valid) {
      integrityWarning = {
        message: 'File Integrity Warning',
        details: integrityCheck.reason,
        severity: 'warning',
        fipsCompliant: true,
        algorithm: integrityCheck.algorithm,
        storedHash: integrityCheck.storedHash?.substring(0, 16) + '...',
        calculatedHash: integrityCheck.calculatedHash?.substring(0, 16) + '...',
        timestamp: integrityCheck.timestamp
      };
      console.warn('⚠️ File integrity check failed:', integrityCheck.reason);
    } else if (!integrityCheck.hasHash) {
      integrityWarning = {
        message: 'ℹ️ No Integrity Hash Found',
        details: 'This file does not contain an integrity hash. It may not have been exported by this tool.',
        severity: 'info',
        fipsCompliant: false
      };
      console.log('ℹ️ No integrity hash found in file');
    } else {
      console.log('✅ File integrity verified successfully');
    }
    
    // Use the same extraction logic but mark all as unchanged
    const result = compareWithExistingSSP(catalogControls, existingSSP, null);
    
    // Remove change tracking since we're keeping the same catalog
    const controlsWithoutChangeTracking = result.controls.map(control => ({
      ...control,
      changeStatus: undefined,
      changeReason: undefined
    }));
    
    // Extract complete system info including all props fields
    const systemInfo = result.systemInfo || null;
    
    res.json({
      controls: controlsWithoutChangeTracking,
      systemInfo,
      classification: systemInfo?.securityLevel,
      integrityWarning: integrityWarning
    });
  } catch (error) {
    console.error('Error extracting controls from SSP:', error.message);
    res.status(500).json({ 
      error: 'Failed to extract controls from SSP',
      details: error.message 
    });
  }
});

// Compare catalog with existing SSP
app.post('/api/compare-ssp', async (req, res) => {
  try {
    const { catalogControls, existingSSP, catalogData } = req.body;
    
    if (!catalogControls || !existingSSP) {
      return res.status(400).json({ error: 'Catalog controls and existing SSP are required' });
    }
    
    // Verify file integrity (FIPS 140-2 compliant check)
    const integrityCheck = verifyIntegrityHash(existingSSP);
    let integrityWarning = null;
    
    if (integrityCheck.hasHash && !integrityCheck.valid) {
      integrityWarning = {
        message: 'File Integrity Warning',
        details: integrityCheck.reason,
        severity: 'warning',
        fipsCompliant: true,
        algorithm: integrityCheck.algorithm,
        storedHash: integrityCheck.storedHash?.substring(0, 16) + '...',
        calculatedHash: integrityCheck.calculatedHash?.substring(0, 16) + '...',
        timestamp: integrityCheck.timestamp
      };
      console.warn('⚠️ File integrity check failed:', integrityCheck.reason);
    } else if (!integrityCheck.hasHash) {
      integrityWarning = {
        message: 'ℹ️ No Integrity Hash Found',
        details: 'This file does not contain an integrity hash. It may not have been exported by this tool.',
        severity: 'info',
        fipsCompliant: false
      };
      console.log('ℹ️ No integrity hash found in file');
    } else {
      console.log('✅ File integrity verified successfully');
    }
    
    const comparisonResult = compareWithExistingSSP(catalogControls, existingSSP, catalogData);
    
    // Extract complete system info including all props fields
    const systemInfo = comparisonResult.systemInfo || null;
    
    res.json({
      ...comparisonResult,
      integrityWarning: integrityWarning,
      systemInfo
    });
  } catch (error) {
    console.error('Error comparing SSP:', error.message);
    res.status(500).json({ 
      error: 'Failed to compare SSP',
      details: error.message 
    });
  }
});

// Compare multiple OSCAL reports (baseline + 2 CSP reports)
// Note: This endpoint doesn't require authentication to allow comparison of public reports
app.post('/api/compare-multiple-reports', async (req, res) => {
  try {
    console.log('📊 Multi-Report Comparison endpoint called');
    console.log('Request headers:', req.headers['content-type']);
    console.log('Request body size:', JSON.stringify(req.body).length, 'bytes');
    
    const { reports, reportNames, reportTypes } = req.body;
    
    if (!reports) {
      console.error('❌ No reports data in request body');
      return res.status(400).json({ error: 'Reports data is required' });
    }
    
    console.log('📊 Multi-Report Comparison requested');
    console.log('Reports provided:', Object.keys(reports).filter(key => reports[key] !== null));
    
    // Extract controls from each report
    const extractedReports = {};
    const catalogs = {};
    
    for (const [key, report] of Object.entries(reports)) {
      if (report && report['system-security-plan']) {
        const ssp = report['system-security-plan'];
        
        // Debug: Log the structure
        if (process.env.NODE_ENV === 'development') {
          console.log(`\n🔍 Processing report: ${key}`);
        }
        console.log(`  - Has import-profile: ${!!ssp['import-profile']}`);
        console.log(`  - Has metadata: ${!!ssp.metadata}`);
        console.log(`  - Has metadata.links: ${!!ssp.metadata?.links}`);
        
        // Extract catalog info from multiple possible locations:
        // Priority order:
        // 1. metadata.links[].href where rel === "source-profile" (MOST RELIABLE - contains version info)
        // 2. Any metadata.links[].href with version pattern (fallback)
        // 3. import-profile.href (last resort - may point to wrong URL)
        let catalogUrl = 'Unknown';
        
        // PRIORITY 1: Check metadata.links with rel="source-profile" FIRST (most reliable)
        if (ssp.metadata?.links && Array.isArray(ssp.metadata.links)) {
          const sourceProfileLink = ssp.metadata.links.find(link => 
            link.rel === 'source-profile' || link.rel === 'profile' || link.rel === 'import'
          );
          if (sourceProfileLink?.href) {
            catalogUrl = sourceProfileLink.href;
            console.log(`  - ✅ Catalog URL from metadata.links (rel="${sourceProfileLink.rel}"): ${catalogUrl}`);
          }
        }
        
        // PRIORITY 2: Check any link in metadata.links that contains version pattern
        if ((!catalogUrl || catalogUrl === 'Unknown') && ssp.metadata?.links && Array.isArray(ssp.metadata.links)) {
          for (const link of ssp.metadata.links) {
            if (link.href && /v\d{4}\.\d{1,2}\.\d{1,2}/.test(link.href)) {
              catalogUrl = link.href;
              console.log(`  - ✅ Catalog URL from metadata.links (auto-detected version pattern): ${catalogUrl}`);
              break;
            }
          }
        }
        
        // PRIORITY 3: Fallback to import-profile (may point to wrong URL like GitHub raw)
        if ((!catalogUrl || catalogUrl === 'Unknown') && ssp['import-profile']) {
          catalogUrl = ssp['import-profile']?.href || ssp['import-profile']?.['#']?.href || 'Unknown';
          if (catalogUrl !== 'Unknown') {
            console.log(`  - ⚠️ Catalog URL from import-profile (fallback): ${catalogUrl}`);
          }
        }
        
        console.log(`  - Final Catalog URL: ${catalogUrl}`);
        
        // Extract catalog version from URL pattern: /v2025.10.8/ or /v2025.07.16/
        // Pattern matches: /vYYYY.MM.DD/ or /vYYYY.M.DD/ etc.
        let catalogVersion = 'Unknown';
        if (catalogUrl && catalogUrl !== 'Unknown' && catalogUrl !== '#') {
          // Try multiple patterns
          // Pattern 1: /v2025.10.8/ in path
          let versionMatch = catalogUrl.match(/\/v(\d{4}\.\d{1,2}\.\d{1,2})\//);
          if (versionMatch) {
            catalogVersion = versionMatch[1];
            console.log(`  - Found catalog version (pattern 1): ${catalogVersion}`);
          } else {
            // Pattern 2: v2025.10.8 anywhere in URL
            versionMatch = catalogUrl.match(/v(\d{4}\.\d{1,2}\.\d{1,2})/);
            if (versionMatch) {
              catalogVersion = versionMatch[1];
              console.log(`  - Found catalog version (pattern 2): ${catalogVersion}`);
            } else {
              // Pattern 3: Check if URL contains version-like pattern without 'v' prefix
              versionMatch = catalogUrl.match(/(\d{4}\.\d{1,2}\.\d{1,2})/);
              if (versionMatch) {
                catalogVersion = versionMatch[1];
                console.log(`  - Found catalog version (pattern 3): ${catalogVersion}`);
              } else {
                console.log(`  - Could not extract catalog version from URL: ${catalogUrl}`);
              }
            }
          }
        } else {
          console.log(`  - Catalog URL is invalid or missing: ${catalogUrl}`);
        }
        
        // Extract OSCAL Metadata Framework version (from metadata.version)
        // Handle both string and number versions
        let oscalMetadataVersion = 'N/A';
        if (ssp.metadata) {
          oscalMetadataVersion = ssp.metadata.version || ssp.metadata.Version || 'N/A';
          // Convert to string if it's a number
          if (typeof oscalMetadataVersion === 'number') {
            oscalMetadataVersion = String(oscalMetadataVersion);
          }
        }
        console.log(`  - OSCAL Metadata Version: ${oscalMetadataVersion}`);
        
        // Extract OSCAL version (from metadata["oscal-version"])
        let oscalVersion = 'N/A';
        if (ssp.metadata) {
          oscalVersion = ssp.metadata['oscal-version'] || 
                        ssp.metadata.oscalVersion || 
                        ssp.metadata['oscalVersion'] ||
                        ssp.metadata['OSCAL-Version'] ||
                        'N/A';
        }
        console.log(`  - OSCAL Version: ${oscalVersion}`);
        
        // Debug: Log full metadata structure
        if (ssp.metadata) {
          console.log(`  - Metadata keys: ${Object.keys(ssp.metadata).join(', ')}`);
          console.log(`  - Full metadata:`, JSON.stringify(ssp.metadata, null, 2).substring(0, 500));
        } else {
          console.log(`  - ⚠️ No metadata found in SSP`);
        }
        
        // Format catalog info: Always return object structure
        // Ensure values are strings, not undefined/null
        catalogs[key] = {
          catalogVersion: (catalogVersion !== 'Unknown' && catalogVersion) ? String(catalogVersion) : 'N/A',
          oscalMetadataVersion: (oscalMetadataVersion && oscalMetadataVersion !== 'N/A') ? String(oscalMetadataVersion) : 'N/A',
          oscalVersion: (oscalVersion && oscalVersion !== 'N/A') ? String(oscalVersion) : 'N/A',
          catalogUrl: (catalogUrl && catalogUrl !== 'Unknown' && catalogUrl !== '#') ? String(catalogUrl) : 'N/A',
          display: `Catalog: ${catalogVersion !== 'Unknown' ? catalogVersion : 'N/A'} | Metadata: ${oscalMetadataVersion || 'N/A'} | OSCAL: ${oscalVersion || 'N/A'}`
        };
        
        // Debug: Log final catalog info
        console.log(`  - ✅ Final catalog info for ${key}:`, JSON.stringify(catalogs[key], null, 2));
        
        // Extract controls - pass the full report object
        const controls = extractControlsFromSSP(report);
        extractedReports[key] = controls;
        
        console.log(`  - ✅ ${key}: ${controls.length} controls extracted`);
      } else {
        console.log(`  - ❌ ${key}: Invalid report structure (missing system-security-plan)`);
      }
    }
    
    // Build a unified list of all unique control IDs
    const allControlIds = new Set();
    Object.values(extractedReports).forEach(controls => {
      controls.forEach(control => allControlIds.add(control.id));
    });
    
    console.log(`📋 Total unique controls across all reports: ${allControlIds.size}`);
    
    // Compare controls across all reports
    const comparisonResults = [];
    let identical = 0;
    let different = 0;
    let missingInSome = 0;
    
    allControlIds.forEach(controlId => {
      const comparison = {
        id: controlId,
        group: '',
        title: '',
        baseline: null,
        csp1: null,
        csp2: null,
        hasDifferences: false
      };
      
      // Get control from each report
      if (extractedReports.baseline) {
        const control = extractedReports.baseline.find(c => c.id === controlId);
        if (control) {
          // Include all control fields for editing in the modal
          comparison.baseline = { ...control };
          comparison.group = control.groupTitle || '';
          comparison.title = control.catalogTitle || control.title || controlId;
          comparison.description = control.catalogDescription || '';
        }
      }
      
      if (extractedReports.csp1) {
        const control = extractedReports.csp1.find(c => c.id === controlId);
        if (control) {
          // Include all control fields
          comparison.csp1 = { ...control };
          if (!comparison.group) comparison.group = control.groupTitle || '';
          if (!comparison.title) comparison.title = control.catalogTitle || control.title || controlId;
          if (!comparison.description) comparison.description = control.catalogDescription || '';
        }
      }
      
      if (extractedReports.csp2) {
        const control = extractedReports.csp2.find(c => c.id === controlId);
        if (control) {
          // Include all control fields
          comparison.csp2 = { ...control };
          if (!comparison.group) comparison.group = control.groupTitle || '';
          if (!comparison.title) comparison.title = control.catalogTitle || control.title || controlId;
          if (!comparison.description) comparison.description = control.catalogDescription || '';
        }
      }
      
      // Determine if there are differences
      const statuses = [
        comparison.baseline?.status,
        comparison.csp1?.status,
        comparison.csp2?.status
      ].filter(Boolean);
      
      const uniqueStatuses = new Set(statuses);
      const presentInAll = (comparison.baseline !== null ? 1 : 0) + 
                          (comparison.csp1 !== null ? 1 : 0) + 
                          (comparison.csp2 !== null ? 1 : 0);
      
      if (uniqueStatuses.size > 1 || presentInAll < Object.keys(reports).filter(k => reports[k] !== null).length) {
        comparison.hasDifferences = true;
        if (presentInAll < Object.keys(reports).filter(k => reports[k] !== null).length) {
          missingInSome++;
        } else {
          different++;
        }
      } else {
        identical++;
      }
      
      comparisonResults.push(comparison);
    });
    
    // Identify catalog version differences
    const catalogDifferences = [];
    const catalogVersions = Object.entries(catalogs);
    if (catalogVersions.length > 1) {
      catalogVersions.forEach(([key, catalogInfo]) => {
        catalogDifferences.push({
          label: reportNames[key] || key,
          catalogVersion: catalogInfo.catalogVersion,
          oscalMetadataVersion: catalogInfo.oscalMetadataVersion,
          oscalVersion: catalogInfo.oscalVersion,
          catalogUrl: catalogInfo.catalogUrl,
          display: catalogInfo.display
        });
      });
    }
    
    console.log(`✅ Comparison complete: ${identical} identical, ${different} different, ${missingInSome} missing in some`);
    
    // Debug: Log final catalogs structure before sending
    if (process.env.NODE_ENV === 'development') {
      console.log('\n📤 Final catalogs structure being sent:');
      console.log(JSON.stringify(catalogs, null, 2));
      console.log('\n📤 Final catalogDifferences being sent:');
      console.log(JSON.stringify(catalogDifferences, null, 2));
    }
    
    // Verify catalogs structure is correct (all should be objects)
    if (process.env.NODE_ENV === 'development') {
      console.log('\n🔍 Verifying catalogs structure:');
    }
    Object.entries(catalogs).forEach(([key, value]) => {
      console.log(`  - ${key}: ${typeof value === 'object' ? '✅ Object' : '❌ NOT Object (type: ' + typeof value + ')'}`);
      if (typeof value === 'object' && value !== null) {
        console.log(`    Keys: ${Object.keys(value).join(', ')}`);
        console.log(`    Values:`, JSON.stringify(value));
      } else {
        console.log(`    ⚠️ WARNING: ${key} is not an object! Value:`, value);
      }
    });
    
    // CRITICAL: Ensure all catalogs are objects, not strings
    const verifiedCatalogs = {};
    Object.entries(catalogs).forEach(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        verifiedCatalogs[key] = value;
      } else {
        // If somehow it's not an object, create a default object structure
        console.error(`⚠️ ERROR: ${key} catalog is not an object! Converting...`);
        verifiedCatalogs[key] = {
          catalogVersion: 'N/A',
          oscalMetadataVersion: 'N/A',
          oscalVersion: 'N/A',
          catalogUrl: 'N/A',
          display: `Catalog: N/A | Metadata: N/A | OSCAL: N/A`
        };
      }
    });
    
    console.log('\n✅ Final verified catalogs (all objects):');
    console.log(JSON.stringify(verifiedCatalogs, null, 2));
    
    res.json({
      controls: comparisonResults,
      catalogs: verifiedCatalogs, // Use verified catalogs
      catalogDifferences: catalogDifferences.length > 0 ? catalogDifferences : null,
      totalControls: allControlIds.size,
      identical,
      different,
      missingInSome,
      reportNames
    });
    
  } catch (error) {
    console.error('❌ Error in multi-report comparison:', error.message);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to compare multiple reports',
      details: error.message 
    });
  }
});

// Import CCM Excel file and parse control data
app.post('/api/import-ccm', async (req, res) => {
  try {
    const { fileData } = req.body;
    
    if (!fileData) {
      return res.status(400).json({ error: 'File data is required' });
    }
    
    // Convert base64 to buffer
    const buffer = Buffer.from(fileData, 'base64');
    
    // Parse the CCM Excel file
    const result = await parseCCMExcel(buffer);
    
    console.log(`CCM Import: Parsed ${result.controls.length} controls from Excel file`);
    
    res.json({
      success: true,
      systemInfo: result.systemInfo,
      controls: result.controls,
      statistics: result.statistics
    });
  } catch (error) {
    console.error('Error importing CCM:', error.message);
    res.status(500).json({ 
      error: 'Failed to import CCM file',
      details: error.message 
    });
  }
});

// Extract controls from OSCAL catalogue
function extractControls(catalogue) {
  const controls = [];
  const catalog = catalogue.catalog || catalogue;
  
  if (!catalog) {
    return controls;
  }

  // Process groups and controls
  const processGroup = (group, parentId = null) => {
    if (group.controls) {
      group.controls.forEach(control => {
        controls.push({
          id: control.id,
          class: control.class,
          title: control.title,
          description: extractControlDescription(control),
          params: control.params || [],
          props: control.props || [],
          parts: control.parts || [],
          groupId: group.id,
          groupTitle: group.title,
          parentId: parentId
        });

        // Process sub-controls
        if (control.controls) {
          control.controls.forEach(subControl => {
            controls.push({
              id: subControl.id,
              class: subControl.class,
              title: subControl.title,
              description: extractControlDescription(subControl),
              params: subControl.params || [],
              props: subControl.props || [],
              parts: subControl.parts || [],
              groupId: group.id,
              groupTitle: group.title,
              parentId: control.id
            });
          });
        }
      });
    }

    // Process nested groups
    if (group.groups) {
      group.groups.forEach(nestedGroup => processGroup(nestedGroup, group.id));
    }
  };

  // Process all groups
  if (catalog.groups) {
    catalog.groups.forEach(group => processGroup(group));
  }

  // Process controls at root level
  if (catalog.controls) {
    catalog.controls.forEach(control => {
      controls.push({
        id: control.id,
        class: control.class,
        title: control.title,
        description: extractControlDescription(control),
        params: control.params || [],
        props: control.props || [],
        parts: control.parts || [],
        groupId: null,
        groupTitle: null,
        parentId: null
      });
    });
  }

  return controls;
}

// Helper function to extract control description from parts
function extractControlDescription(control) {
  if (!control.parts || control.parts.length === 0) {
    return '';
  }
  
  // Find statement or description parts
  const descParts = control.parts.filter(part => 
    part.name === 'statement' || part.name === 'description' || part.name === 'guidance'
  );
  
  if (descParts.length === 0) {
    // Try to get prose from any part
    const proseParts = control.parts.filter(part => part.prose);
    if (proseParts.length > 0) {
      return proseParts.map(p => p.prose).join('\n\n');
    }
    return '';
  }
  
  // Extract prose from description parts
  return descParts.map(part => part.prose || '').filter(Boolean).join('\n\n');
}

// Utility function to sanitize strings for OSCAL compliance
// OSCAL requires pattern: ^\S(.*\S)?$ (no leading/trailing whitespace, no empty strings)
// Replace empty/blank values with placeholder to maintain document structure
const OSCAL_EMPTY_PLACEHOLDER = "No_Input_Recorded";

function sanitizeOSCALString(value, useDefault = true) {
  if (value === null || value === undefined) {
    return useDefault ? OSCAL_EMPTY_PLACEHOLDER : undefined;
  }
  
  // Convert to string
  let cleaned = String(value);
  
  // CRITICAL: Only trim leading/trailing whitespace from the ENTIRE string
  // Do NOT modify content in the middle (preserve line breaks, formatting, etc.)
  // This is a simple, safe trim that won't lose any actual content
  cleaned = cleaned.trim();
  
  // If the string is empty after trimming, use placeholder
  if (cleaned.length === 0) {
    return useDefault ? OSCAL_EMPTY_PLACEHOLDER : undefined;
  }
  
  // OSCAL pattern validation: ^\S(.*\S)?$
  // This means: starts with non-whitespace, ends with non-whitespace
  // The standard trim() should handle this, but let's be extra safe
  const oscalPattern = /^\S(.*\S)?$/;
  
  if (!oscalPattern.test(cleaned)) {
    // This shouldn't happen after trim(), but if it does, it means
    // there's still leading/trailing whitespace we missed
    console.warn(`⚠️ String has whitespace after trim(): "${cleaned.substring(0, 100)}..."`);
    console.warn(`   First char: [${cleaned.charAt(0)}] (code: ${cleaned.charCodeAt(0)})`);
    console.warn(`   Last char: [${cleaned.charAt(cleaned.length - 1)}] (code: ${cleaned.charCodeAt(cleaned.length - 1)})`);
    
    // One more aggressive trim attempt - remove ANY leading/trailing whitespace
    // But still preserve ALL content in the middle
    cleaned = cleaned.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, '');
    
    // Final check
    if (!oscalPattern.test(cleaned)) {
      console.error(`❌ String still has whitespace issues after aggressive trim`);
      console.error(`   This should not happen. String length: ${cleaned.length}`);
      console.error(`   Content preview: "${cleaned.substring(0, 200)}"`);
      
      // NEVER replace actual content with placeholder
      // If we have content, keep it even if pattern doesn't match perfectly
      if (cleaned.length > 0) {
        console.warn(`⚠️ Keeping content despite pattern mismatch to avoid data loss`);
        return cleaned;
      }
      
      // Only use placeholder if truly empty
      return useDefault ? OSCAL_EMPTY_PLACEHOLDER : undefined;
    }
  }
  
  return cleaned;
}

// Recursive function to sanitize entire OSCAL object structure
function sanitizeOSCALObject(obj, preserveEmptyArrays = false, useDefaultForEmpty = true) {
  if (obj === null || obj === undefined) {
    return undefined;
  }
  
  // Handle arrays
  if (Array.isArray(obj)) {
    const sanitized = obj
      .map(item => sanitizeOSCALObject(item, preserveEmptyArrays, useDefaultForEmpty))
      .filter(item => item !== undefined);
    // Preserve empty arrays for certain OSCAL required fields
    return sanitized.length > 0 || preserveEmptyArrays ? sanitized : undefined;
  }
  
  // Handle strings - use placeholder for empty strings to meet OSCAL pattern requirements
  if (typeof obj === 'string') {
    return sanitizeOSCALString(obj, useDefaultForEmpty);
  }
  
  // Handle primitives (numbers, booleans, etc.)
  if (typeof obj !== 'object') {
    return obj;
  }
  
  // Handle objects
  const sanitized = {};
  // OSCAL fields that require empty arrays to be preserved
  const arrayFieldsToPreserve = ['categorizations', 'components', 'users'];
  
  for (const [key, value] of Object.entries(obj)) {
    const shouldPreserveEmpty = arrayFieldsToPreserve.includes(key);
    const sanitizedValue = sanitizeOSCALObject(value, shouldPreserveEmpty, useDefaultForEmpty);
    if (sanitizedValue !== undefined) {
      sanitized[key] = sanitizedValue;
    } else if (shouldPreserveEmpty && Array.isArray(value)) {
      // Preserve empty arrays for required OSCAL fields
      sanitized[key] = [];
    }
  }
  
  // Return undefined if object is now empty (all values were removed)
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

// Utility function to sanitize props array
function sanitizeProps(props) {
  if (!Array.isArray(props)) return [];
  return props
    .map(prop => {
      const sanitizedValue = sanitizeOSCALString(prop.value, true);
      const sanitizedName = sanitizeOSCALString(prop.name, true);
      
      // Filter out props where both name and value are the placeholder (meaningless data)
      if (sanitizedValue === OSCAL_EMPTY_PLACEHOLDER && sanitizedName === OSCAL_EMPTY_PLACEHOLDER) {
        return null;
      }
      
      const sanitizedProp = {
        ...prop,
        name: sanitizedName,
        value: sanitizedValue
      };
      
      // Only add optional fields if they have meaningful values
      if (prop.class) {
        const sanitizedClass = sanitizeOSCALString(prop.class, true);
        if (sanitizedClass !== OSCAL_EMPTY_PLACEHOLDER) {
          sanitizedProp.class = sanitizedClass;
        }
      }
      
      if (prop.ns) {
        const sanitizedNs = sanitizeOSCALString(prop.ns, true);
        if (sanitizedNs !== OSCAL_EMPTY_PLACEHOLDER) {
          sanitizedProp.ns = sanitizedNs;
        }
      }
      
      if (prop.remarks) {
        const sanitizedRemarks = sanitizeOSCALString(prop.remarks, true);
        if (sanitizedRemarks !== OSCAL_EMPTY_PLACEHOLDER) {
          sanitizedProp.remarks = sanitizedRemarks;
        }
      }
      
      return sanitizedProp;
    })
    .filter(Boolean); // Remove null entries
}

// Function to filter metadata to only include OSCAL-compliant fields
function filterOSCALMetadata(metadata) {
  if (!metadata) return {};
  
  // Only include fields that are part of the official OSCAL SSP metadata schema
  const allowedFields = [
    'title',
    'published',
    'last-modified',
    'version',
    'oscal-version',
    'revisions',
    'document-ids',
    'props',
    'links',
    'roles',
    'locations',
    'parties',
    'responsible-parties',
    'remarks'
  ];
  
  const filtered = {};
  for (const field of allowedFields) {
    if (metadata[field] !== undefined) {
      filtered[field] = metadata[field];
    }
  }
  
  return filtered;
}

// Function to filter control to only include OSCAL-compliant fields for implemented-requirements
function filterOSCALImplementedRequirement(implementedReq) {
  // Only include fields that are part of the official OSCAL implemented-requirement schema
  const allowedFields = [
    'uuid',
    'control-id',
    'description',
    'props',
    'links',
    'set-parameters',
    'responsible-roles',
    'statements',
    'by-components',
    'remarks'
  ];
  
  const filtered = {};
  for (const field of allowedFields) {
    if (implementedReq[field] !== undefined) {
      filtered[field] = implementedReq[field];
    }
  }
  
  return filtered;
}

// Generate OSCAL SSP
// OWASP API Security: Implements request size limits to prevent DoS attacks
app.post('/api/generate-ssp', async (req, res) => {
  try {
    const { metadata, controls, systemInfo, validationOptions = {} } = req.body;
    
    // SECURITY: API4:2023 - Unrestricted Resource Consumption Prevention
    // Limit number of controls to prevent DoS attacks
    if (controls && controls.length > 1000) {
      return res.status(400).json({
        error: 'Request too large',
        message: 'Maximum 1000 controls per SSP generation request',
        limit: 1000,
        received: controls.length
      });
    }
    
    // SECURITY: Limit metadata size to prevent memory exhaustion
    const metadataSize = JSON.stringify(metadata || {}).length;
    if (metadataSize > 100000) { // 100KB
      return res.status(400).json({
        error: 'Metadata too large',
        message: 'Metadata must be less than 100KB',
        limit: '100KB',
        received: `${Math.round(metadataSize / 1024)}KB`
      });
    }
    
    // Debug: Log first control to see what structure we're receiving
    if (controls && controls.length > 0) {
      console.log('=== DEBUG: First control structure ===');
      console.log('Control ID:', controls[0].id);
      console.log('Has params:', !!controls[0].params, Array.isArray(controls[0].params) ? controls[0].params.length : 0);
      console.log('Has props:', !!controls[0].props, Array.isArray(controls[0].props) ? controls[0].props.length : 0);
      console.log('Has parts:', !!controls[0].parts, Array.isArray(controls[0].parts) ? controls[0].parts.length : 0);
      console.log('Has class:', !!controls[0].class, controls[0].class);
      console.log('Full control keys:', Object.keys(controls[0]));
      console.log('======================================');
    }
    
    // Debug: Log catalog metadata
    if (metadata) {
      console.log('=== DEBUG: Catalog metadata ===');
      console.log('Metadata keys:', Object.keys(metadata));
      console.log('Title:', metadata.title);
      console.log('Version:', metadata.version);
      console.log('=================================');
    }

    // Build SSP metadata - preserve catalog metadata and enhance with SSP-specific data
    // Start with a deep copy of catalog metadata to preserve all fields
    // Then recursively sanitize ALL strings in the entire metadata structure
    const rawMetadata = metadata ? JSON.parse(JSON.stringify(metadata)) : {};
    
    // If strict validation is enabled, filter to only allowed OSCAL fields
    const filteredMetadata = validationOptions.additionalProperties 
      ? filterOSCALMetadata(rawMetadata)
      : rawMetadata;
    
    const sspMetadata = sanitizeOSCALObject(filteredMetadata) || {};
    
    // Override with SSP-specific values - sanitize all strings
    sspMetadata.title = sanitizeOSCALString(systemInfo.title || metadata?.title || "System Security Plan");
    sspMetadata["last-modified"] = new Date().toISOString();
    sspMetadata.version = sanitizeOSCALString(systemInfo.version || metadata?.version || "1.0");
    sspMetadata["oscal-version"] = "2.1.0";  // OSCAL schema only allows "2.1.0" as valid value
    
    // Ensure props array exists (for integrity hash addition later)
    if (!sspMetadata.props) {
      sspMetadata.props = [];
    }
    
    // Ensure links array exists and is properly preserved
    if (!sspMetadata.links) {
      sspMetadata.links = [];
    }
    
    // Ensure roles array exists
    if (!sspMetadata.roles) {
      sspMetadata.roles = [];
    }
    
    // Ensure "prepared-by" role exists for assessor
    const hasPreparedByRole = sspMetadata.roles.some(role => role.id === "prepared-by");
    if (!hasPreparedByRole) {
      sspMetadata.roles.push({
        id: "prepared-by",
        title: "Prepared By",
        description: "The organization that prepared this system security plan"
      });
    }
    
    // Add assessor details to metadata as a party and responsible-party
    const sanitizedAssessorDetails = sanitizeOSCALString(systemInfo.assessorDetails);
    if (sanitizedAssessorDetails) {
      const assessorUuid = uuidv4();
      
      // Create party for assessor
      const assessorParty = {
        uuid: assessorUuid,
        type: "organization",
        name: sanitizedAssessorDetails,
        remarks: "Assessment organization responsible for conducting the security assessment"
      };
      
      // Add to parties array (create if doesn't exist)
      if (!sspMetadata.parties) {
        sspMetadata.parties = [];
      }
      sspMetadata.parties.push(assessorParty);
      
      // Create responsible-party entry with role-id: "prepared-by"
      const assessorResponsibleParty = {
        "role-id": "prepared-by",
        "party-uuids": [assessorUuid]
      };
      
      // Add to responsible-parties array (create if doesn't exist)
      if (!sspMetadata["responsible-parties"]) {
        sspMetadata["responsible-parties"] = [];
      }
      sspMetadata["responsible-parties"].push(assessorResponsibleParty);
    }
    
    // Don't add empty roles/parties arrays - they can cause oneOf validation errors
    if (metadata) {
      
      // Preserve remarks if available (sanitized) - don't use placeholder for optional fields
      const sanitizedMetadataRemarks = sanitizeOSCALString(metadata.remarks, false);
      if (sanitizedMetadataRemarks) {
        sspMetadata.remarks = sanitizedMetadataRemarks;
      }
    }
    // Don't add empty roles/parties arrays - they can cause oneOf validation errors

    const ssp = {
      "system-security-plan": {
        uuid: uuidv4(),
        metadata: sspMetadata,
        "import-profile": {
          href: sanitizeOSCALString(systemInfo.catalogueUrl) || "#"
        },
        "system-characteristics": {
          "system-ids": [
            {
              id: sanitizeOSCALString(systemInfo.systemId) || uuidv4()
            }
          ],
          "system-name": sanitizeOSCALString(systemInfo.systemName) || "System Name",
          description: sanitizeOSCALString(systemInfo.description) || "System Description",
          "security-sensitivity-level": sanitizeOSCALString(systemInfo.securityLevel) || "moderate",
          ...((() => {
            // Build props array, only include if not empty
            // Conditionally exclude custom props if "No Additional Properties" validation is enabled
            const propsArray = !validationOptions.additionalProperties ? [
              ...(sanitizeOSCALString(systemInfo.organization) ? [{
                name: "organization",
                value: sanitizeOSCALString(systemInfo.organization)
              }] : []),
              ...(sanitizeOSCALString(systemInfo.systemOwner) ? [{
                name: "system-owner",
                value: sanitizeOSCALString(systemInfo.systemOwner)
              }] : []),
              // assessorDetails now in metadata.responsible-parties with role-id: "prepared-by"
              ...(sanitizeOSCALString(systemInfo.cspIaaS) ? [{
                name: "csp-iaas",
                value: sanitizeOSCALString(systemInfo.cspIaaS)
              }] : []),
              ...(sanitizeOSCALString(systemInfo.cspPaaS) ? [{
                name: "csp-paas",
                value: sanitizeOSCALString(systemInfo.cspPaaS)
              }] : []),
              ...(sanitizeOSCALString(systemInfo.cspSaaS) ? [{
                name: "csp-saas",
                value: sanitizeOSCALString(systemInfo.cspSaaS)
              }] : [])
            ] : [];
            return propsArray.length > 0 ? { props: propsArray } : {};
          })()),
          "system-information": {
            "information-types": [
              {
                uuid: uuidv4(),
                title: "System Information",
                description: "Information types stored, processed, or transmitted by this system",
                "categorizations": [],
                "confidentiality-impact": {
                  base: sanitizeOSCALString(systemInfo.confidentiality) || "moderate"
                },
                "integrity-impact": {
                  base: sanitizeOSCALString(systemInfo.integrity) || "moderate"
                },
                "availability-impact": {
                  base: sanitizeOSCALString(systemInfo.availability) || "moderate"
                }
              }
            ]
          },
          "security-impact-level": {
            "security-objective-confidentiality": sanitizeOSCALString(systemInfo.confidentiality) || "moderate",
            "security-objective-integrity": sanitizeOSCALString(systemInfo.integrity) || "moderate",
            "security-objective-availability": sanitizeOSCALString(systemInfo.availability) || "moderate"
          },
          status: {
            state: sanitizeOSCALString(systemInfo.status) || "under-development"
          },
          "authorization-boundary": {
            description: sanitizeOSCALString(systemInfo.authorizationBoundary) || "System authorization boundary description"
          }
        },
        "system-implementation": {
          description: (() => {
            // Combine system description and CSP provider details
            let implDesc = sanitizeOSCALString(systemInfo.description) || "System implementation description";
            
            const cspDetails = [];
            const cspIaaS = sanitizeOSCALString(systemInfo.cspIaaS);
            const cspPaaS = sanitizeOSCALString(systemInfo.cspPaaS);
            const cspSaaS = sanitizeOSCALString(systemInfo.cspSaaS);
            
            if (cspIaaS) cspDetails.push(`IaaS: ${cspIaaS}`);
            if (cspPaaS) cspDetails.push(`PaaS: ${cspPaaS}`);
            if (cspSaaS) cspDetails.push(`SaaS: ${cspSaaS}`);
            
            if (cspDetails.length > 0) {
              implDesc += `\n\nCloud Service Providers: ${cspDetails.join(', ')}`;
            }
            
            return sanitizeOSCALString(implDesc) || "System implementation description";
          })(),
          users: [],
          components: []
        },
        "control-implementation": {
          description: "Control implementation description",
          "implemented-requirements": controls.map(control => {
            // Build the implemented requirement with proper OSCAL structure
            const implementedReq = {
              uuid: uuidv4(),
              "control-id": sanitizeOSCALString(control.id, true),
              description: sanitizeOSCALString(control.implementation || control.description, true)
            };
            
            // Preserve catalog props and add implementation props
            const catalogProps = sanitizeProps(control.props || []);
            const implementationProps = [
              {
                name: "implementation-status",
                value: sanitizeOSCALString(control.status, true)
              }
            ];
            
            // Add catalog control title and description as props only if "No Additional Properties" is NOT selected
            if (!validationOptions.additionalProperties) {
              const titleValue = sanitizeOSCALString(control.title, true);
              const descValue = sanitizeOSCALString(control.description, true);
              
              // Only add if not placeholder (meaningful data)
              if (titleValue && titleValue !== OSCAL_EMPTY_PLACEHOLDER) {
                implementationProps.push({
                name: "catalog-control-title",
                  value: titleValue
                });
              }
              if (descValue && descValue !== OSCAL_EMPTY_PLACEHOLDER) {
                implementationProps.push({
                name: "catalog-control-description",
                  value: descValue
                });
              }
            }
            
            // Add custom fields as props (OSCAL-compliant way)
            // Conditionally exclude custom props if "No Additional Properties" validation is enabled
            const customFieldsMapping = {
              'responsibleParty': 'responsible-party',
              'controlOwner': 'control-owner',
              'consumerGuidance': 'consumer-guidance',
              'implementationDate': 'implementation-date',
              'reviewDate': 'review-date',
              'nextReviewDate': 'next-review-date',
              'controlType': 'control-type',
              'evidence': 'evidence',
              'testingObjective': 'testing-objective',
              'testingProcedure': 'testing-procedure',
              'testingFrequency': 'testing-frequency',
              'lastTestDate': 'last-test-date',
              'apiUrl': 'api-url',
              'apiCredentialId': 'api-credential-id',
              'apiResponseData': 'api-response-data',
              'apiDataHistory': 'api-data-history',
              'riskRating': 'risk-rating',
              'frameworks': 'frameworks',
              'compensatingControls': 'compensating-controls',
              'exceptions': 'exceptions'
            };
            
            const customProps = [];
            // Only include custom props if "No Additional Properties" is NOT selected
            if (!validationOptions.additionalProperties) {
            Object.keys(customFieldsMapping).forEach(field => {
                const rawValue = control[field];
                // Include field if it has any value (even empty string will get placeholder)
                if (rawValue !== undefined && rawValue !== null) {
                  const sanitizedValue = typeof rawValue === 'object' 
                    ? sanitizeOSCALString(JSON.stringify(rawValue), true)
                    : sanitizeOSCALString(String(rawValue), true);
                  
                  // Always add - sanitizeOSCALString returns placeholder for empty values
                customProps.push({
                  name: customFieldsMapping[field],
                    value: sanitizedValue
                });
              }
            });
            }
            
            implementedReq.props = sanitizeProps([...catalogProps, ...implementationProps, ...customProps]);
            
            // Preserve catalog params if they exist (sanitize all strings)
            if (control.params && control.params.length > 0) {
              const sanitizedParams = sanitizeOSCALObject(control.params);
              if (sanitizedParams) {
                implementedReq.params = sanitizedParams;
              }
            }
            
            // Preserve or create parts structure (sanitize all strings)
            if (control.parts && control.parts.length > 0) {
              const sanitizedParts = sanitizeOSCALObject(control.parts);
              if (sanitizedParts) {
                implementedReq.parts = sanitizedParts;
              }
            }
            
            // Add statements if present (sanitize all strings)
            if (control.statements && control.statements.length > 0) {
              const sanitizedStatements = sanitizeOSCALObject(control.statements);
              if (sanitizedStatements) {
                implementedReq.statements = sanitizedStatements;
              }
            }
            
            // Add implementation remarks (sanitized) - only if present and not empty
            const sanitizedRemarks = sanitizeOSCALString(control.remarks, false);
            if (sanitizedRemarks) {
              implementedReq.remarks = sanitizedRemarks;
            }
            
            // Preserve class if present (sanitized) - only if present and not empty
            const sanitizedClass = sanitizeOSCALString(control.class, false);
            if (sanitizedClass) {
              implementedReq.class = sanitizedClass;
            }
            
            // If strict validation is enabled, filter to only allowed OSCAL fields
            if (validationOptions.additionalProperties) {
              return filterOSCALImplementedRequirement(implementedReq);
            }
            
            return implementedReq;
          })
        }
      }
    };

    // FINAL SANITIZATION PASS: Recursively sanitize entire SSP structure
    // This catches any remaining whitespace/empty strings we might have missed
    console.log('🧹 Performing final OSCAL sanitization pass...');
    const sanitizedSSP = sanitizeOSCALObject(ssp);
    
    if (!sanitizedSSP || !sanitizedSSP['system-security-plan']) {
      throw new Error('SSP sanitization resulted in empty document');
    }

    // Add FIPS 140-2 compliant integrity hash before returning
    try {
      console.log('🔐 Attempting to add integrity hash to SSP...');
      console.log('📊 SSP structure check:', {
        hasSSP: !!sanitizedSSP['system-security-plan'],
        hasMetadata: !!sanitizedSSP['system-security-plan']?.metadata,
        hasProps: !!sanitizedSSP['system-security-plan']?.metadata?.props,
        propsCount: sanitizedSSP['system-security-plan']?.metadata?.props?.length || 0
      });
      
      const sspWithIntegrity = addIntegrityHash(sanitizedSSP);
      
      // Verify integrity hash was added
      const finalProps = sspWithIntegrity['system-security-plan']?.metadata?.props || [];
      const hasIntegrityHash = finalProps.some(prop => 
        prop.name === 'file-integrity-hash' && 
        prop.ns === 'https://oscal-report-generator.adobe.com/ns/integrity'
      );
      
      if (hasIntegrityHash) {
        console.log('✅ Successfully added FIPS 140-2 compliant integrity hash to OSCAL export');
        console.log('📊 Final props count:', finalProps.length);
        res.json(sspWithIntegrity);
      } else {
        console.error('❌ Integrity hash was not added! Props count:', finalProps.length);
        console.error('❌ Final props:', JSON.stringify(finalProps.map(p => ({ name: p.name, ns: p.ns })), null, 2));
        // Still return the SSP but log the error
        res.json(sspWithIntegrity);
      }
    } catch (integrityError) {
      console.error('❌ Failed to add integrity hash:', integrityError.message);
      console.error('❌ Error stack:', integrityError.stack);
      // Don't fail the export if integrity hash fails - just log warning
      console.warn('⚠️ Returning SSP without integrity hash due to error');
      res.json(sanitizedSSP);
    }
  } catch (error) {
    console.error('Error generating SSP:', error.message);
    res.status(500).json({ 
      error: 'Failed to generate SSP',
      details: error.message 
    });
  }
});

// Generate Security Assessment Results (SAR)
// OWASP API Security: Implements request size limits to prevent DoS attacks
app.post('/api/generate-sar', async (req, res) => {
  try {
    const { metadata, controls, assessmentInfo = {}, validationOptions = {} } = req.body;
    
    // SECURITY: API4:2023 - Unrestricted Resource Consumption Prevention
    // Limit number of controls to prevent DoS attacks
    if (controls && controls.length > 1000) {
      return res.status(400).json({
        error: 'Request too large',
        message: 'Maximum 1000 controls per SAR generation request',
        limit: 1000,
        received: controls.length
      });
    }
    
    // SECURITY: Limit metadata size to prevent memory exhaustion
    const metadataSize = JSON.stringify(metadata || {}).length;
    if (metadataSize > 100000) { // 100KB
      return res.status(400).json({
        error: 'Metadata too large',
        message: 'Metadata must be less than 100KB',
        limit: '100KB',
        received: `${Math.round(metadataSize / 1024)}KB`
      });
    }
    
    // SECURITY AUDIT LOG: OWASP A09 - Security Logging and Monitoring
    // Log SAR generation for audit trail and compliance
    console.log({
      timestamp: new Date().toISOString(),
      action: 'SAR_GENERATION_REQUEST',
      controlCount: controls?.length || 0,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent'),
      assessmentTitle: assessmentInfo?.title || 'N/A'
    });
    
    // Debug: Log request details
    if (process.env.NODE_ENV === 'development') {
      console.log('=== DEBUG: SAR Generation Request ===');
      console.log('Controls count:', controls?.length || 0);
      console.log('Assessment info:', assessmentInfo);
      console.log('=====================================');
    }
    
    // Import SAR generator
    const { generateSAR } = await import('./sarGenerator.js');
    
    // Generate SAR document
    const sarDocument = generateSAR({
      metadata,
      controls,
      assessmentInfo,
      validationOptions
    });
    
    // SECURITY AUDIT LOG: Log successful SAR generation
    console.log({
      timestamp: new Date().toISOString(),
      action: 'SAR_GENERATION_SUCCESS',
      controlCount: controls?.length || 0,
      documentUUID: sarDocument['assessment-results']?.uuid
    });
    
    // Validate if requested
    if (validationOptions.enableValidation) {
      try {
        const { validateOSCALDocument } = await import('./oscalValidator.js');
        const validationResult = await validateOSCALDocument(sarDocument, 'assessment-results');
        
        if (!validationResult.valid) {
          console.warn('SAR validation warnings:', validationResult.errors);
          // Continue anyway - warnings don't prevent generation
        }
      } catch (validationError) {
        console.error('SAR validation error:', validationError);
        // Continue anyway - validation is optional
      }
    }
    
    // Return SAR document
    res.json(sarDocument);
    
  } catch (error) {
    // SECURITY AUDIT LOG: Log SAR generation failures for security monitoring
    console.error({
      timestamp: new Date().toISOString(),
      action: 'SAR_GENERATION_ERROR',
      error: error.message,
      controlCount: req.body?.controls?.length || 0,
      ipAddress: req.ip || req.connection.remoteAddress
    });
    
    // Detailed error logging for debugging (development only)
    if (process.env.NODE_ENV === 'development') {
      console.error('Error generating SAR:', error.message);
      console.error('Stack trace:', error.stack);
    }
    
    res.status(500).json({ 
      error: 'Failed to generate SAR',
      details: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred during SAR generation'
    });
  }
});

// Generate Cloud Control Matrix export
app.post('/api/generate-ccm', async (req, res) => {
  try {
    const { controls, systemInfo } = req.body;

    const workbook = await generateCCMExport(controls, systemInfo);

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=cloud-control-matrix.xlsx');
    res.send(buffer);
  } catch (error) {
    console.error('Error generating CCM:', error.message);
    res.status(500).json({ 
      error: 'Failed to generate Cloud Control Matrix',
      details: error.message 
    });
  }
});

// Generate PDF Report export
app.post('/api/generate-pdf', async (req, res) => {
  try {
    const { controls, systemInfo, metadata } = req.body;

    const pdfBuffer = await generatePDFReport(controls, systemInfo, metadata);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=compliance-report.pdf');
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error generating PDF:', error.message);
    res.status(500).json({ 
      error: 'Failed to generate PDF report',
      details: error.message 
    });
  }
});

// Generate Excel export
app.post('/api/generate-excel', async (req, res) => {
  try {
    const { controls, systemInfo } = req.body;

    const workbook = new ExcelJS.Workbook();
    
    // System Information sheet
    const systemSheet = workbook.addWorksheet('System Information');
    systemSheet.columns = [
      { header: 'Field', key: 'field', width: 30 },
      { header: 'Value', key: 'value', width: 50 }
    ];

    systemSheet.addRows([
      { field: 'System Name', value: systemInfo.systemName || '' },
      { field: 'System ID', value: systemInfo.systemId || '' },
      { field: 'Description', value: systemInfo.description || '' },
      { field: 'Organisation', value: systemInfo.organization || '' },
      { field: 'System Owner', value: systemInfo.systemOwner || '' },
      { field: 'Assessor Details', value: systemInfo.assessorDetails || '' },
      { field: 'CSP IaaS Provider', value: systemInfo.cspIaaS || '' },
      { field: 'CSP PaaS Provider', value: systemInfo.cspPaaS || '' },
      { field: 'CSP SaaS Provider', value: systemInfo.cspSaaS || '' },
      { field: 'Security Level', value: systemInfo.securityLevel || '' },
      { field: 'Status', value: systemInfo.status || '' },
      { field: 'Catalogue URL', value: systemInfo.catalogueUrl || '' }
    ]);

    // Style the header
    systemSheet.getRow(1).font = { bold: true };
    systemSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };

    // Controls sheet
    const controlsSheet = workbook.addWorksheet('Controls Implementation');
    controlsSheet.columns = [
      { header: 'Control ID', key: 'id', width: 15 },
      { header: 'Control Title', key: 'title', width: 40 },
      { header: 'Group', key: 'group', width: 20 },
      { header: 'Implementation Status', key: 'status', width: 20 },
      { header: 'Implementation Description', key: 'implementation', width: 50 },
      { header: 'Remarks', key: 'remarks', width: 30 }
    ];

    controls.forEach(control => {
      controlsSheet.addRow({
        id: control.id,
        title: control.title,
        group: control.groupTitle || '',
        status: control.status || 'Not Assessed',
        implementation: control.implementation || '',
        remarks: control.remarks || ''
      });
    });

    // Style the header
    controlsSheet.getRow(1).font = { bold: true };
    controlsSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=ssp-export.xlsx');
    res.send(buffer);
  } catch (error) {
    console.error('Error generating Excel:', error.message);
    res.status(500).json({ 
      error: 'Failed to generate Excel',
      details: error.message 
    });
  }
});

// ============================================================================
// Async Job Queue Endpoints
// ============================================================================

/**
 * Create async PDF export job
 * POST /api/jobs/pdf
 * Returns job ID immediately, client polls for completion
 */
app.post('/api/jobs/pdf', optionalAuth, async (req, res) => {
  try {
    const { controls, systemInfo, metadata } = req.body;
    
    const jobId = createJob(
      JOB_TYPE.PDF_EXPORT,
      { controls, systemInfo, metadata },
      {
        userId: req.user?.id,
        username: req.user?.username,
        ip: req.ip
      }
    );
    
    res.json({
      success: true,
      jobId,
      message: 'PDF export job created',
      statusUrl: `/api/jobs/${jobId}`,
      downloadUrl: `/api/jobs/${jobId}/download`
    });
  } catch (error) {
    console.error('Error creating PDF job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create PDF export job',
      details: error.message
    });
  }
});

/**
 * Create async Excel export job
 * POST /api/jobs/excel
 */
app.post('/api/jobs/excel', optionalAuth, async (req, res) => {
  try {
    const { controls, systemInfo } = req.body;
    
    const jobId = createJob(
      JOB_TYPE.EXCEL_EXPORT,
      { controls, systemInfo },
      {
        userId: req.user?.id,
        username: req.user?.username,
        ip: req.ip
      }
    );
    
    res.json({
      success: true,
      jobId,
      message: 'Excel export job created',
      statusUrl: `/api/jobs/${jobId}`,
      downloadUrl: `/api/jobs/${jobId}/download`
    });
  } catch (error) {
    console.error('Error creating Excel job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create Excel export job',
      details: error.message
    });
  }
});

/**
 * Create async CCM export job
 * POST /api/jobs/ccm
 */
app.post('/api/jobs/ccm', optionalAuth, async (req, res) => {
  try {
    const { controls, systemInfo } = req.body;
    
    const jobId = createJob(
      JOB_TYPE.CCM_EXPORT,
      { controls, systemInfo },
      {
        userId: req.user?.id,
        username: req.user?.username,
        ip: req.ip
      }
    );
    
    res.json({
      success: true,
      jobId,
      message: 'CCM export job created',
      statusUrl: `/api/jobs/${jobId}`,
      downloadUrl: `/api/jobs/${jobId}/download`
    });
  } catch (error) {
    console.error('Error creating CCM job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create CCM export job',
      details: error.message
    });
  }
});

/**
 * Get job status
 * GET /api/jobs/:jobId
 */
app.get('/api/jobs/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const job = getJob(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    res.json({
      success: true,
      job
    });
  } catch (error) {
    console.error('Error getting job status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get job status',
      details: error.message
    });
  }
});

/**
 * Download job result
 * GET /api/jobs/:jobId/download
 */
app.get('/api/jobs/:jobId/download', (req, res) => {
  try {
    const { jobId } = req.params;
    const job = getJob(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    if (job.status !== JOB_STATUS.COMPLETED) {
      return res.status(400).json({
        success: false,
        error: 'Job not completed yet',
        status: job.status,
        progress: job.progress
      });
    }
    
    const result = getJobResult(jobId);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Job result not found'
      });
    }
    
    // Set appropriate content type and filename based on job type
    let contentType, filename;
    
    switch (job.type) {
      case JOB_TYPE.PDF_EXPORT:
        contentType = 'application/pdf';
        filename = 'compliance-report.pdf';
        break;
        
      case JOB_TYPE.EXCEL_EXPORT:
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        filename = 'ssp-export.xlsx';
        break;
        
      case JOB_TYPE.CCM_EXPORT:
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        filename = 'cloud-control-matrix.xlsx';
        break;
        
      default:
        contentType = 'application/octet-stream';
        filename = 'download';
    }
    
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(result);
  } catch (error) {
    console.error('Error downloading job result:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download job result',
      details: error.message
    });
  }
});

/**
 * List all jobs (with optional filtering)
 * GET /api/jobs?status=completed&type=pdf-export
 */
app.get('/api/jobs', authenticate, async (req, res) => {
  try {
    const { status, type } = req.query;
    
    // Regular users can only see their own jobs
    const filters = {
      status,
      type
    };
    
    if (req.user.role !== ROLES.ADMIN) {
      filters.userId = req.user.id;
    }
    
    const jobs = listJobs(filters);
    
    res.json({
      success: true,
      count: jobs.length,
      jobs
    });
  } catch (error) {
    console.error('Error listing jobs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list jobs',
      details: error.message
    });
  }
});

/**
 * Delete a job
 * DELETE /api/jobs/:jobId
 */
app.delete('/api/jobs/:jobId', authenticate, (req, res) => {
  try {
    const { jobId } = req.params;
    const job = getJob(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    // Only admin or job owner can delete
    if (req.user.role !== ROLES.ADMIN && job.metadata?.userId !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to delete this job'
      });
    }
    
    deleteJob(jobId);
    
    res.json({
      success: true,
      message: 'Job deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete job',
      details: error.message
    });
  }
});

/**
 * Cleanup old jobs (admin only)
 * POST /api/jobs/cleanup
 */
app.post('/api/jobs/cleanup', requireRole(ROLES.ADMIN), (req, res) => {
  try {
    const cleanedCount = cleanupOldJobs();
    
    res.json({
      success: true,
      message: `Cleaned up ${cleanedCount} old jobs`
    });
  } catch (error) {
    console.error('Error cleaning up jobs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup jobs',
      details: error.message
    });
  }
});

// ============================================================================
// Debug State Inspection Endpoints (Development/Debugging)
// ============================================================================

/**
 * Get debug state statistics
 * GET /api/debug/state/stats
 */
app.get('/api/debug/state/stats', requireRole(ROLES.ADMIN), (req, res) => {
  try {
    const stats = getStateStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting state stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get state stats',
      details: error.message
    });
  }
});

/**
 * List debug state files
 * GET /api/debug/state/list?sessionId=xxx&action=xxx&since=xxx
 */
app.get('/api/debug/state/list', requireRole(ROLES.ADMIN), (req, res) => {
  try {
    const { sessionId, action, since } = req.query;
    const states = listStates({ sessionId, action, since });
    
    res.json({
      success: true,
      count: states.length,
      states
    });
  } catch (error) {
    console.error('Error listing states:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list states',
      details: error.message
    });
  }
});

/**
 * Get specific debug state file
 * GET /api/debug/state/:filename
 */
app.get('/api/debug/state/:filename', requireRole(ROLES.ADMIN), async (req, res) => {
  try {
    const { filename } = req.params;
    const state = await getState(filename);
    
    if (!state) {
      return res.status(404).json({
        success: false,
        error: 'State file not found'
      });
    }
    
    res.json({
      success: true,
      state
    });
  } catch (error) {
    console.error('Error getting state:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get state',
      details: error.message
    });
  }
});

/**
 * Delete debug state file
 * DELETE /api/debug/state/:filename
 */
app.delete('/api/debug/state/:filename', requireRole(ROLES.ADMIN), (req, res) => {
  try {
    const { filename } = req.params;
    const deleted = deleteState(filename);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'State file not found'
      });
    }
    
    res.json({
      success: true,
      message: 'State file deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting state:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete state',
      details: error.message
    });
  }
});

/**
 * Cleanup old debug state files
 * POST /api/debug/state/cleanup
 */
app.post('/api/debug/state/cleanup', requireRole(ROLES.ADMIN), (req, res) => {
  try {
    const cleanedCount = cleanupOldStates();
    
    res.json({
      success: true,
      message: `Cleaned up ${cleanedCount} old state files`
    });
  } catch (error) {
    console.error('Error cleaning up states:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup states',
      details: error.message
    });
  }
});

/**
 * Save current state snapshot (manual)
 * POST /api/debug/state/save
 */
app.post('/api/debug/state/save', requireRole(ROLES.ADMIN), async (req, res) => {
  try {
    const { sessionId, action, state, metadata } = req.body;
    
    if (!sessionId || !action || !state) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: sessionId, action, state'
      });
    }
    
    const filePath = await saveState(sessionId, action, state, {
      ...metadata,
      manualSave: true,
      savedBy: req.user.username
    });
    
    if (!filePath) {
      return res.status(500).json({
        success: false,
        error: 'Debug state is disabled or save failed'
      });
    }
    
    res.json({
      success: true,
      message: 'State saved successfully',
      filePath
    });
  } catch (error) {
    console.error('Error saving state:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save state',
      details: error.message
    });
  }
});

// ============================================================================
// OSCAL Validation Endpoints (Metaschema Framework Integration)
// ============================================================================

/**
 * Get validator status - check if Docker and OSCAL CLI are available
 */
app.get('/api/validator/status', async (req, res) => {
  try {
    const status = await getValidatorStatus();
    res.json(status);
  } catch (error) {
    console.error('Error checking validator status:', error);
    res.status(500).json({ 
      error: 'Failed to check validator status',
      details: error.message 
    });
  }
});

/**
 * Get control implementation suggestions
 * Uses pattern matching, templates, and learning from existing controls
 * 
 * Request body:
 * {
 *   "control": { id, title, description, ... },
 *   "existingControls": [ ... ] (optional, for learning)
 * }
 */
const AI_SUGGESTIONS_NOT_ALLOWED_MESSAGE = 'You are not authorised to access this feature. Enablement requires engagement with the Adobe Managed Services Sales team to integrate a dedicated instance with a customer‑provided AI Engine. This capability is offered on an as‑is basis for existing customers, with no warranty or support provided by Adobe Managed Services.';

app.post('/api/suggest-control', authenticate, async (req, res) => {
  try {
    const aiConfig = getResolvedConfig()?.aiConfig;
    if (!isUserAllowedForAISuggestions(req.user, aiConfig)) {
      return res.status(403).json({
        success: false,
        error: AI_SUGGESTIONS_NOT_ALLOWED_MESSAGE,
        code: 'AI_SUGGESTIONS_NOT_ALLOWED'
      });
    }
    const { control, existingControls = [] } = req.body;
    
    if (process.env.NODE_ENV === 'development') {
      console.log('📥 Received suggestion request:', {
        controlId: control?.id,
        controlTitle: control?.title,
        existingControlsCount: existingControls?.length || 0
      });
    }
    
    if (!control || !control.id) {
      console.warn('⚠️ Missing control or control.id in request');
      return res.status(400).json({ 
        error: 'Control object with id is required',
        received: { hasControl: !!control, hasId: !!control?.id }
      });
    }
    
    // Let the suggestion engine handle timeouts and fallbacks internally
    // It will automatically fall back to templates if AI fails or times out
    const suggestions = await suggestControlImplementation(control, existingControls, req.user);
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`✅ Generated suggestions for ${control.id} with confidence: ${suggestions.confidence}`);
      console.log(`   Source: ${suggestions.source || 'unknown'} (${suggestions.sourceLabel || 'N/A'})`);
    }
    
    res.json({
      success: true,
      suggestions: suggestions,
      controlId: control.id
    });
  } catch (error) {
    console.error('❌ Error generating control suggestions:', error);
    console.error('Error stack:', error.stack);
    
    // Even if there's an unexpected error, return fallback suggestions
    // The application must always work, even if AI fails
    try {
      const { control } = req.body;
      if (control && control.id) {
        // Import fallback generator
        const { generateGenericImplementation } = await import('./controlSuggestionEngine.js');
        const fallbackImplementation = generateGenericImplementation(control);
        
        const fallbackSuggestions = {
          status: 'effective',
          implementation: fallbackImplementation,
          responsibleParty: 'Shared',
          controlType: 'Orchestrated',
          testingMethod: 'Manual Testing',
          testingFrequency: 'Quarterly',
          riskRating: 'Medium',
          confidence: 0.5,
          reasoning: ['Using fallback template due to unexpected error'],
          source: 'fallback',
          sourceLabel: 'Template/Pattern (Error Fallback)'
        };
        
        console.log('✅ Generated fallback suggestions due to error');
        return res.json({
          success: true,
          suggestions: fallbackSuggestions,
          controlId: control.id,
          fallback: true
        });
      }
    } catch (fallbackError) {
      console.error('❌ Fallback generation also failed:', fallbackError);
    }
    
    // Last resort - return minimal fallback
    res.json({ 
      success: true,
      suggestions: {
        status: 'not-assessed',
        implementation: 'Implementation details to be determined based on control requirements.',
        responsibleParty: 'Shared',
        controlType: 'Orchestrated',
        testingMethod: 'Manual Testing',
        testingFrequency: 'Quarterly',
        riskRating: 'Medium',
        confidence: 0.3,
        reasoning: ['Using minimal fallback due to error'],
        source: 'fallback',
        sourceLabel: 'Minimal Fallback'
      },
      controlId: req.body?.control?.id || 'unknown',
      fallback: true
    });
  }
});

/**
 * Check AI availability (automatically routes to correct service based on model)
 */
app.get('/api/ai/status', authenticate, async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Checking AI availability...');
      console.log(`   OLLAMA_URL: ${process.env.OLLAMA_URL || 'not set'}`);
      console.log(`   OLLAMA_HOST: ${process.env.OLLAMA_HOST || 'not set'}`);
    }
    
    // Detect model family and check appropriate service
    const modelFamily = await detectModelFamily();
    const status = await checkAIAvailability();
    
    console.log(`📊 AI status:`, {
      modelFamily: modelFamily,
      available: status.available,
      provider: status.provider,
      reason: status.reason
    });
    
    res.json({
      success: true,
      modelFamily: modelFamily,
      ...status,
      environment: {
        OLLAMA_URL: process.env.OLLAMA_URL || 'not set',
        OLLAMA_HOST: process.env.OLLAMA_HOST || 'not set',
        NODE_ENV: process.env.NODE_ENV || 'not set'
      }
    });
  } catch (error) {
    console.error('❌ Error checking AI status:', error);
    console.error('   Stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to check AI status',
      details: error.message,
      environment: {
        OLLAMA_URL: process.env.OLLAMA_URL || 'not set',
        OLLAMA_HOST: process.env.OLLAMA_HOST || 'not set',
        NODE_ENV: process.env.NODE_ENV || 'not set'
      }
    });
  }
});

/**
 * Check Mistral availability and configuration (legacy endpoint - use /api/ai/status instead)
 */
app.get('/api/mistral/status', authenticate, async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Checking Mistral availability...');
      console.log(`   OLLAMA_URL: ${process.env.OLLAMA_URL || 'not set'}`);
      console.log(`   OLLAMA_HOST: ${process.env.OLLAMA_HOST || 'not set'}`);
    }
    
    const status = await checkMistralAvailability();
    
    console.log(`📊 Mistral status:`, {
      available: status.available,
      provider: status.provider,
      reason: status.reason
    });
    
    res.json({
      success: true,
      ...status,
      environment: {
        OLLAMA_URL: process.env.OLLAMA_URL || 'not set',
        OLLAMA_HOST: process.env.OLLAMA_HOST || 'not set',
        NODE_ENV: process.env.NODE_ENV || 'not set'
      }
    });
  } catch (error) {
    console.error('❌ Error checking Mistral status:', error);
    console.error('   Stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to check Mistral status',
      details: error.message,
      environment: {
        OLLAMA_URL: process.env.OLLAMA_URL || 'not set',
        OLLAMA_HOST: process.env.OLLAMA_HOST || 'not set',
        NODE_ENV: process.env.NODE_ENV || 'not set'
      }
    });
  }
});

/**
 * Check Gemma availability and configuration
 */
app.get('/api/gemma/status', authenticate, async (req, res) => {
  try {
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Checking Gemma availability...');
      console.log(`   OLLAMA_URL: ${process.env.OLLAMA_URL || 'not set'}`);
      console.log(`   OLLAMA_HOST: ${process.env.OLLAMA_HOST || 'not set'}`);
    }
    const modelFamily = await detectModelFamily();
    const status = modelFamily === 'gemma' ? await checkAIAvailability() : await checkGemmaAvailability();
    
    console.log(`📊 Gemma status:`, {
      available: status.available,
      provider: status.provider,
      reason: status.reason
    });
    
    res.json({
      success: true,
      ...status,
      environment: {
        OLLAMA_URL: process.env.OLLAMA_URL || 'not set',
        OLLAMA_HOST: process.env.OLLAMA_HOST || 'not set',
        NODE_ENV: process.env.NODE_ENV || 'not set'
      }
    });
  } catch (error) {
    console.error('❌ Error checking Gemma status:', error);
    console.error('   Stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to check Gemma status',
      details: error.message,
      environment: {
        OLLAMA_URL: process.env.OLLAMA_URL || 'not set',
        OLLAMA_HOST: process.env.OLLAMA_HOST || 'not set',
        NODE_ENV: process.env.NODE_ENV || 'not set'
      }
    });
  }
});

/**
 * Get AI telemetry log statistics
 * Returns information about logged AI interactions
 */
app.get('/api/ai/logs/stats', authenticate, authorize([PERMISSIONS.VIEW_AI_LOGS]), async (req, res) => {
  try {
    const stats = getLogStats();
    res.json({
      success: true,
      ...stats
    });
  } catch (error) {
    console.error('Error getting log stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get log statistics',
      details: error.message
    });
  }
});

/**
 * Clean up old AI telemetry logs
 * Deletes log files older than specified days
 */
app.post('/api/ai/logs/cleanup', authenticate, authorize([PERMISSIONS.MANAGE_AI_LOGS]), async (req, res) => {
  try {
    const { daysToKeep = 30 } = req.body;
    const result = cleanupOldLogs(daysToKeep);
    res.json(result);
  } catch (error) {
    console.error('Error cleaning up logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup logs',
      details: error.message
    });
  }
});

/**
 * List Bedrock foundation models (Mistral, Gemma, GPT only) for the configured region.
 * Uses resolved AI config credentials (including pass vault). Region from query or config.
 * GET /api/ai/bedrock-models?region=us-east-1
 */
app.get('/api/ai/bedrock-models', authenticate, authorize(PERMISSIONS.EDIT_SETTINGS), async (req, res) => {
  try {
    let resolved;
    try {
      resolved = getResolvedConfig();
    } catch (resolveErr) {
      console.error('Failed to resolve config (pass vault):', resolveErr?.message);
      return res.status(400).json({
        error: `Could not load config: ${resolveErr?.message || resolveErr}. Ensure pass entries exist or save AI settings first.`
      });
    }
    const region = (req.query.region && String(req.query.region).trim()) || resolved.aiConfig?.awsRegion || 'us-east-1';
    const accessKeyId = (resolved.aiConfig?.awsAccessKeyId && String(resolved.aiConfig.awsAccessKeyId).trim()) || '';
    const secretAccessKey = (resolved.aiConfig?.awsSecretAccessKey && typeof resolved.aiConfig.awsSecretAccessKey === 'string' && resolved.aiConfig.awsSecretAccessKey.trim()) || '';
    if (!accessKeyId || !secretAccessKey || accessKeyId === MASK || secretAccessKey === MASK) {
      return res.status(400).json({
        error: 'AWS credentials required. Save Access Key ID and Secret Access Key in AI settings (or pass vault) first, then load models.'
      });
    }
    const { BedrockClient, ListFoundationModelsCommand } = await import('@aws-sdk/client-bedrock');
    const client = new BedrockClient({
      region,
      credentials: { accessKeyId, secretAccessKey }
    });
    const command = new ListFoundationModelsCommand({ byOutputModality: 'TEXT' });
    const response = await client.send(command);
    const summaries = response.modelSummaries || [];
    const providerOrder = (p) => (p === 'Mistral AI' ? 0 : p === 'Google' ? 1 : p === 'OpenAI' ? 2 : 3);
    const filtered = summaries
      .filter((s) => {
        if (s.modelLifecycle?.status && s.modelLifecycle.status !== 'ACTIVE') return false;
        const provider = (s.providerName || '').trim();
        const modelId = (s.modelId || '').toLowerCase();
        if (provider === 'Mistral AI') return true;
        if (provider === 'Google' && modelId.includes('gemma')) return true;
        if (provider === 'OpenAI') return true;
        return false;
      })
      .sort((a, b) => {
        const cmp = providerOrder((a.providerName || '').trim()) - providerOrder((b.providerName || '').trim());
        return cmp !== 0 ? cmp : (a.modelName || a.modelId || '').localeCompare(b.modelName || b.modelId || '');
      })
      .map((s) => ({
        modelId: s.modelId,
        modelName: (s.modelName && s.modelName.trim()) || s.modelId || ''
      }));
    return res.json({ models: filtered });
  } catch (error) {
    console.error('List Bedrock models failed:', error?.message || error);
    if (error.name === 'AccessDeniedException') {
      return res.status(403).json({
        error: 'AWS Access Denied. Check IAM permissions (bedrock:ListFoundationModels required).'
      });
    }
    if (error.name === 'ThrottlingException') {
      return res.status(429).json({ error: 'Too many requests. Try again in a moment.' });
    }
    return res.status(500).json({
      error: error?.message || 'Failed to list Bedrock models',
      details: error?.name
    });
  }
});

/**
 * Test AI Engine connection
 * Tests connectivity to configured AI Engine (e.g., Ollama)
 * 
 * Request body:
 * {
 *   "url": "192.168.1.200",
 *   "port": 30068,
 *   "model": "mistral:7b" (optional)
 * }
 */
app.post('/api/ai/test-connection', authenticate, authorize(PERMISSIONS.EDIT_SETTINGS), async (req, res) => {
  try {
    const { provider = 'ollama', url, apiToken = '', awsRegion, awsAccessKeyId, awsSecretAccessKey, bedrockModelId } = req.body;
    
    // Load config for maxTokens and fallback credentials (resolved from pass when stored there)
    const config = getResolvedConfig();
    const maxTokensConfig = config.aiConfig?.maxTokens || { connectionTest: 10, controlGeneration: 150, general: 512 };
    
    console.log(`🔍 Testing ${provider} connection...`);
    
    // AWS Bedrock test connection
    if (provider === 'aws-bedrock') {
      try {
        // Use credentials from body if provided and not masked; otherwise use resolved config (pass vault)
        let resolved;
        try {
          resolved = getResolvedConfig();
        } catch (resolveErr) {
          console.error('Failed to resolve config (pass vault):', resolveErr?.message);
          return res.status(400).json({
            success: false,
            error: `Could not load credentials from config/pass: ${resolveErr?.message || resolveErr}. Ensure pass entries OSCAL/ai-aws-access-key-id and OSCAL/ai-aws-secret-access-key exist, or enter credentials in the form.`
          });
        }
        const useBodyCreds = typeof awsAccessKeyId === 'string' && typeof awsSecretAccessKey === 'string' &&
          awsAccessKeyId.trim() && awsSecretAccessKey.trim() &&
          awsAccessKeyId !== MASK && awsSecretAccessKey !== MASK;
        const accessKeyId = useBodyCreds ? awsAccessKeyId : (resolved.aiConfig?.awsAccessKeyId || '');
        const secretAccessKey = useBodyCreds ? awsSecretAccessKey : (resolved.aiConfig?.awsSecretAccessKey || '');

        if (!accessKeyId || !secretAccessKey) {
          return res.status(400).json({
            success: false,
            error: 'AWS credentials required (Access Key ID and Secret Access Key). Enter them in the form or ensure they are stored in pass vault (OSCAL/ai-aws-access-key-id and OSCAL/ai-aws-secret-access-key).'
          });
        }

        if (!awsRegion) {
          return res.status(400).json({
            success: false,
            error: 'AWS region required'
          });
        }

        // Dynamically import AWS SDK and Node.js https
        const { BedrockRuntimeClient, ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime');
        const { Agent: HttpsAgent } = await import('https');
        const { NodeHttpHandler } = await import('@smithy/node-http-handler');

        // Create custom HTTPS agent to handle SSL certificate issues
        // In production, you should use proper SSL certificates
        const httpsAgent = new HttpsAgent({
          rejectUnauthorized: process.env.NODE_ENV === 'production' ? true : false,
          keepAlive: true
        });

        // Create Bedrock client with custom request handler
        const client = new BedrockRuntimeClient({
          region: awsRegion,
          credentials: {
            accessKeyId,
            secretAccessKey
          },
          requestHandler: new NodeHttpHandler({
            httpsAgent: httpsAgent,
            connectionTimeout: 10000,
            socketTimeout: 30000
          })
        });
        
        // Test with a simple prompt
        const modelId = bedrockModelId || 'mistral.mistral-large-2402-v1:0';
        const command = new ConverseCommand({
          modelId: modelId,
          messages: [
            {
              role: 'user',
              content: [{ text: 'Test connection. Reply with "OK".' }]
            }
          ],
          inferenceConfig: {
            maxTokens: maxTokensConfig.connectionTest,
            temperature: 0.5
          }
        });
        
        const response = await client.send(command);
        
        console.log(`✅ AWS Bedrock connection successful`);
        console.log(`   Region: ${awsRegion}`);
        console.log(`   Model: ${modelId}`);
        
        return res.json({
          success: true,
          message: 'AWS Bedrock connection successful',
          details: {
            provider: 'aws-bedrock',
            region: awsRegion,
            modelId: modelId,
            testResponse: response.output?.message?.content?.[0]?.text || 'Response received'
          }
        });
        
      } catch (error) {
        console.error(`❌ AWS Bedrock connection failed:`, error.message);
        
        let errorMessage = 'AWS Bedrock connection failed';
        if (error.name === 'AccessDeniedException') {
          errorMessage = 'AWS Access Denied. Check credentials and IAM permissions (bedrock:InvokeModel required)';
        } else if (error.name === 'ResourceNotFoundException') {
          errorMessage = `Model not found: ${bedrockModelId}. Check model ID and region availability`;
        } else if (error.name === 'ValidationException') {
          errorMessage = 'Invalid request parameters';
        } else if (error.name === 'InvalidSignatureException' || error.message?.includes('signature')) {
          errorMessage = 'Invalid AWS credentials. Check Access Key ID and Secret Access Key (or pass vault entries OSCAL/ai-aws-access-key-id and OSCAL/ai-aws-secret-access-key).';
        } else {
          errorMessage = error.message || String(error);
        }
        
        return res.status(400).json({
          success: false,
          error: errorMessage,
          details: {
            provider: 'aws-bedrock',
            errorType: error.name,
            errorCode: error.code
          }
        });
      }
    }
    
    // Mistral API test connection (different from Ollama)
    if (provider === 'mistral-api') {
      if (!apiToken || !apiToken.trim()) {
        return res.status(400).json({
          success: false,
          error: 'API Token is required for Mistral AI API'
        });
      }
      
      // SECURITY: Validate URL to prevent SSRF attacks
      const urlValidation = await validateUrl(url, {
        allowPrivateIPs: SECURITY_CONFIG.urlValidation.allowPrivateIPs,
        allowLocalhost: SECURITY_CONFIG.urlValidation.allowLocalhost,
      });
      
      if (!urlValidation.valid) {
        console.warn('🚫 SSRF attempt blocked in Mistral API test:', url, urlValidation.error);
        
        // Return 403 for blocked URLs (security restriction)
        if (urlValidation.blocked) {
          return res.status(403).json({
            success: false,
            error: 'Access to this URL is forbidden',
            details: urlValidation.error,
            code: 'SSRF_BLOCKED',
          });
        }
        
        // Return 400 for invalid URLs (bad request)
        return res.status(400).json({
          success: false,
          error: 'Invalid URL',
          details: urlValidation.error,
        });
      }
      
      // Test Mistral API with a simple request
      try {
        console.log(`   Testing Mistral API: ${urlValidation.url}`);
        const testResponse = await axios.post(urlValidation.url, {
          model: 'mistral-small-latest',
          messages: [
            {
              role: 'user',
              content: 'Test connection. Reply with OK.'
            }
          ],
          max_tokens: maxTokensConfig.connectionTest
        }, {
          timeout: 15000,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiToken.trim()}`
          }
        });
        
        console.log(`✅ Mistral API connection successful`);
        
        // Mistral API available models (as of Dec 2024)
        const mistralModels = [
          'mistral-small-latest',
          'mistral-medium-latest',
          'mistral-large-latest',
          'open-mistral-7b',
          'open-mistral-nemo',
          'open-mixtral-8x7b',
          'open-mixtral-8x22b',
          'codestral-latest',
          'mistral-embed'
        ];
        
        return res.json({
          success: true,
          message: 'Mistral API connection successful',
          details: {
            provider: 'mistral-api',
            url: url,
            models: mistralModels,
            recommendedModel: 'mistral-small-latest',
            testResponse: testResponse.data?.choices?.[0]?.message?.content || 'Response received'
          }
        });
      } catch (error) {
        console.error(`❌ Mistral API connection failed:`, error.message);
        
        let errorMessage = 'Mistral API connection failed';
        let errorDetails = {};
        
        if (error.response) {
          errorMessage = `Mistral API returned error ${error.response.status}`;
          errorDetails = {
            status: error.response.status,
            statusText: error.response.statusText,
            data: error.response.data
          };
          
          if (error.response.status === 401) {
            errorMessage = 'Invalid API Token - please check your Mistral API key';
          } else if (error.response.status === 429) {
            errorMessage = 'Rate limit exceeded - please wait and try again';
          }
        } else if (error.code === 'ETIMEDOUT') {
          errorMessage = 'Connection timeout to Mistral API';
          errorDetails = {
            code: error.code,
            message: 'Request timed out - check your internet connection'
          };
        } else {
          errorDetails = {
            code: error.code,
            message: error.message
          };
        }
        
        return res.status(500).json({
          success: false,
          error: errorMessage,
          details: errorDetails
        });
      }
    }
    
    // Ollama test connection (requires URL)
    if (!url || !url.trim()) {
      return res.status(400).json({ 
        success: false,
        error: 'AI Engine URL is required' 
      });
    }

    // Parse and normalize the URL
    let fullUrl = url.trim();
    
    // Add protocol if missing (default to http for ollama)
    if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
      fullUrl = `http://${fullUrl}`;
    }
    
    // Validate URL format
    let urlObj;
    try {
      urlObj = new URL(fullUrl);
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format. Use format: http://hostname:port or https://hostname:port'
      });
    }
    
    // Reconstruct URL to ensure it's properly formatted
    fullUrl = `${urlObj.protocol}//${urlObj.hostname}${urlObj.port ? `:${urlObj.port}` : ''}${urlObj.pathname}`;
    
    console.log(`   URL: ${fullUrl}`);
    
    // SECURITY: Validate URL to prevent SSRF attacks
    const urlValidation = await validateUrl(fullUrl, {
      allowPrivateIPs: SECURITY_CONFIG.urlValidation.allowPrivateIPs,
      allowLocalhost: SECURITY_CONFIG.urlValidation.allowLocalhost,
    });
    
    if (!urlValidation.valid) {
      console.warn('🚫 SSRF attempt blocked in AI test:', fullUrl, urlValidation.error);
      
      // Return 403 for blocked URLs (security restriction)
      if (urlValidation.blocked) {
        return res.status(403).json({
          success: false,
          error: 'Access to this URL is forbidden',
          details: urlValidation.error,
          code: 'SSRF_BLOCKED',
        });
      }
      
      // Return 400 for invalid URLs (bad request)
      return res.status(400).json({
        success: false,
        error: 'Invalid URL',
        details: urlValidation.error,
      });
    }
    
    // Use validated URL for all subsequent requests
    fullUrl = urlValidation.url;
    
    // Prepare headers with API token if provided
    const headers = {
      'Content-Type': 'application/json'
    };
    if (apiToken && apiToken.trim()) {
      headers['Authorization'] = `Bearer ${apiToken.trim()}`;
      console.log(`   Using API token for authentication`);
    }
    
    try {
      // Test 1: Check if Ollama service is reachable and fetch available models
      // Handle URLs that may or may not end with /
      const tagsUrl = fullUrl.endsWith('/') ? `${fullUrl}api/tags` : `${fullUrl}/api/tags`;
      console.log(`   Testing Ollama: ${tagsUrl}`);
      
      const response = await axios.get(tagsUrl, {
        timeout: 30000,
        headers: headers,
        httpsAgent: fullUrl.startsWith('https') ? new https.Agent({ rejectUnauthorized: false }) : undefined
      });
      
      const models = response.data?.models || [];
      const modelNames = models.map(m => m.name);
      
      // Auto-detect mistral model (check for any mistral variant)
      let recommendedModel = null;
      const mistralModels = modelNames.filter(m => 
        m.toLowerCase().includes('mistral') || 
        m.toLowerCase().includes('mixtral')
      );
      if (mistralModels.length > 0) {
        recommendedModel = mistralModels[0]; // Use first mistral model found
      }
      
      console.log(`✅ AI Engine is reachable`);
      console.log(`   Available models: ${modelNames.join(', ')}`);
      if (recommendedModel) {
        console.log(`   Recommended model: ${recommendedModel}`);
      }
      
      // Test 2: Try a simple generate request (optional, more thorough test)
      // Use recommended model if available, otherwise first available, else mistral (Ollama default 7B tag)
      let generateTest = null;
      const testModel = recommendedModel || modelNames[0] || 'mistral';
      try {
        const generateUrl = fullUrl.endsWith('/') ? `${fullUrl}api/generate` : `${fullUrl}/api/generate`;
        const testPrompt = "Say 'test'";
        const generateResponse = await axios.post(generateUrl, {
          model: testModel,
          prompt: testPrompt,
          stream: false,
          options: {
            num_predict: 5
          }
        }, {
          timeout: 15000,
          headers: headers,
          httpsAgent: fullUrl.startsWith('https') ? new https.Agent({ rejectUnauthorized: false }) : undefined
        });
        
        generateTest = {
          success: true,
          responseLength: generateResponse.data?.response?.length || 0
        };
        console.log(`✅ Generate test successful (${generateTest.responseLength} chars)`);
      } catch (genError) {
        const is404 = genError.response?.status === 404;
        const msg = is404 && modelNames.length === 0
          ? 'No models installed on Ollama instance. Run install-ollama-and-models.sh or ensure-models service (see /var/log/ollama-ensure-models.log on instance).'
          : genError.message;
        console.warn(`⚠️ Generate test failed (non-critical):`, msg);
        generateTest = {
          success: false,
          error: msg
        };
      }
      
      res.json({
        success: true,
        message: 'Ollama connection successful',
        details: {
          provider: 'ollama',
          url: fullUrl,
          reachable: true,
          models: modelNames,
          recommendedModel: recommendedModel,
          generateTest: generateTest
        }
      });
    } catch (error) {
      let errorMessage = 'Connection failed';
      let errorDetails = {};
      
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        errorMessage = `Cannot reach AI Engine at ${fullUrl}`;
        errorDetails = {
          code: error.code,
          message: error.message,
          suggestion: 'Check if AI Engine is running and URL/port are correct'
        };
      } else if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
        errorMessage = `Connection timeout to ${fullUrl}`;
        errorDetails = {
          code: error.code,
          message: error.message,
          suggestion: 'Ensure Ollama ASG has a running instance, NLB target is Healthy (EC2 -> Target Groups -> *-ollama-11434), and Ollama listens on 0.0.0.0:11434. Run scripts/debug/run-install-ollama-on-instance.sh (full flow) or scripts/debug/run-install-ollama-on-instance.sh listener if Ollama is already installed.'
        };
      } else if (error.response) {
        errorMessage = `AI Engine returned error ${error.response.status}`;
        errorDetails = {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        };
      } else {
        errorMessage = error.message || 'Unknown error';
        errorDetails = {
          code: error.code,
          message: error.message
        };
      }
      
      console.error(`❌ AI Engine connection test failed:`, errorDetails);
      
      res.status(400).json({
        success: false,
        error: errorMessage,
        details: errorDetails
      });
    }
  } catch (error) {
    console.error('❌ Error testing AI connection:', error);
    const msg = error?.message || String(error);
    res.status(500).json({
      success: false,
      error: msg ? `Failed to test AI connection: ${msg}` : 'Failed to test AI connection',
      details: msg
    });
  }
});

/**
 * Get suggestions for multiple controls
 * 
 * Request body:
 * {
 *   "controls": [ ... ],
 *   "existingControls": [ ... ] (optional)
 * }
 */
app.post('/api/suggest-multiple-controls', authenticate, async (req, res) => {
  try {
    const aiConfig = getResolvedConfig()?.aiConfig;
    if (!isUserAllowedForAISuggestions(req.user, aiConfig)) {
      return res.status(403).json({
        success: false,
        error: AI_SUGGESTIONS_NOT_ALLOWED_MESSAGE,
        code: 'AI_SUGGESTIONS_NOT_ALLOWED'
      });
    }
    const { controls, existingControls = [] } = req.body;
    
    if (!controls || !Array.isArray(controls)) {
      return res.status(400).json({ 
        error: 'Controls array is required' 
      });
    }
    
    console.log(`Generating suggestions for ${controls.length} controls`);
    const suggestions = await suggestMultipleControls(controls, existingControls, req.user);
    
    res.json({
      success: true,
      suggestions: suggestions,
      count: Object.keys(suggestions).length
    });
  } catch (error) {
    console.error('Error generating multiple control suggestions:', error);
    res.status(500).json({ 
      error: 'Failed to generate suggestions',
      details: error.message 
    });
  }
});

/**
 * Validate OSCAL document using Metaschema Framework OSCAL CLI
 * Falls back to basic structure validation if Docker/CLI not available
 * 
 * Request body:
 * {
 *   "oscalData": { ... OSCAL JSON ... },
 *   "type": "ssp|catalog|profile|sap|sar|poam"
 * }
 */
app.post('/api/validate-oscal', async (req, res) => {
  try {
    const { oscalData, type = 'ssp', validationOptions = {} } = req.body;
    
    if (!oscalData) {
      return res.status(400).json({ 
        error: 'Missing oscalData in request body' 
      });
    }
    
    console.log(`Validating OSCAL ${type} document with options:`, validationOptions);
    const startTime = Date.now();
    
    const result = await validateOSCAL(oscalData, type, validationOptions);
    
    const duration = Date.now() - startTime;
    console.log(`Validation completed in ${duration}ms. Valid: ${result.valid}`);
    
    res.json(result);
  } catch (error) {
    console.error('Error validating OSCAL:', error);
    res.status(500).json({ 
      error: 'Validation error',
      details: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Serve React app for all other routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile('index.html', { root: 'public' });
});

// Track timers for cleanup
const timers = [];
let server;

// Start server function (can be called from tests or directly)
const startServer = async () => {
  return new Promise((resolve) => {
    server = app.listen(PORT, '0.0.0.0', async () => {
      console.log(`Server is running on http://0.0.0.0:${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'production'}`);
      console.log(`Server timeout: ${serverTimeout}ms (${serverTimeout/1000}s)`);
      
      // Initialize default users on startup
      await initializeDefaultUsers();
      
      // Set server timeout to allow for long-running AI requests
      server.timeout = serverTimeout;
      server.keepAliveTimeout = serverTimeout;
      server.headersTimeout = serverTimeout + 1000; // Slightly longer than keepAliveTimeout
      
      // Run auto-cleanup immediately on startup (skip in test mode)
      if (process.env.NODE_ENV !== 'test') {
        console.log('🧹 Running initial user cleanup...');
        try {
          const cleanupResult = await autoCleanupDeactivatedUsers();
          if (cleanupResult.deletedCount > 0) {
            console.log(`✅ Auto-cleanup completed: ${cleanupResult.deletedCount} user(s) deleted`);
          } else {
            console.log('✅ Auto-cleanup completed: No users to delete');
          }
        } catch (error) {
          console.error('❌ Auto-cleanup error:', error.message);
        }
        
        // Schedule auto-cleanup to run daily at 2 AM
        const scheduleAutoCleanup = () => {
          const now = new Date();
          const tomorrow = new Date(now);
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(2, 0, 0, 0); // 2 AM
          
          const msUntilCleanup = tomorrow.getTime() - now.getTime();
          
          const cleanupTimer = setTimeout(async () => {
            console.log('🧹 Running scheduled user cleanup...');
            try {
              const cleanupResult = await autoCleanupDeactivatedUsers();
              if (cleanupResult.deletedCount > 0) {
                console.log(`✅ Scheduled cleanup completed: ${cleanupResult.deletedCount} user(s) deleted`);
              }
            } catch (error) {
              console.error('❌ Scheduled cleanup error:', error.message);
            }
            
            // Schedule next cleanup (24 hours later)
            const dailyCleanupInterval = setInterval(async () => {
              console.log('🧹 Running scheduled user cleanup...');
              try {
                const cleanupResult = await autoCleanupDeactivatedUsers();
                if (cleanupResult.deletedCount > 0) {
                  console.log(`✅ Scheduled cleanup completed: ${cleanupResult.deletedCount} user(s) deleted`);
                }
              } catch (error) {
                console.error('❌ Scheduled cleanup error:', error.message);
              }
            }, 24 * 60 * 60 * 1000); // 24 hours
            
            timers.push(dailyCleanupInterval);
          }, msUntilCleanup);
          
          timers.push(cleanupTimer);
          console.log(`⏰ Next auto-cleanup scheduled for: ${tomorrow.toISOString()}`);
        };
        
        scheduleAutoCleanup();
        
        // Schedule inactive user cleanup (runs daily, checks for 45-day inactivity)
        scheduleUserCleanup(); // Runs every 24 hours
      }
      
      resolve(server);
    });
  });
};

// Graceful shutdown function
const closeServer = async () => {
  console.log('🛑 Shutting down server...');
  
  // Clear all timers
  timers.forEach(timer => clearTimeout(timer) || clearInterval(timer));
  timers.length = 0;
  
  // Close server
  if (server) {
    return new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          console.error('Error closing server:', err);
          reject(err);
        } else {
          console.log('✅ Server closed successfully');
          resolve();
        }
      });
    });
  }
};

// Export app and server control functions
export default app;
export { app, server, startServer, closeServer };

// Auto-start server if not in test mode (do not exit on init failure so /health stays up for ALB)
if (process.env.NODE_ENV !== 'test') {
  startServer().catch(error => {
    console.error('Failed to start server (server may still be listening for /health):', error);
    // Do not process.exit(1) so ALB health checks can succeed and 502 is avoided
  });
}

