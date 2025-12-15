/**
 * SaveLoadBar Component - Auto-save indicator and manual save/load controls
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license MIT
 */

import React, { useState, useEffect } from 'react';
import { 
  hasSavedData, 
  getLastSaveTime, 
  clearSSPData, 
  exportBackup,
  formatBytes,
  getStorageSize 
} from '../utils/storage';
import './SaveLoadBar.css';

function SaveLoadBar({ onLoadData, onClearData, lastSaveTime, autoSaveEnabled }) {
  const [showMenu, setShowMenu] = useState(false);
  const [storageSize, setStorageSize] = useState(0);

  useEffect(() => {
    setStorageSize(getStorageSize());
  }, [lastSaveTime]);

  const handleClearData = () => {
    if (window.confirm('Are you sure you want to clear all saved data? This action cannot be undone.')) {
      clearSSPData();
      onClearData();
      setShowMenu(false);
    }
  };

  const handleExportBackup = () => {
    const blob = exportBackup();
    if (blob) {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ssp-backup-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      window.URL.revokeObjectURL(url);
    }
  };

  const handleImportBackup = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (window.confirm('Import this backup? Your current data will be replaced.')) {
            onLoadData(data);
            setShowMenu(false);
          }
        } catch (error) {
          alert('Invalid backup file format');
        }
      };
      reader.readAsText(file);
    }
    // Reset input
    event.target.value = '';
  };

  const formatLastSave = (date) => {
    if (!date) return 'Never';
    const now = new Date();
    const diff = now - date;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="save-load-bar">
      <div className="save-status">
        {autoSaveEnabled && (
          <>
            <span className="save-indicator">
              <span className="pulse-dot"></span>
              Auto-save enabled
            </span>
            {lastSaveTime && (
              <span className="last-save-time">
                Last saved: {formatLastSave(lastSaveTime)}
              </span>
            )}
          </>
        )}
      </div>

      <div className="save-actions">
        <button 
          className="btn-save-menu" 
          onClick={() => setShowMenu(!showMenu)}
          title="Data Management"
        >
          💾 Data
        </button>

        {showMenu && (
          <div className="save-menu-dropdown">
            <div className="save-menu-header">
              <h4>Data Management</h4>
              <button 
                className="close-menu" 
                onClick={() => setShowMenu(false)}
              >
                ×
              </button>
            </div>

            <div className="save-menu-content">
              <div className="storage-info">
                <span className="storage-label">Storage used:</span>
                <span className="storage-value">{formatBytes(storageSize)}</span>
              </div>

              <div className="menu-actions">
                {hasSavedData() && (
                  <>
                    <button 
                      className="menu-action-btn"
                      onClick={() => { onLoadData(); setShowMenu(false); }}
                    >
                      <span className="action-icon">📂</span>
                      <span>Load Saved Data</span>
                    </button>

                    <button 
                      className="menu-action-btn"
                      onClick={handleExportBackup}
                    >
                      <span className="action-icon">📥</span>
                      <span>Export Backup</span>
                    </button>

                    <label className="menu-action-btn" htmlFor="import-backup">
                      <span className="action-icon">📤</span>
                      <span>Import Backup</span>
                      <input
                        id="import-backup"
                        type="file"
                        accept=".json"
                        onChange={handleImportBackup}
                        style={{ display: 'none' }}
                      />
                    </label>

                    <button 
                      className="menu-action-btn danger"
                      onClick={handleClearData}
                    >
                      <span className="action-icon">🗑️</span>
                      <span>Clear All Data</span>
                    </button>
                  </>
                )}

                {!hasSavedData() && (
                  <div className="no-data-message">
                    <p>No saved data found</p>
                    <label className="menu-action-btn" htmlFor="import-backup-empty">
                      <span className="action-icon">📤</span>
                      <span>Import Backup</span>
                      <input
                        id="import-backup-empty"
                        type="file"
                        accept=".json"
                        onChange={handleImportBackup}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>
                )}
              </div>

              <div className="save-menu-footer">
                <small>Data is stored locally in your browser</small>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SaveLoadBar;

