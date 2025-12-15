/**
 * Local Storage Utilities - Persist SSP data across sessions
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license MIT
 */

const STORAGE_KEYS = {
  SSP_DATA: 'oscal_ssp_data',
  AUTO_SAVE_TIMESTAMP: 'oscal_ssp_autosave_time',
  SSP_HISTORY: 'oscal_ssp_history'
};

/**
 * Save SSP data to localStorage
 */
export const saveSSPData = (data) => {
  try {
    const dataToSave = {
      ...data,
      lastModified: new Date().toISOString(),
      version: '1.0'
    };
    
    const jsonData = JSON.stringify(dataToSave);
    
    // Check if data is too large (over 4MB to be safe)
    if (jsonData.length > 4 * 1024 * 1024) {
      console.warn('⚠️ Data too large for localStorage (' + (jsonData.length / 1024 / 1024).toFixed(2) + 'MB). Skipping auto-save.');
      return false;
    }
    
    localStorage.setItem(STORAGE_KEYS.SSP_DATA, jsonData);
    localStorage.setItem(STORAGE_KEYS.AUTO_SAVE_TIMESTAMP, new Date().toISOString());
    
    // Keep history of saves (last 10)
    saveToHistory(dataToSave);
    
    return true;
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      console.warn('⚠️ localStorage quota exceeded. Data is too large to auto-save. Please use manual export instead.');
    } else {
      console.error('Error saving SSP data:', error);
    }
    return false;
  }
};

/**
 * Load SSP data from localStorage
 */
export const loadSSPData = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.SSP_DATA);
    if (data) {
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error('Error loading SSP data:', error);
    return null;
  }
};

/**
 * Clear SSP data from localStorage
 */
export const clearSSPData = () => {
  try {
    localStorage.removeItem(STORAGE_KEYS.SSP_DATA);
    localStorage.removeItem(STORAGE_KEYS.AUTO_SAVE_TIMESTAMP);
    return true;
  } catch (error) {
    console.error('Error clearing SSP data:', error);
    return false;
  }
};

/**
 * Check if saved data exists
 */
export const hasSavedData = () => {
  return localStorage.getItem(STORAGE_KEYS.SSP_DATA) !== null;
};

/**
 * Get last save timestamp
 */
export const getLastSaveTime = () => {
  const timestamp = localStorage.getItem(STORAGE_KEYS.AUTO_SAVE_TIMESTAMP);
  return timestamp ? new Date(timestamp) : null;
};

/**
 * Save to history
 */
const saveToHistory = (data) => {
  try {
    const history = getHistory();
    const historyItem = {
      timestamp: new Date().toISOString(),
      systemName: data.systemInfo?.systemName || 'Unnamed System',
      controlsCount: data.controls?.length || 0
    };
    
    history.unshift(historyItem);
    
    // Keep only last 10 items
    const limitedHistory = history.slice(0, 10);
    
    localStorage.setItem(STORAGE_KEYS.SSP_HISTORY, JSON.stringify(limitedHistory));
  } catch (error) {
    console.error('Error saving to history:', error);
  }
};

/**
 * Get save history
 */
export const getHistory = () => {
  try {
    const history = localStorage.getItem(STORAGE_KEYS.SSP_HISTORY);
    return history ? JSON.parse(history) : [];
  } catch (error) {
    console.error('Error getting history:', error);
    return [];
  }
};

/**
 * Export SSP data as JSON file for backup
 */
export const exportBackup = () => {
  try {
    const data = loadSSPData();
    if (!data) {
      return null;
    }
    
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    });
    
    return blob;
  } catch (error) {
    console.error('Error exporting backup:', error);
    return null;
  }
};

/**
 * Import SSP data from backup file
 */
export const importBackup = (jsonData) => {
  try {
    const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    return saveSSPData(data);
  } catch (error) {
    console.error('Error importing backup:', error);
    return false;
  }
};

/**
 * Get storage size
 */
export const getStorageSize = () => {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.SSP_DATA);
    if (data) {
      return new Blob([data]).size;
    }
    return 0;
  } catch (error) {
    return 0;
  }
};

/**
 * Format bytes to human readable
 */
export const formatBytes = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

