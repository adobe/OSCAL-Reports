/**
 * User Management System
 * Handles user CRUD operations and authentication
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { ROLES, isValidRole } from './roles.js';
import { generateDefaultPasswordFromEnv } from './passwordGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Users file path: prioritize config/app/users.json, fallback to backend/auth/users.json for compatibility
const CONFIG_DIR = path.join(__dirname, '..', '..', 'config', 'app');
const USERS_FILE = path.join(CONFIG_DIR, 'users.json');
const LEGACY_USERS_FILE = path.join(__dirname, 'users.json');

// In-memory sessions (can be upgraded to Redis/database)
const sessions = new Map();

/**
 * FIPS 140-2 Compliant Password Hashing using PBKDF2
 * Uses PBKDF2 with SHA-256, random salt, and 100,000 iterations
 * Format: pbkdf2$sha256$iterations$salt$hash
 * 
 * @param {string} password - Plain text password
 * @param {string} salt - Optional salt (if not provided, generates random salt)
 * @returns {string} - Hashed password in format: pbkdf2$sha256$iterations$salt$hash
 */
function hashPassword(password, salt = null) {
  const ITERATIONS = 100000; // FIPS 140-2 recommended minimum
  const KEY_LENGTH = 32; // 32 bytes = 256 bits
  const DIGEST = 'sha256'; // FIPS-approved hash algorithm
  
  // Generate random salt if not provided (16 bytes = 128 bits)
  if (!salt) {
    salt = crypto.randomBytes(16).toString('hex');
  }
  
  // Derive key using PBKDF2 (FIPS-approved key derivation function)
  const hash = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH, DIGEST);
  const hashHex = hash.toString('hex');
  
  // Return in format: pbkdf2$sha256$iterations$salt$hash
  return `pbkdf2$${DIGEST}$${ITERATIONS}$${salt}$${hashHex}`;
}

/**
 * Verify password against stored hash
 * Supports both old SHA-256 format and new PBKDF2 format for backward compatibility
 * 
 * @param {string} password - Plain text password to verify
 * @param {string} storedHash - Stored password hash
 * @returns {boolean} - True if password matches
 */
function verifyPassword(password, storedHash) {
  if (!storedHash) {
    return false;
  }
  
  // Check if it's new PBKDF2 format: pbkdf2$sha256$iterations$salt$hash
  if (storedHash.startsWith('pbkdf2$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 5 || parts[0] !== 'pbkdf2') {
      return false;
    }
    
    const digest = parts[1];
    const iterations = parseInt(parts[2], 10);
    const salt = parts[3];
    const storedHashValue = parts[4];
    
    // Verify using PBKDF2
    const keyLength = storedHashValue.length / 2; // Hex string length / 2 = bytes
    const hash = crypto.pbkdf2Sync(password, salt, iterations, keyLength, digest);
    const hashHex = hash.toString('hex');
    
    return hashHex === storedHashValue;
  }
  
  // Legacy SHA-256 format (for backward compatibility during migration)
  const legacyHash = crypto.createHash('sha256').update(password).digest('hex');
  return legacyHash === storedHash;
}

/**
 * Check if a password hash is in the old SHA-256 format
 * @param {string} hash - Password hash to check
 * @returns {boolean} - True if it's old format
 */
function isLegacyPasswordHash(hash) {
  return hash && !hash.startsWith('pbkdf2$') && hash.length === 64; // SHA-256 hex is 64 chars
}

/**
 * Migrate legacy SHA-256 password to PBKDF2 format
 * Note: This requires the plain password, so it's only used during login
 * 
 * @param {string} username - Username
 * @param {string} plainPassword - Plain text password
 * @returns {boolean} - True if migration was successful
 */
function migratePasswordToPBKDF2(username, plainPassword) {
  const users = loadUsers();
  const userIndex = users.findIndex(u => u.username === username);
  
  if (userIndex === -1) {
    return false;
  }
  
  const user = users[userIndex];
  
  // Only migrate if it's legacy format
  if (isLegacyPasswordHash(user.password)) {
    // Verify old password first
    if (verifyPassword(plainPassword, user.password)) {
      // Hash with new PBKDF2 format
      user.password = hashPassword(plainPassword);
      user.updatedAt = new Date().toISOString();
      saveUsers(users);
      console.log(`✅ Migrated password for user ${username} to FIPS 140-2 compliant PBKDF2 format`);
      return true;
    }
  }
  
  return false;
}

