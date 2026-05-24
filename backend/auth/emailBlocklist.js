/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { atomicWriteJSON } from '../utils/atomicWrite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BLOCKLIST_DIR = path.join(__dirname, '..', '..', 'config', 'app');
const BLOCKLIST_FILE = path.join(BLOCKLIST_DIR, 'email_blocklist.json');
const LEGACY_BLOCKLIST_FILE = path.join(BLOCKLIST_DIR, 'email_blacklist.json');

let legacyMigrationAttempted = false;

/**
 * Migrate legacy email_blacklist.json to email_blocklist.json once.
 */
async function migrateLegacyBlocklistFile() {
  if (legacyMigrationAttempted) return;
  legacyMigrationAttempted = true;

  if (fs.existsSync(BLOCKLIST_FILE) || !fs.existsSync(LEGACY_BLOCKLIST_FILE)) {
    return;
  }

  try {
    const legacyData = fs.readFileSync(LEGACY_BLOCKLIST_FILE, 'utf8');
    await atomicWriteJSON(BLOCKLIST_FILE, JSON.parse(legacyData));
    console.log('✅ Migrated legacy email_blacklist.json to email_blocklist.json');
  } catch (error) {
    console.error('❌ Error migrating legacy email blocklist file:', error);
  }
}

/**
 * Load email blocklist from file
 * @returns {Array} - Array of blocklisted email objects
 */
async function loadBlocklist() {
  try {
    if (!fs.existsSync(BLOCKLIST_DIR)) {
      fs.mkdirSync(BLOCKLIST_DIR, { recursive: true });
    }

    await migrateLegacyBlocklistFile();

    if (!fs.existsSync(BLOCKLIST_FILE)) {
      await atomicWriteJSON(BLOCKLIST_FILE, []);
      return [];
    }

    const data = fs.readFileSync(BLOCKLIST_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('❌ Error loading email blocklist:', error);
    return [];
  }
}

/**
 * Save email blocklist to file
 * @param {Array} blocklist - Blocklist array
 */
async function saveBlocklist(blocklist) {
  try {
    await atomicWriteJSON(BLOCKLIST_FILE, blocklist);
  } catch (error) {
    console.error('❌ Error saving email blocklist:', error);
    throw error;
  }
}

/**
 * Check if email is blocklisted
 * @param {string} email - Email address to check
 * @returns {Promise<Object|null>} - Blocklist entry if found and not expired, null otherwise
 */
export async function isEmailBlocklisted(email) {
  const blocklist = await loadBlocklist();
  const now = new Date();

  const entry = blocklist.find(item =>
    item.email.toLowerCase() === email.toLowerCase() &&
    new Date(item.expiresAt) > now
  );

  return entry || null;
}

/**
 * Add email to blocklist with 45-day expiry
 * @param {string} email - Email address to blocklist
 * @param {Date} deletedAt - When the user was deleted (defaults to now)
 * @returns {Promise<void>}
 */
export async function addToBlocklist(email, deletedAt = null) {
  const blocklist = await loadBlocklist();
  const now = new Date();
  const deleted = deletedAt ? new Date(deletedAt) : now;

  const expiresAt = new Date(deleted);
  expiresAt.setDate(expiresAt.getDate() + 45);

  const existingIndex = blocklist.findIndex(item =>
    item.email.toLowerCase() === email.toLowerCase()
  );

  if (existingIndex !== -1) {
    blocklist[existingIndex] = {
      email: email.toLowerCase(),
      deletedAt: deleted.toISOString(),
      expiresAt: expiresAt.toISOString(),
      reason: 'User deactivated due to 45-day inactivity'
    };
  } else {
    blocklist.push({
      email: email.toLowerCase(),
      deletedAt: deleted.toISOString(),
      expiresAt: expiresAt.toISOString(),
      reason: 'User deactivated due to 45-day inactivity'
    });
  }

  await saveBlocklist(blocklist);
  console.log(`✅ Email added to blocklist: ${email} (expires: ${expiresAt.toISOString()})`);
}

/**
 * Remove expired entries from blocklist
 * @returns {Promise<number>} - Number of entries removed
 */
export async function cleanupExpiredBlocklist() {
  const blocklist = await loadBlocklist();
  const now = new Date();

  const initialLength = blocklist.length;
  const activeBlocklist = blocklist.filter(item =>
    new Date(item.expiresAt) > now
  );

  const removedCount = initialLength - activeBlocklist.length;

  if (removedCount > 0) {
    await saveBlocklist(activeBlocklist);
    console.log(`✅ Removed ${removedCount} expired email(s) from blocklist`);
  }

  return removedCount;
}

/**
 * Get all blocklisted emails (for admin viewing)
 * @returns {Promise<Array>} - Array of blocklist entries
 */
export async function getAllBlocklisted() {
  return await loadBlocklist();
}

/**
 * Remove email from blocklist (manual override by admin)
 * @param {string} email - Email address to remove
 * @returns {Promise<boolean>} - True if removed, false if not found
 */
export async function removeFromBlocklist(email) {
  const blocklist = await loadBlocklist();
  const initialLength = blocklist.length;

  const updatedBlocklist = blocklist.filter(item =>
    item.email.toLowerCase() !== email.toLowerCase()
  );

  if (updatedBlocklist.length < initialLength) {
    await saveBlocklist(updatedBlocklist);
    console.log(`✅ Email removed from blocklist: ${email}`);
    return true;
  }

  return false;
}

export default {
  isEmailBlocklisted,
  addToBlocklist,
  cleanupExpiredBlocklist,
  getAllBlocklisted,
  removeFromBlocklist
};
