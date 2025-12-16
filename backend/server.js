/**
 * OSCAL SOA/SSP/CCM Generator - Backend Server
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license MIT
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
import { loadConfig, saveConfig, validateConfig } from './configManager.js';
import { suggestControlImplementation, suggestMultipleControls } from './controlSuggestionEngine.js';
import { checkMistralAvailability, loadMistralConfig } from './mistralService.js';
import { addIntegrityHash, verifyIntegrityHash, getIntegrityInfo } from './integrityService.js';
import { 
  initializeDefaultUsers, 
  authenticateUser, 
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

const app = express();
const PORT = process.env.PORT || 3020;

// Set server timeout to 240 seconds (4 minutes) to allow for AI processing
// This is longer than the AI service timeout (180s) to account for overhead
const serverTimeout = 240000; // 240 seconds

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static files from the public folder (warning page for backend)
app.use(express.static('public'));

// Health check endpoint for Docker
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', service: 'Keekar\'s OSCAL SOA/SSP/CCM Generator' });
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
app.get('/api/auth/default-credentials', (req, res) => {
  try {
    // Get actual users to determine their password timestamps
    const users = getAllUsers();
    
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
    const legacyUsersFile = path.join(process.cwd(), 'backend', 'auth', 'users.json');
    
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
      legacyUsersFile: {
        path: legacyUsersFile,
        exists: fs.existsSync(legacyUsersFile)
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
 * Login endpoint
 */