/**
 * Generate session token
 * @returns {string}
 */
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate random alphanumeric password
 * @param {number} length - Password length (default: 12)
 * @returns {string} - Generated password
 */
export function generatePassword(length = 12) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * Validate email format
 * @param {string} email - Email address
 * @returns {boolean} - True if valid email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Load users from file
 * @returns {Array}
 */
function loadUsers() {
  try {
    // Ensure config directory exists
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    
    // Try primary location first (config/app/users.json)
    let usersPath = USERS_FILE;
    if (!fs.existsSync(USERS_FILE)) {
      // Fallback to legacy location (backend/auth/users.json)
      if (fs.existsSync(LEGACY_USERS_FILE)) {
        console.log('📝 Found legacy users file, migrating to config/app/users.json...');
        usersPath = LEGACY_USERS_FILE;
        // Will migrate after reading
      } else {
        return [];
      }
    }

    const data = fs.readFileSync(usersPath, 'utf-8');
    const users = JSON.parse(data);
    
    // Migrate legacy users file to new location
    if (usersPath === LEGACY_USERS_FILE) {
      console.log('📦 Migrating users to config/app/users.json...');
      saveUsers(users);
      // Optionally remove legacy file after successful migration
      try {
        fs.unlinkSync(LEGACY_USERS_FILE);
        console.log('✅ Legacy users file removed');
      } catch (err) {
        console.warn('⚠️ Could not remove legacy users file:', err.message);
      }
    }
    
    return users;
  } catch (error) {
    console.error('Error loading users:', error);
  }
  return [];
}

/**
 * Save users to file
 * @param {Array} users - Users array
 */
function saveUsers(users) {
  try {
    // Ensure config directory exists
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
      console.log(`📁 Created config directory: ${CONFIG_DIR}`);
    }
    
    // Check if directory is writable
    try {
      fs.accessSync(CONFIG_DIR, fs.constants.W_OK);
    } catch (err) {
      console.error(`❌ Config directory is not writable: ${CONFIG_DIR}`);
      console.error(`   Error: ${err.message}`);
      // Try legacy location as fallback
      console.log(`   Attempting to use legacy location: ${LEGACY_USERS_FILE}`);
      fs.writeFileSync(LEGACY_USERS_FILE, JSON.stringify(users, null, 2));
      return;
    }
    
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
    console.log(`💾 Saved ${users.length} users to ${USERS_FILE}`);
  } catch (error) {
    console.error('Error saving users:', error);
    throw error;
  }
}

/**
 * Check if a password hash matches old default password format
 * Old passwords: admin123, user123, assessor123
 */
function isOldDefaultPassword(username, passwordHash) {
  const oldPasswords = {
    'admin': 'admin123',
    'user': 'user123',
    'assessor': 'assessor123'
  };
  
  if (oldPasswords[username]) {
    // Check against legacy SHA-256 format
    const legacyHash = crypto.createHash('sha256').update(oldPasswords[username]).digest('hex');
    return passwordHash === legacyHash;
  }
  return false;
}

/**
 * Migrate default users to new password format
 * Always updates default users' passwords to use the new timestamp format
 */
