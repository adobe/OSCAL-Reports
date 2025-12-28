/**
 * Atomic File Operations Utility
 * 
 * Provides crash-resistant file write operations using the atomic rename pattern.
 * 
 * @module atomicWrite
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright 2025 Mukesh Kesharwani
 * @license MIT
 * 
 * @description
 * This module implements atomic file writes using the following pattern:
 * 1. Write data to a temporary file (.tmp.{pid})
 * 2. Atomically rename temp file to target file
 * 
 * Why Atomic Writes?
 * - If crash occurs during write, temp file is corrupted, not main file
 * - If crash occurs during rename, old file is still valid
 * - rename() is atomic on Unix systems (single syscall)
 * - Prevents partial/corrupted data in production files
 * 
 * Use Cases:
 * - Configuration file saves (config.json)
 * - User data updates (users.json)
 * - State file persistence
 * - Any critical data that must not corrupt
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Atomically write data to a file
 * 
 * @param {string} filePath - Target file path
 * @param {string|Buffer|Object} data - Data to write (will be JSON.stringified if object)
 * @param {Object} options - Write options
 * @param {string} options.encoding - File encoding (default: 'utf8')
 * @param {number} options.spaces - JSON indentation spaces (default: 2)
 * @param {boolean} options.backup - Create backup of existing file (default: false)
 * @returns {Promise<void>}
 * @throws {Error} If write or rename fails
 * 
 * @example
 * // Write JSON object
 * await atomicWrite('/path/to/config.json', { setting: 'value' });
 * 
 * @example
 * // Write string with backup
 * await atomicWrite('/path/to/file.txt', 'content', { backup: true });
 */
async function atomicWrite(filePath, data, options = {}) {
  const {
    encoding = 'utf8',
    spaces = 2,
    backup = false
  } = options;

  // Convert object to JSON string if needed
  let content = data;
  if (typeof data === 'object' && data !== null && !Buffer.isBuffer(data)) {
    content = JSON.stringify(data, null, spaces);
  }

  // Create temp file path with process ID for uniqueness
  const tempFile = `${filePath}.tmp.${process.pid}`;
  
  try {
    // Optional: Create backup of existing file
    if (backup) {
      try {
        await fs.access(filePath);  // Check if file exists
        const backupFile = `${filePath}.backup`;
        await fs.copyFile(filePath, backupFile);
      } catch (err) {
        // File doesn't exist, no backup needed
      }
    }

    // Step 1: Write to temp file
    await fs.writeFile(tempFile, content, { encoding });

    // Step 2: Atomic rename (crash-resistant)
    await fs.rename(tempFile, filePath);

    // Success
    return;

  } catch (error) {
    // Cleanup: Remove temp file if it exists
    try {
      await fs.unlink(tempFile);
    } catch (cleanupError) {
      // Temp file already removed or doesn't exist
    }

    // Re-throw original error
    throw new Error(`Atomic write failed for ${filePath}: ${error.message}`);
  }
}

/**
 * Atomically write JSON data to a file
 * 
 * Convenience wrapper for atomicWrite with JSON formatting.
 * 
 * @param {string} filePath - Target file path
 * @param {Object} data - JavaScript object to write as JSON
 * @param {Object} options - Write options (same as atomicWrite)
 * @returns {Promise<void>}
 * @throws {Error} If data is not an object or write fails
 * 
 * @example
 * await atomicWriteJSON('/path/to/config.json', { 
 *   version: '1.0.0',
 *   settings: { theme: 'dark' }
 * });
 */
async function atomicWriteJSON(filePath, data, options = {}) {
  if (typeof data !== 'object' || data === null) {
    throw new Error('atomicWriteJSON requires an object');
  }
  return atomicWrite(filePath, data, options);
}

/**
 * Atomically read and update a JSON file
 * 
 * Performs atomic read-modify-write operation on a JSON file.
 * Uses a callback function to modify the data.
 * 
 * @param {string} filePath - Target file path
 * @param {Function} updateFn - Function that receives current data and returns updated data
 * @param {Object} options - Read/write options
 * @param {Object} options.defaultValue - Default value if file doesn't exist (default: {})
 * @param {boolean} options.backup - Create backup before write (default: false)
 * @returns {Promise<Object>} Updated data
 * @throws {Error} If read, update, or write fails
 * 
 * @example
 * // Increment a counter atomically
 * const updated = await atomicUpdate('/path/to/counter.json', (data) => {
 *   data.count = (data.count || 0) + 1;
 *   return data;
 * }, { defaultValue: { count: 0 } });
 */
async function atomicUpdate(filePath, updateFn, options = {}) {
  const {
    defaultValue = {},
    backup = false
  } = options;

  try {
    // Read current data
    let currentData;
    try {
      const content = await fs.readFile(filePath, 'utf8');
      currentData = JSON.parse(content);
    } catch (err) {
      // File doesn't exist or is invalid, use default
      currentData = defaultValue;
    }

    // Apply update function
    const updatedData = await updateFn(currentData);

    // Write updated data atomically
    await atomicWriteJSON(filePath, updatedData, { backup });

    return updatedData;

  } catch (error) {
    throw new Error(`Atomic update failed for ${filePath}: ${error.message}`);
  }
}

/**
 * Check if a file exists and is readable
 * 
 * @param {string} filePath - File path to check
 * @returns {Promise<boolean>} True if file exists and is readable
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely read JSON file with error handling
 * 
 * @param {string} filePath - File path to read
 * @param {Object} defaultValue - Default value if file doesn't exist or is invalid
 * @returns {Promise<Object>} Parsed JSON data or default value
 */
async function safeReadJSON(filePath, defaultValue = {}) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    return defaultValue;
  }
}

// Export functions
export {
  atomicWrite,
  atomicWriteJSON,
  atomicUpdate,
  fileExists,
  safeReadJSON
};

