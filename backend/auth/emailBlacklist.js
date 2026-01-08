/**
 * Email Blacklist Manager
 * Manages blocked email addresses with 45-day cooldown period
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

// Blacklist file path
const BLACKLIST_DIR = path.join(__dirname, '..', '..', 'config', 'app');
const BLACKLIST_FILE = path.join(BLACKLIST_DIR, 'email_blacklist.json');

/**
 * Load email blacklist from file
 * @returns {Array} - Array of blacklisted email objects
 */
async function loadBlacklist() {
  try {
    // Ensure directory exists
    if (!fs.existsSync(BLACKLIST_DIR)) {
      fs.mkdirSync(BLACKLIST_DIR, { recursive: true });
    }
    
    // Create file if it doesn't exist
    if (!fs.existsSync(BLACKLIST_FILE)) {
      await atomicWriteJSON(BLACKLIST_FILE, []);
      return [];
    }
    
    const data = fs.readFileSync(BLACKLIST_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('❌ Error loading email blacklist:', error);
    return [];
  }
}

/**
 * Save email blacklist to file
 * @param {Array} blacklist - Blacklist array
 */
async function saveBlacklist(blacklist) {
  try {
    await atomicWriteJSON(BLACKLIST_FILE, blacklist);
  } catch (error) {
    console.error('❌ Error saving email blacklist:', error);
    throw error;
  }
}

/**
 * Check if email is blacklisted
 * @param {string} email - Email address to check
 * @returns {Promise<Object|null>} - Blacklist entry if found and not expired, null otherwise
 */
export async function isEmailBlacklisted(email) {
  const blacklist = await loadBlacklist();
  const now = new Date();
  
  const entry = blacklist.find(item => 
    item.email.toLowerCase() === email.toLowerCase() &&
    new Date(item.expiresAt) > now
  );
  
  return entry || null;
}

/**
 * Add email to blacklist with 45-day expiry
 * @param {string} email - Email address to blacklist
 * @param {Date} deletedAt - When the user was deleted (defaults to now)
 * @returns {Promise<void>}
 */
export async function addToBlacklist(email, deletedAt = null) {
  const blacklist = await loadBlacklist();
  const now = new Date();
  const deleted = deletedAt ? new Date(deletedAt) : now;
  
  // Calculate expiry date (45 days from deletion)
  const expiresAt = new Date(deleted);
  expiresAt.setDate(expiresAt.getDate() + 45);
  
  // Check if email already in blacklist
  const existingIndex = blacklist.findIndex(item => 
    item.email.toLowerCase() === email.toLowerCase()
  );
  
  if (existingIndex !== -1) {
    // Update existing entry
    blacklist[existingIndex] = {
      email: email.toLowerCase(),
      deletedAt: deleted.toISOString(),
      expiresAt: expiresAt.toISOString(),
      reason: 'User deactivated due to 45-day inactivity'
    };
  } else {
    // Add new entry
    blacklist.push({
      email: email.toLowerCase(),
      deletedAt: deleted.toISOString(),
      expiresAt: expiresAt.toISOString(),
      reason: 'User deactivated due to 45-day inactivity'
    });
  }
  
  await saveBlacklist(blacklist);
  console.log(`✅ Email added to blacklist: ${email} (expires: ${expiresAt.toISOString()})`);
}

/**
 * Remove expired entries from blacklist
 * @returns {Promise<number>} - Number of entries removed
 */
export async function cleanupExpiredBlacklist() {
  const blacklist = await loadBlacklist();
  const now = new Date();
  
  const initialLength = blacklist.length;
  const activeBlacklist = blacklist.filter(item => 
    new Date(item.expiresAt) > now
  );
  
  const removedCount = initialLength - activeBlacklist.length;
  
  if (removedCount > 0) {
    await saveBlacklist(activeBlacklist);
    console.log(`✅ Removed ${removedCount} expired email(s) from blacklist`);
  }
  
  return removedCount;
}

/**
 * Get all blacklisted emails (for admin viewing)
 * @returns {Promise<Array>} - Array of blacklist entries
 */
export async function getAllBlacklisted() {
  return await loadBlacklist();
}

/**
 * Remove email from blacklist (manual override by admin)
 * @param {string} email - Email address to remove
 * @returns {Promise<boolean>} - True if removed, false if not found
 */
export async function removeFromBlacklist(email) {
  const blacklist = await loadBlacklist();
  const initialLength = blacklist.length;
  
  const updatedBlacklist = blacklist.filter(item => 
    item.email.toLowerCase() !== email.toLowerCase()
  );
  
  if (updatedBlacklist.length < initialLength) {
    await saveBlacklist(updatedBlacklist);
    console.log(`✅ Email removed from blacklist: ${email}`);
    return true;
  }
  
  return false;
}

export default {
  isEmailBlacklisted,
  addToBlacklist,
  cleanupExpiredBlacklist,
  getAllBlacklisted,
  removeFromBlacklist
};

