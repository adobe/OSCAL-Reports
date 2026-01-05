/**
 * SaveLoadPanel Component - Data persistence panel for save/load/clear operations
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license GPL-3.0-or-later
 */

import React, { useState, useEffect } from 'react';
import { 
  saveSSPData, 
  loadSSPData, 
  clearSSPData, 
  hasSavedData, 
  getLastSaveTime,
  formatBytes,
  getStorageSize
} from '../utils/storage';
import './SaveLoadPanel.css';

function SaveLoadPanel({ 
  onSave, 
  onLoad, 
  onClear, 
  hasUnsavedChanges, 
  catalogueLoaded,
  controlsCount 
}) {
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const [storageSize, setStorageSize] = useState(0);
  const [savedDataExists, setSavedDataExists] = useState(false);

  useEffect(() => {
    // Check for saved data on mount
    setSavedDataExists(hasSavedData());
    const time = getLastSaveTime();
    if (time) {
      setLastSaveTime(time);
    }
    setStorageSize(getStorageSize());
  }, []);

  const handleSave = () => {
    const success = onSave();
    if (success) {
      setLastSaveTime(new Date());
      setSavedDataExists(true);
      setStorageSize(getStorageSize());
    }
  };

  const handleLoad = () => {
    onLoad();
    setSavedDataExists(hasSavedData());
    const time = getLastSaveTime();
    if (time) {
      setLastSaveTime(time);
    }
  };

  const handleClear = () => {
    if (window.confirm('Are you sure you want to clear all saved data? This action cannot be undone.')) {
      onClear();
      setLastSaveTime(null);
      setSavedDataExists(false);
      setStorageSize(0);
    }
  };

  const formatTimeAgo = (date) => {
    if (!date) return '';
    
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
  };

  return (
    <div className="save-load-panel">
      <div className="panel-section">
        <h3>Data Management</h3>
        
        <div className="panel-buttons">
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!catalogueLoaded}
            title="Save your progress locally"
          >
            <span className="btn-icon">💾</span>
            Save Progress
          </button>

          <button
            className="btn btn-secondary"
            onClick={handleLoad}
            disabled={!savedDataExists}
            title="Load previously saved data"
          >
            <span className="btn-icon">📂</span>
            Load Saved Data
          </button>

          <button
            className="btn btn-danger"
            onClick={handleClear}
            disabled={!savedDataExists}
            title="Clear all saved data"
          >
            <span className="btn-icon">🗑️</span>
            Clear Data
          </button>
        </div>

        {hasUnsavedChanges && catalogueLoaded && (
          <div className="alert alert-warning">
            <span className="alert-icon">⚠️</span>
            You have unsaved changes
          </div>
        )}

        {lastSaveTime && (
          <div className="save-info">
            <div className="save-info-item">
              <span className="info-label">Last Saved:</span>
              <span className="info-value">
                {lastSaveTime.toLocaleString()} ({formatTimeAgo(lastSaveTime)})
              </span>
            </div>
            {controlsCount > 0 && (
              <div className="save-info-item">
                <span className="info-label">Controls:</span>
                <span className="info-value">{controlsCount}</span>
              </div>
            )}
            <div className="save-info-item">
              <span className="info-label">Storage Used:</span>
              <span className="info-value">{formatBytes(storageSize)}</span>
            </div>
          </div>
        )}

        {!savedDataExists && !catalogueLoaded && (
          <div className="info-message">
            <span className="info-icon">ℹ️</span>
            <span>No saved data found. Load a catalogue to begin.</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default SaveLoadPanel;

