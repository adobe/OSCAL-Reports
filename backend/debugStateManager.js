/**
 * Debug State Manager - Server-Side State Inspection
 * 
 * Provides server-side session state storage for debugging purposes.
 * State files are human-readable JSON for easy inspection with jq or text editors.
 * 
 * @module debugStateManager
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright 2025 Mukesh Kesharwani
 * @license MIT
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { atomicWriteJSON, safeReadJSON } from './utils/atomicWrite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STATE_DIR = path.join(__dirname, '../data/debug-state');
const MAX_STATE_FILES = 50; // Keep only last 50 state files
const STATE_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

// Enable/disable debug state (can be controlled via env var)
const DEBUG_STATE_ENABLED = process.env.DEBUG_STATE === 'true' || process.env.NODE_ENV === 'development';

/**
 * Initialize state storage directory
 */
function initStateStorage() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

/**
 * Save state snapshot
 * @param {string} sessionId - Session or request ID
 * @param {string} action - Action name (e.g., 'fetch-catalog', 'generate-ssp')
 * @param {Object} state - State object to save
 * @param {Object} metadata - Optional metadata (user, timestamp, etc.)
 * @returns {Promise<string|null>} State file path or null if disabled
 */
export async function saveState(sessionId, action, state, metadata = {}) {
  if (!DEBUG_STATE_ENABLED) {
    return null;
  }
  
  try {
    initStateStorage();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}_${sessionId}_${action}.json`;
    const filePath = path.join(STATE_DIR, filename);
    
    const stateSnapshot = {
      sessionId,
      action,
      timestamp: new Date().toISOString(),
      metadata,
      state
    };
    
    await atomicWriteJSON(filePath, stateSnapshot);
    
    // Cleanup old files asynchronously
    setImmediate(() => cleanupOldStates());
    
    return filePath;
  } catch (error) {
    console.error(`[DebugState] Failed to save state for ${sessionId}:`, error.message);
    return null;
  }
}

/**
 * Get state snapshot
 * @param {string} filename - State filename
 * @returns {Promise<Object|null>} State object or null
 */
export async function getState(filename) {
  try {
    const filePath = path.join(STATE_DIR, filename);
    return await safeReadJSON(filePath, null);
  } catch (error) {
    console.error(`[DebugState] Failed to load state ${filename}:`, error.message);
    return null;
  }
}

/**
 * List all state files
 * @param {Object} filters - Optional filters (sessionId, action, since)
 * @returns {Array} Array of state file info
 */
export function listStates(filters = {}) {
  try {
    initStateStorage();
    
    let files = fs.readdirSync(STATE_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const stats = fs.statSync(path.join(STATE_DIR, f));
        const parts = f.replace('.json', '').split('_');
        
        return {
          filename: f,
          timestamp: parts[0],
          sessionId: parts[1],
          action: parts.slice(2).join('_'),
          size: stats.size,
          created: stats.birthtime.toISOString()
        };
      });
    
    // Apply filters
    if (filters.sessionId) {
      files = files.filter(f => f.sessionId === filters.sessionId);
    }
    
    if (filters.action) {
      files = files.filter(f => f.action === filters.action);
    }
    
    if (filters.since) {
      const sinceDate = new Date(filters.since);
      files = files.filter(f => new Date(f.created) >= sinceDate);
    }
    
    // Sort by timestamp (newest first)
    files.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    
    return files;
  } catch (error) {
    console.error('[DebugState] Failed to list states:', error.message);
    return [];
  }
}

/**
 * Delete state file
 * @param {string} filename - State filename
 * @returns {boolean} Success status
 */
export function deleteState(filename) {
  try {
    const filePath = path.join(STATE_DIR, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`[DebugState] Failed to delete state ${filename}:`, error.message);
    return false;
  }
}

/**
 * Cleanup old state files
 * @returns {number} Number of files deleted
 */
export function cleanupOldStates() {
  try {
    initStateStorage();
    
    const files = fs.readdirSync(STATE_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: path.join(STATE_DIR, f),
        stats: fs.statSync(path.join(STATE_DIR, f))
      }));
    
    const now = Date.now();
    let deletedCount = 0;
    
    // Delete files older than retention period
    files.forEach(file => {
      const age = now - file.stats.birthtimeMs;
      if (age > STATE_RETENTION_MS) {
        fs.unlinkSync(file.path);
        deletedCount++;
      }
    });
    
    // Keep only MAX_STATE_FILES most recent files
    const remainingFiles = fs.readdirSync(STATE_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => ({
        name: f,
        path: path.join(STATE_DIR, f),
        stats: fs.statSync(path.join(STATE_DIR, f))
      }))
      .sort((a, b) => b.stats.birthtimeMs - a.stats.birthtimeMs);
    
    if (remainingFiles.length > MAX_STATE_FILES) {
      const toDelete = remainingFiles.slice(MAX_STATE_FILES);
      toDelete.forEach(file => {
        fs.unlinkSync(file.path);
        deletedCount++;
      });
    }
    
    if (deletedCount > 0) {
      console.log(`[DebugState] Cleaned up ${deletedCount} old state files`);
    }
    
    return deletedCount;
  } catch (error) {
    console.error('[DebugState] Failed to cleanup states:', error.message);
    return 0;
  }
}

/**
 * Get debug state statistics
 * @returns {Object} Statistics
 */
export function getStateStats() {
  try {
    initStateStorage();
    
    const files = fs.readdirSync(STATE_DIR).filter(f => f.endsWith('.json'));
    const totalSize = files.reduce((sum, f) => {
      const stats = fs.statSync(path.join(STATE_DIR, f));
      return sum + stats.size;
    }, 0);
    
    return {
      enabled: DEBUG_STATE_ENABLED,
      fileCount: files.length,
      totalSize,
      totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
      storageDir: STATE_DIR,
      maxFiles: MAX_STATE_FILES,
      retentionHours: STATE_RETENTION_MS / (60 * 60 * 1000)
    };
  } catch (error) {
    console.error('[DebugState] Failed to get stats:', error.message);
    return {
      enabled: DEBUG_STATE_ENABLED,
      error: error.message
    };
  }
}

/**
 * Middleware to capture request state automatically
 * @param {Object} options - Options (enabled, actions)
 * @returns {Function} Express middleware
 */
export function debugStateMiddleware(options = {}) {
  const { enabled = DEBUG_STATE_ENABLED, actions = [] } = options;
  
  return async (req, res, next) => {
    if (!enabled) {
      return next();
    }
    
    // Only capture state for specified actions or all if empty
    const action = req.path.split('/').filter(Boolean).join('-');
    
    if (actions.length > 0 && !actions.includes(action)) {
      return next();
    }
    
    // Capture request state
    const requestState = {
      method: req.method,
      path: req.path,
      query: req.query,
      body: req.body,
      headers: {
        'content-type': req.get('content-type'),
        'user-agent': req.get('user-agent')
      },
      user: req.user ? {
        id: req.user.id,
        username: req.user.username,
        role: req.user.role
      } : null,
      ip: req.ip
    };
    
    const sessionId = req.session?.id || req.get('x-session-id') || 'anonymous';
    
    await saveState(sessionId, action, requestState, {
      type: 'request',
      userId: req.user?.id
    });
    
    next();
  };
}

// Auto-cleanup every hour
setInterval(cleanupOldStates, 60 * 60 * 1000);

// Initialize on module load
if (DEBUG_STATE_ENABLED) {
  initStateStorage();
  console.log('[DebugState] Debug state manager initialized (ENABLED)');
} else {
  console.log('[DebugState] Debug state manager initialized (DISABLED - set DEBUG_STATE=true to enable)');
}