app.post('/api/auth/login', (req, res) => {
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
    
    const user = authenticateUser(username, password);
    
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
app.post('/api/auth/change-password', authenticate, (req, res) => {
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
    
    changePassword(req.user.userId, oldPassword, newPassword);
    
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
app.get('/api/users', authenticate, requireRole(ROLES.PLATFORM_ADMIN), (req, res) => {
  try {
    const users = getAllUsers();
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
 * Get user by ID
 */
app.get('/api/users/:userId', authenticate, requireRole(ROLES.PLATFORM_ADMIN), (req, res) => {
  try {
    const user = getUserById(req.params.userId);
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
    const newUser = createUser({ username, email, role, fullName }, generatedPassword);
    
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
app.delete('/api/users/:userId', authenticate, requireRole(ROLES.PLATFORM_ADMIN), (req, res) => {
  try {
    const result = hardDeleteUser(req.params.userId, false);
    
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
app.get('/api/users/:userId/deactivation-info', authenticate, requireRole(ROLES.PLATFORM_ADMIN), (req, res) => {
  try {
    const daysSinceDeactivation = getDaysSinceDeactivation(req.params.userId);
    const user = getUserById(req.params.userId);
    
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
 */
app.get('/api/sso/config', authenticate, requireRole(ROLES.PLATFORM_ADMIN), (req, res) => {
  try {
    const config = loadConfig();
    const ssoConfig = config.ssoConfig || {
      saml: { enabled: false },
      oauth: { enabled: false }
    };
    
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
 */
app.post('/api/sso/config', authenticate, requireRole(ROLES.PLATFORM_ADMIN), (req, res) => {
  try {
    const ssoConfig = req.body;
    const currentConfig = loadConfig();
    
    currentConfig.ssoConfig = ssoConfig;
    const success = saveConfig(currentConfig);
    
    if (success) {
      console.log(`✅ SSO config saved by ${req.user.username}`);
      res.json({ 
        success: true,
        message: 'SSO configuration saved successfully' 
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to save SSO configuration' 
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
 */
app.post('/api/sso/test', authenticate, requireRole(ROLES.PLATFORM_ADMIN), async (req, res) => {
  try {
    const { provider, config } = req.body;
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔍 Testing ${provider} SSO connection...`);
    }
    
    // This is a placeholder - actual implementation would test the connection
    // For now, just validate that required fields are present
    let isValid = false;
    let errors = [];
    
    if (provider === 'SAML') {
      isValid = config.idpEntityId && config.idpSsoUrl && config.spEntityId;
      if (!config.idpEntityId) errors.push('Missing IdP Entity ID');
      if (!config.idpSsoUrl) errors.push('Missing IdP SSO URL');
      if (!config.spEntityId) errors.push('Missing SP Entity ID');
    } else {
      // OAuth providers
      const providerName = provider.toLowerCase().replace(' ', '');
      isValid = config.providers && config.providers[providerName]?.clientId;
      if (!isValid) errors.push('Missing client configuration');
    }
    
    if (isValid) {
      console.log(`✅ ${provider} test successful`);
      res.json({ 
        success: true,
        message: `${provider} configuration appears valid` 
      });
    } else {
      console.log(`❌ ${provider} test failed:`, errors);
      res.json({ 
        success: false,
        error: errors.join(', ') 
      });
    }
  } catch (error) {
    console.error('❌ SSO test error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * Fetch SAML metadata from URL
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
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`📥 Fetching SAML metadata from: ${metadataUrl}`);
    }
    
    // Create HTTPS agent with certificate validation disabled
    const httpsAgent = new https.Agent({
      rejectUnauthorized: false
    });
    
    const response = await axios.get(metadataUrl, {
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
    const { emailConfig } = req.body;
    
    if (!emailConfig) {
      return res.status(400).json({ 
        success: false,
        error: 'Email configuration is required' 
      });
    }
    
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
    const { slackConfig } = req.body;
    
    if (!slackConfig) {
      return res.status(400).json({ 
        success: false,
        error: 'Slack configuration is required' 
      });
    }
    
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

// Settings Management Endpoints (Server-side persistence)
// Get current settings (all authenticated users can view)
app.get('/api/settings', optionalAuth, (req, res) => {
  try {
    const config = loadConfig();
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
app.post('/api/settings', authenticate, authorize(PERMISSIONS.EDIT_SETTINGS), (req, res) => {
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
      // Explicitly include publishedSoaUrl (even if empty string)
      publishedSoaUrl: incomingConfig.publishedSoaUrl !== undefined 
        ? incomingConfig.publishedSoaUrl 
        : existingConfig.publishedSoaUrl || ''
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
    
    // Save configuration
    const success = saveConfig(newConfig);
    
    if (success) {
      console.log('✅ Settings saved successfully');
      const savedConfig = loadConfig();
      console.log('✅ Verified saved publishedSoaUrl:', savedConfig.publishedSoaUrl);
      console.log('✅ Full saved config:', JSON.stringify(savedConfig, null, 2));
      res.json({ 
        success: true,
        message: 'Settings saved successfully',
        config: savedConfig
      });
    } else {
      console.error('❌ Failed to save config');
      res.status(500).json({ 
        error: 'Failed to save settings' 
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
app.post('/api/proxy-fetch', async (req, res) => {
  const { url, method = 'GET', headers = {} } = req.body;
  
  if (!url) {
    return res.status(400).json({ 
      success: false, 
      error: 'URL is required' 
    });
  }

  // Validate URL
  try {
    new URL(url);
  } catch (e) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid URL format' 
    });
  }

  console.log(`[API Proxy] Fetching from: ${url}`);
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
      url: url,
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
app.post('/api/fetch-catalogue', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const response = await axios.get(url, {
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

// Generate OSCAL SSP
app.post('/api/generate-ssp', async (req, res) => {
  try {
    const { metadata, controls, systemInfo } = req.body;
    
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
    const sspMetadata = metadata ? JSON.parse(JSON.stringify(metadata)) : {};
    
    // Override with SSP-specific values
    sspMetadata.title = systemInfo.title || metadata?.title || "System Security Plan";
    sspMetadata["last-modified"] = new Date().toISOString();
    sspMetadata.version = systemInfo.version || metadata?.version || "1.0";
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
    if (systemInfo.assessorDetails) {
      const assessorUuid = uuidv4();
      
      // Create party for assessor
      const assessorParty = {
        uuid: assessorUuid,
        type: "organization",
        name: systemInfo.assessorDetails,
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
      
      // Preserve remarks if available
      if (metadata.remarks) {
        sspMetadata.remarks = metadata.remarks;
      }
    }
    // Don't add empty roles/parties arrays - they can cause oneOf validation errors

    const ssp = {
      "system-security-plan": {
        uuid: uuidv4(),
        metadata: sspMetadata,
        "import-profile": {
          href: systemInfo.catalogueUrl || "#"
        },
        "system-characteristics": {
          "system-ids": [
            {
              id: systemInfo.systemId || uuidv4()
            }
          ],
          "system-name": systemInfo.systemName || "System Name",
          description: systemInfo.description || "System Description",
          "security-sensitivity-level": systemInfo.securityLevel || "moderate",
          ...((() => {
            // Build props array, only include if not empty
            const propsArray = [
              ...(systemInfo.organization ? [{
                name: "organization",
                value: systemInfo.organization
              }] : []),
              ...(systemInfo.systemOwner ? [{
                name: "system-owner",
                value: systemInfo.systemOwner
              }] : []),
              // assessorDetails now in metadata.responsible-parties with role-id: "prepared-by"
              ...(systemInfo.cspIaaS ? [{
                name: "csp-iaas",
                value: systemInfo.cspIaaS
              }] : []),
              ...(systemInfo.cspPaaS ? [{
                name: "csp-paas",
                value: systemInfo.cspPaaS
              }] : []),
              ...(systemInfo.cspSaaS ? [{
                name: "csp-saas",
                value: systemInfo.cspSaaS
              }] : [])
            ];
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
                  base: systemInfo.confidentiality || "moderate"
                },
                "integrity-impact": {
                  base: systemInfo.integrity || "moderate"
                },
                "availability-impact": {
                  base: systemInfo.availability || "moderate"
                }
              }
            ]
          },
          "security-impact-level": {
            "security-objective-confidentiality": systemInfo.confidentiality || "moderate",
            "security-objective-integrity": systemInfo.integrity || "moderate",
            "security-objective-availability": systemInfo.availability || "moderate"
          },
          status: {
            state: systemInfo.status || "under-development"
          },
          "authorization-boundary": {
            description: systemInfo.authorizationBoundary || "System authorization boundary description"
          }
        },
        "system-implementation": {
          description: (() => {
            // Combine system description and CSP provider details
            let implDesc = systemInfo.description || "System implementation description";
            
            const cspDetails = [];
            if (systemInfo.cspIaaS) cspDetails.push(`IaaS: ${systemInfo.cspIaaS}`);
            if (systemInfo.cspPaaS) cspDetails.push(`PaaS: ${systemInfo.cspPaaS}`);
            if (systemInfo.cspSaaS) cspDetails.push(`SaaS: ${systemInfo.cspSaaS}`);
            
            if (cspDetails.length > 0) {
              implDesc += `\n\nCloud Service Providers: ${cspDetails.join(', ')}`;
            }
            
            return implDesc;
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
              "control-id": control.id,
              description: control.implementation || control.description || "Not documented"
            };
            
            // Preserve catalog props and add implementation props
            const catalogProps = control.props || [];
            const implementationProps = [
              {
                name: "implementation-status",
                value: control.status || "planned"
              },
              {
                name: "catalog-control-title",
                value: control.title || ""
              },
              {
                name: "catalog-control-description",
                value: control.description || ""
              }
            ];
            
            // Add custom fields as props (OSCAL-compliant way)
            const customFieldsMapping = {
              'responsibleParty': 'responsible-party',
              'controlOwner': 'control-owner',
              'consumerGuidance': 'consumer-guidance',
              'implementationDate': 'implementation-date',
              'reviewDate': 'review-date',
              'nextReviewDate': 'next-review-date',
              'controlType': 'control-type',
              'evidence': 'evidence',
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
            Object.keys(customFieldsMapping).forEach(field => {
              if (control[field] !== undefined && control[field] !== '') {
                customProps.push({
                  name: customFieldsMapping[field],
                  value: typeof control[field] === 'object' ? JSON.stringify(control[field]) : String(control[field])
                });
              }
            });
            
            implementedReq.props = [...catalogProps, ...implementationProps, ...customProps];
            
            // Preserve catalog params if they exist
            if (control.params && control.params.length > 0) {
              implementedReq.params = control.params;
            }
            
            // Preserve or create parts structure
            if (control.parts && control.parts.length > 0) {
              implementedReq.parts = control.parts;
            }
            
            // Add statements if present
            if (control.statements && control.statements.length > 0) {
              implementedReq.statements = control.statements;
            }
            
            // Add implementation remarks
            if (control.remarks) {
              implementedReq.remarks = control.remarks;
            }
            
            // Preserve class if present
            if (control.class) {
              implementedReq.class = control.class;
            }
            
            return implementedReq;
          })
        }
      }
    };

    // Add FIPS 140-2 compliant integrity hash before returning
    try {
      console.log('🔐 Attempting to add integrity hash to SSP...');
      console.log('📊 SSP structure check:', {
        hasSSP: !!ssp['system-security-plan'],
        hasMetadata: !!ssp['system-security-plan']?.metadata,
        hasProps: !!ssp['system-security-plan']?.metadata?.props,
        propsCount: ssp['system-security-plan']?.metadata?.props?.length || 0
      });
      
      const sspWithIntegrity = addIntegrityHash(ssp);
      
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
      res.json(ssp);
    }
  } catch (error) {
    console.error('Error generating SSP:', error.message);
    res.status(500).json({ 
      error: 'Failed to generate SSP',
      details: error.message 
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
app.post('/api/suggest-control', authenticate, async (req, res) => {
  try {
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
    const suggestions = await suggestControlImplementation(control, existingControls);
    
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
 * Check Mistral 7B availability and configuration
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
    
    console.log(`🔍 Testing ${provider} connection...`);
    
    // AWS Bedrock test connection
    if (provider === 'aws-bedrock') {
      try {
        // Dynamically import AWS SDK and Node.js https
        const { BedrockRuntimeClient, ConverseCommand } = await import('@aws-sdk/client-bedrock-runtime');
        const { Agent: HttpsAgent } = await import('https');
        const { NodeHttpHandler } = await import('@smithy/node-http-handler');
        
        if (!awsAccessKeyId || !awsSecretAccessKey) {
          return res.status(400).json({
            success: false,
            error: 'AWS credentials required (Access Key ID and Secret Access Key)'
          });
        }
        
        if (!awsRegion) {
          return res.status(400).json({
            success: false,
            error: 'AWS region required'
          });
        }
        
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
            accessKeyId: awsAccessKeyId,
            secretAccessKey: awsSecretAccessKey
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
            maxTokens: 10,
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
        } else {
          errorMessage = error.message;
        }
        
        return res.status(500).json({
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
    
    // Ollama or Mistral API test connection (requires URL)
    if (!url || !url.trim()) {
      return res.status(400).json({ 
        success: false,
        error: 'AI Engine URL is required' 
      });
    }

    // Parse and normalize the URL
    let fullUrl = url.trim();
    
    // Add protocol if missing (default to http for ollama, https for mistral-api)
    if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
      fullUrl = provider === 'mistral-api' ? `https://${fullUrl}` : `http://${fullUrl}`;
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
    
    // Prepare headers with API token if provided
    const headers = {
      'Content-Type': 'application/json'
    };
    if (apiToken && apiToken.trim()) {
      headers['Authorization'] = `Bearer ${apiToken.trim()}`;
      console.log(`   Using API token for authentication`);
    }
    
    try {
      // Test 1: Check if service is reachable and fetch available models
      // Handle URLs that may or may not end with /
      const tagsUrl = fullUrl.endsWith('/') ? `${fullUrl}api/tags` : `${fullUrl}/api/tags`;
      console.log(`   Testing: ${tagsUrl}`);
      
      const response = await axios.get(tagsUrl, {
        timeout: 10000,
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
      // Use recommended model if available, otherwise use first available model
      let generateTest = null;
      const testModel = recommendedModel || modelNames[0] || 'mistral:7b';
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
        console.warn(`⚠️ Generate test failed (non-critical):`, genError.message);
        generateTest = {
          success: false,
          error: genError.message
        };
      }
      
      res.json({
        success: true,
        message: 'AI Engine connection successful',
        details: {
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
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = `Connection timeout to ${fullUrl}`;
        errorDetails = {
          code: error.code,
          message: error.message,
          suggestion: 'AI Engine may be overloaded or network is slow'
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
    res.status(500).json({
      success: false,
      error: 'Failed to test AI connection',
      details: error.message
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
    const { controls, existingControls = [] } = req.body;
    
    if (!controls || !Array.isArray(controls)) {
      return res.status(400).json({ 
        error: 'Controls array is required' 
      });
    }
    
    console.log(`Generating suggestions for ${controls.length} controls`);
    const suggestions = await suggestMultipleControls(controls, existingControls);
    
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

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on http://0.0.0.0:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'production'}`);
  console.log(`Server timeout: ${serverTimeout}ms (${serverTimeout/1000}s)`);
  
  // Initialize default users on startup
  initializeDefaultUsers();
  
  // Set server timeout to allow for long-running AI requests
  server.timeout = serverTimeout;
  server.keepAliveTimeout = serverTimeout;
  server.headersTimeout = serverTimeout + 1000; // Slightly longer than keepAliveTimeout
  
  // Run auto-cleanup immediately on startup
  console.log('🧹 Running initial user cleanup...');
  try {
    const cleanupResult = autoCleanupDeactivatedUsers();
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
    
    setTimeout(() => {
      console.log('🧹 Running scheduled user cleanup...');
      try {
        const cleanupResult = autoCleanupDeactivatedUsers();
        if (cleanupResult.deletedCount > 0) {
          console.log(`✅ Scheduled cleanup completed: ${cleanupResult.deletedCount} user(s) deleted`);
        }
      } catch (error) {
        console.error('❌ Scheduled cleanup error:', error.message);
      }
      
      // Schedule next cleanup (24 hours later)
      setInterval(() => {
        console.log('🧹 Running scheduled user cleanup...');
        try {
          const cleanupResult = autoCleanupDeactivatedUsers();
          if (cleanupResult.deletedCount > 0) {
            console.log(`✅ Scheduled cleanup completed: ${cleanupResult.deletedCount} user(s) deleted`);
          }
        } catch (error) {
          console.error('❌ Scheduled cleanup error:', error.message);
        }
      }, 24 * 60 * 60 * 1000); // 24 hours
    }, msUntilCleanup);
    
    console.log(`⏰ Next auto-cleanup scheduled for: ${tomorrow.toISOString()}`);
  };
  
  scheduleAutoCleanup();
});