function migrateDefaultUsersToNewPasswordFormat() {
  const users = loadUsers();
  const defaultUsernames = ['admin', 'user', 'assessor'];
  let updated = false;
  const updatedPasswords = {};
  
  for (const user of users) {
    if (defaultUsernames.includes(user.username)) {
      // Reactivate default users if they were deactivated
      if (!user.isActive) {
        user.isActive = true;
        delete user.deactivatedAt; // Remove deactivation timestamp
        console.log(`🔄 Reactivated ${user.username} user`);
        updated = true;
      }
      
      // Only update password if it's in old format (not PBKDF2) or if BUILD_TIMESTAMP is set
      // This prevents passwords from changing on every server restart in development
      const isOldFormat = !user.password.startsWith('pbkdf2$');
      const hasBuildTimestamp = !!process.env.BUILD_TIMESTAMP;
      
      if (isOldFormat || hasBuildTimestamp) {
        // Update password only if:
        // 1. Password is in old format (needs migration), OR
        // 2. BUILD_TIMESTAMP is set (production build - should use build timestamp)
        const newPassword = generateDefaultPasswordFromEnv(user.username);
        user.password = hashPassword(newPassword);
        user.updatedAt = new Date().toISOString();
        updated = true;
        updatedPasswords[user.username] = newPassword;
        console.log(`🔄 Updated ${user.username} password to new timestamp format: ${newPassword}`);
      } else {
        // Password is already in PBKDF2 format and no BUILD_TIMESTAMP
        // Don't change it in development to avoid password rotation issues
        console.log(`ℹ️  ${user.username} password already in PBKDF2 format, skipping update (development mode)`);
      }
    }
  }
  
  if (updated) {
    saveUsers(users);
    console.log('✅ Default users updated to new password format');
    console.log('📝 New passwords (format: username#$DDMMYYHH):');
    Object.entries(updatedPasswords).forEach(([username, password]) => {
      console.log(`   - ${username}: ${password}`);
    });
  }
  
  return updated;
}

/**
 * Initialize default users if none exist
 */
export function initializeDefaultUsers() {
  try {
    console.log('🔐 Initializing default users...');
    console.log(`   Config directory: ${CONFIG_DIR}`);
    console.log(`   Users file: ${USERS_FILE}`);
    
    const users = loadUsers();
    console.log(`   Found ${users.length} existing users`);
    
    if (users.length === 0) {
      console.log('📝 No users found, creating default users...');
      // Generate passwords using build timestamp format: username#$DDMMYYHH
      const adminPassword = generateDefaultPasswordFromEnv('admin');
      const userPassword = generateDefaultPasswordFromEnv('user');
      const assessorPassword = generateDefaultPasswordFromEnv('assessor');
      
      console.log(`   Generated passwords:`);
      console.log(`   - admin: ${adminPassword}`);
      console.log(`   - user: ${userPassword}`);
      console.log(`   - assessor: ${assessorPassword}`);
      
      const defaultUsers = [
      {
        id: crypto.randomUUID(),
        username: 'admin',
        password: hashPassword(adminPassword),
        email: 'admin@example.com',
        role: ROLES.PLATFORM_ADMIN,
        fullName: 'Platform Administrator',
        createdAt: new Date().toISOString(),
        isActive: true
      },
      {
        id: crypto.randomUUID(),
        username: 'user',
        password: hashPassword(userPassword),
        email: 'user@example.com',
        role: ROLES.USER,
        fullName: 'Standard User',
        createdAt: new Date().toISOString(),
        isActive: true
      },
      {
        id: crypto.randomUUID(),
        username: 'assessor',
        password: hashPassword(assessorPassword),
        email: 'assessor@example.com',
        role: ROLES.ASSESSOR,
        fullName: 'Security Assessor',
        createdAt: new Date().toISOString(),
        isActive: true
      }
    ];
    
      saveUsers(defaultUsers);
      console.log('✅ Default users initialized:');
      console.log(`   - admin / ${adminPassword} (Platform Admin)`);
      console.log(`   - user / ${userPassword} (User)`);
      console.log(`   - assessor / ${assessorPassword} (Assessor)`);
    } else {
      // Check if existing default users need password migration and reactivation
      console.log('🔄 Checking for password migration...');
      try {
        migrateDefaultUsersToNewPasswordFormat();
      } catch (err) {
        console.error('❌ Error migrating default users:', err);
        console.error('   Stack:', err.stack);
      }
    }
  } catch (error) {
    console.error('❌ Critical error initializing default users:', error);
    console.error('   Stack:', error.stack);
    console.error(`   Config directory: ${CONFIG_DIR}`);
    console.error(`   Users file: ${USERS_FILE}`);
    // Don't throw - allow server to start even if user init fails
    // Users can be created manually via API if needed
  }
}

/**
 * Authenticate user
 * @param {string} username - Username
 * @param {string} password - Password
 * @returns {Object|null} - User object with session token or null
 */
export function authenticateUser(username, password) {
  const users = loadUsers();
  
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔍 Authentication attempt for username: ${username}`);
    console.log(`   Total users loaded: ${users.length}`);
  }
  
  // Find user by username first
  const userByUsername = users.find(u => u.username === username);
  
  if (!userByUsername) {
    console.log(`❌ User not found: ${username}`);
    return null;
  }
  
  console.log(`✅ User found: ${username}`);
  console.log(`   User ID: ${userByUsername.id}`);
  console.log(`   Is Active: ${userByUsername.isActive}`);
  console.log(`   Role: ${userByUsername.role}`);
  console.log(`   Password format: ${userByUsername.password.startsWith('pbkdf2$') ? 'PBKDF2 (FIPS 140-2)' : 'Legacy SHA-256'}`);
  
  // Verify password (supports both old and new formats)
  if (!verifyPassword(password, userByUsername.password)) {
    console.log(`❌ Password mismatch for user: ${username}`);
    return null;
  }
  
  // Migrate legacy password to PBKDF2 if needed (during successful login)
  if (isLegacyPasswordHash(userByUsername.password)) {
    console.log(`🔄 Migrating legacy password to FIPS 140-2 compliant format for user: ${username}`);
    migratePasswordToPBKDF2(username, password);
  }
  
  // Check if active
  if (!userByUsername.isActive) {
    console.log(`❌ User is inactive: ${username}`);
    return null;
  }
  
  console.log(`✅ All checks passed for user: ${username}`);
  
  // Generate session token
  const sessionToken = generateSessionToken();
  const sessionData = {
    userId: userByUsername.id,
    username: userByUsername.username,
    role: userByUsername.role,
    email: userByUsername.email,
    fullName: userByUsername.fullName,
    createdAt: Date.now()
  };
  
  sessions.set(sessionToken, sessionData);
  
  // Return user without password
  const { password: _, ...userWithoutPassword } = userByUsername;
  return {
    ...userWithoutPassword,
    sessionToken
  };
}

/**
 * Validate session token
 * @param {string} token - Session token
 * @returns {Object|null} - Session data or null
 */
export function validateSession(token) {
  if (!token) return null;
  
  const session = sessions.get(token);
  
  if (!session) return null;
  
  // Check if session is expired (24 hours)
  const sessionAge = Date.now() - session.createdAt;
  if (sessionAge > 24 * 60 * 60 * 1000) {
    sessions.delete(token);
    return null;
  }
  
  return session;
}

/**
 * Logout user
 * @param {string} token - Session token
 */
export function logout(token) {
  sessions.delete(token);
}

/**
 * Get all users (without passwords)
 * @returns {Array}
 */
export function getAllUsers() {
  const users = loadUsers();
  return users.map(({ password: _, ...user }) => user);
}

/**
 * Get user by ID
 * @param {string} userId - User ID
 * @returns {Object|null}
 */
export function getUserById(userId) {
  const users = loadUsers();
  const user = users.find(u => u.id === userId);
  if (user) {
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
  return null;
}

/**
 * Create new user
 * @param {Object} userData - User data
 * @param {string} generatedPassword - Optional generated password (if not provided, will be generated)
 * @returns {Object} - Created user with plain password for sending
 */
export function createUser(userData, generatedPassword = null) {
  const users = loadUsers();
  
  // Validate username is email format
  if (!isValidEmail(userData.username)) {
    throw new Error('Username must be a valid email address');
  }
  
  // Validate email format
  if (!isValidEmail(userData.email)) {
    throw new Error('Email must be a valid email address');
  }
  
  // Ensure username and email match
  if (userData.username !== userData.email) {
    throw new Error('Username and Email must match');
  }
  
  // Check if username already exists
  if (users.find(u => u.username === userData.username)) {
    throw new Error('Username already exists');
  }
  
  // Check if email already exists
  if (users.find(u => u.email === userData.email)) {
    throw new Error('Email already exists');
  }
  
  // Validate role
  if (!isValidRole(userData.role)) {
    throw new Error('Invalid role');
  }
  
  // Generate password if not provided
  const password = generatedPassword || userData.password || generatePassword(12);
  
  const newUser = {
    id: crypto.randomUUID(),
    username: userData.username,
    password: hashPassword(password),
    email: userData.email,
    role: userData.role,
    fullName: userData.fullName || userData.username.split('@')[0],
    createdAt: new Date().toISOString(),
    isActive: true
  };
  
  users.push(newUser);
  saveUsers(users);
  
  const { password: _, ...userWithoutPassword } = newUser;
  
  // Return user with plain password for sending
  return {
    ...userWithoutPassword,
    plainPassword: password // Include plain password for sending via email/Slack
  };
}

/**
 * Update user
 * @param {string} userId - User ID
 * @param {Object} updates - Updates to apply
 * @returns {Object} - Updated user
 */
export function updateUser(userId, updates) {
  const users = loadUsers();
  const userIndex = users.findIndex(u => u.id === userId);
  
  if (userIndex === -1) {
    throw new Error('User not found');
  }
  
  // Check for username conflicts
  if (updates.username && users.find(u => u.username === updates.username && u.id !== userId)) {
    throw new Error('Username already exists');
  }
  
  // Check for email conflicts
  if (updates.email && users.find(u => u.email === updates.email && u.id !== userId)) {
    throw new Error('Email already exists');
  }
  
  // Validate role if being updated
  if (updates.role && !isValidRole(updates.role)) {
    throw new Error('Invalid role');
  }
  
  // Hash password if being updated
  if (updates.password) {
    updates.password = hashPassword(updates.password);
  }
  
  // Track deactivation timestamp
  const wasActive = users[userIndex].isActive;
  const isNowActive = updates.isActive !== undefined ? updates.isActive : wasActive;
  
  // If user is being deactivated, set deactivatedAt timestamp
  if (wasActive && !isNowActive) {
    updates.deactivatedAt = new Date().toISOString();
  }
  
  // If user is being reactivated, clear deactivatedAt
  if (!wasActive && isNowActive) {
    updates.deactivatedAt = undefined;
  }
  
  users[userIndex] = {
    ...users[userIndex],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  
  // Remove undefined fields
  if (users[userIndex].deactivatedAt === undefined) {
    delete users[userIndex].deactivatedAt;
  }
  
  saveUsers(users);
  
  const { password: _, ...userWithoutPassword } = users[userIndex];
  return userWithoutPassword;
}

// Default usernames that should never be deleted
const DEFAULT_USERNAMES = ['admin', 'user', 'assessor'];

/**
 * Check if user is a default user
 * @param {Object} user - User object
 * @returns {boolean}
 */
function isDefaultUser(user) {
  return DEFAULT_USERNAMES.includes(user.username);
}

/**
 * Deactivate user (soft delete - set isActive to false)
 * @param {string} userId - User ID
 */
export function deactivateUser(userId) {
  const users = loadUsers();
  const userIndex = users.findIndex(u => u.id === userId);
  
  if (userIndex === -1) {
    throw new Error('User not found');
  }
  
  // Don't allow deactivating the last admin
  const activeAdmins = users.filter(u => u.role === ROLES.PLATFORM_ADMIN && u.isActive);
  if (users[userIndex].role === ROLES.PLATFORM_ADMIN && activeAdmins.length === 1) {
    throw new Error('Cannot deactivate the last Platform Admin');
  }
  
  users[userIndex].isActive = false;
  users[userIndex].deactivatedAt = new Date().toISOString();
  
  saveUsers(users);
}

/**
 * Delete user (soft delete - set isActive to false)
 * @param {string} userId - User ID
 */
export function deleteUser(userId) {
  // For backward compatibility, this now calls deactivateUser
  deactivateUser(userId);
}

/**
 * Hard delete user (permanently remove from system)
 * @param {string} userId - User ID
 * @param {boolean} force - Force delete without 45-day check (for auto-cleanup)
 * @returns {Object} - Result object with success status and message
 */
export function hardDeleteUser(userId, force = false) {
  const users = loadUsers();
  const userIndex = users.findIndex(u => u.id === userId);
  
  if (userIndex === -1) {
    throw new Error('User not found');
  }
  
  const user = users[userIndex];
  
  // Never allow deletion of default users
  if (isDefaultUser(user)) {
    throw new Error('Cannot delete default system users (admin, user, assessor)');
  }
  
  // Check if user is active
  if (user.isActive && !force) {
    throw new Error('Cannot delete active user. Please deactivate the user first.');
  }
  
  // Check 45-day requirement if not forced (for auto-cleanup)
  if (!force && user.deactivatedAt) {
    const deactivatedDate = new Date(user.deactivatedAt);
    const daysSinceDeactivation = Math.floor((Date.now() - deactivatedDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysSinceDeactivation < 45) {
      const daysRemaining = 45 - daysSinceDeactivation;
      throw new Error(`User can only be deleted after 45 days of deactivation. ${daysRemaining} day(s) remaining.`);
    }
  }
  
  // Remove user from array
  users.splice(userIndex, 1);
  saveUsers(users);
  
  return {
    success: true,
    message: `User ${user.username} permanently deleted`,
    deletedUser: { username: user.username, email: user.email }
  };
}

/**
 * Auto-cleanup: Delete users deactivated for 90+ days (except default users)
 * @returns {Object} - Result object with deleted users count
 */
export function autoCleanupDeactivatedUsers() {
  const users = loadUsers();
  const now = Date.now();
  const ninetyDaysInMs = 90 * 24 * 60 * 60 * 1000;
  
  const deletedUsers = [];
  const remainingUsers = users.filter(user => {
    // Skip default users
    if (isDefaultUser(user)) {
      return true;
    }
    
    // Skip active users
    if (user.isActive) {
      return true;
    }
    
    // Check if deactivated for 90+ days
    if (user.deactivatedAt) {
      const deactivatedDate = new Date(user.deactivatedAt);
      const daysSinceDeactivation = now - deactivatedDate.getTime();
      
      if (daysSinceDeactivation >= ninetyDaysInMs) {
        deletedUsers.push({
          username: user.username,
          email: user.email,
          deactivatedAt: user.deactivatedAt,
          daysDeactivated: Math.floor(daysSinceDeactivation / (1000 * 60 * 60 * 24))
        });
        return false; // Remove this user
      }
    }
    
    return true; // Keep this user
  });
  
  if (deletedUsers.length > 0) {
    saveUsers(remainingUsers);
    console.log(`🧹 Auto-cleanup: Deleted ${deletedUsers.length} user(s) deactivated for 90+ days`);
    deletedUsers.forEach(u => {
      console.log(`   - ${u.username} (${u.email}) - deactivated for ${u.daysDeactivated} days`);
    });
  }
  
  return {
    success: true,
    deletedCount: deletedUsers.length,
    deletedUsers: deletedUsers
  };
}

/**
 * Get days since deactivation for a user
 * @param {string} userId - User ID
 * @returns {number|null} - Days since deactivation or null if not deactivated
 */
export function getDaysSinceDeactivation(userId) {
  const users = loadUsers();
  const user = users.find(u => u.id === userId);
  
  if (!user || !user.deactivatedAt) {
    return null;
  }
  
  const deactivatedDate = new Date(user.deactivatedAt);
  return Math.floor((Date.now() - deactivatedDate.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Change user password
 * @param {string} userId - User ID
 * @param {string} oldPassword - Old password
 * @param {string} newPassword - New password
 */
export function changePassword(userId, oldPassword, newPassword) {
  const users = loadUsers();
  const userIndex = users.findIndex(u => u.id === userId);
  
  if (userIndex === -1) {
    throw new Error('User not found');
  }
  
  // Verify old password (supports both legacy and PBKDF2 formats)
  if (!verifyPassword(oldPassword, users[userIndex].password)) {
    throw new Error('Invalid old password');
  }
  
  // Hash new password with PBKDF2 (FIPS 140-2 compliant)
  users[userIndex].password = hashPassword(newPassword);
  users[userIndex].passwordChangedAt = new Date().toISOString();
  users[userIndex].updatedAt = new Date().toISOString();
  
  saveUsers(users);
}

export default {
  initializeDefaultUsers,
  authenticateUser,
  validateSession,
  logout,
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  deactivateUser,
  hardDeleteUser,
  autoCleanupDeactivatedUsers,
  getDaysSinceDeactivation,
  changePassword
};

