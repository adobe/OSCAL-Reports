/**
 * ExistingSSPUpload Component - Upload and load existing SSP JSON files
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license GPL-3.0-or-later
 */

import React, { useState } from 'react';
import './ExistingSSPUpload.css';

function ExistingSSPUpload({ onUpload, onSkip, loading }) {
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setError('');

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      if (droppedFile.type === 'application/json' || droppedFile.name.endsWith('.json')) {
        setFile(droppedFile);
      } else {
        setError('Please upload a JSON file');
      }
    }
  };

  const handleFileSelect = (e) => {
    setError('');
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (selectedFile.type === 'application/json' || selectedFile.name.endsWith('.json')) {
        setFile(selectedFile);
      } else {
        setError('Please upload a JSON file');
      }
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const sspData = JSON.parse(e.target.result);
          await onUpload(sspData);
        } catch (err) {
          setError('Invalid JSON file. Please upload a valid OSCAL SSP file.');
        }
      };
      reader.onerror = () => {
        setError('Failed to read file');
      };
      reader.readAsText(file);
    } catch (err) {
      setError('Failed to process file');
    }
  };

  return (
    <div className="existing-ssp-container">
      <div className="existing-ssp-card">
        <div className="card-header">
          <h2>📋 Load Existing Compliance Report (Optional)</h2>
          <p className="text-muted">
            Upload your existing OSCAL SSP to compare with the new catalog.
            We'll identify new and changed controls to help you update efficiently.
          </p>
        </div>

        <div className="upload-section">
          <div
            className={`drop-zone ${dragActive ? 'drag-active' : ''} ${file ? 'file-selected' : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {!file ? (
              <>
                <div className="upload-icon">📄</div>
                <p className="upload-text">Drag & drop your OSCAL SSP JSON file here</p>
                <p className="text-muted">or</p>
                <label htmlFor="file-upload" className="btn btn-secondary">
                  Browse Files
                </label>
                <input
                  id="file-upload"
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
              </>
            ) : (
              <>
                <div className="file-info">
                  <div className="file-icon">✓</div>
                  <div className="file-details">
                    <p className="file-name">{file.name}</p>
                    <p className="file-size">{(file.size / 1024).toFixed(2)} KB</p>
                  </div>
                  <button
                    className="btn-remove"
                    onClick={() => setFile(null)}
                    title="Remove file"
                  >
                    ✕
                  </button>
                </div>
              </>
            )}
          </div>

          {error && (
            <div className="error-message">
              <span className="error-icon">⚠️</span>
              {error}
            </div>
          )}

          <div className="info-box">
            <h4>ℹ️ What happens when you upload?</h4>
            <ul>
              <li><strong>New Controls:</strong> Highlighted in blue - controls added in the new catalog version</li>
              <li><strong>Changed Controls:</strong> Highlighted in yellow - controls with updated descriptions or requirements</li>
              <li><strong>Unchanged Controls:</strong> Auto-populated with your existing data</li>
            </ul>
            <p className="text-muted">
              This helps you focus on what's changed, saving you time when updating compliance reports.
            </p>
          </div>
        </div>

        <div className="button-group">
          <button
            className="btn btn-secondary"
            onClick={onSkip}
            disabled={loading}
          >
            Skip - Start Fresh
          </button>
          
          {file && (
            <button
              className="btn btn-primary"
              onClick={handleUpload}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Comparing...
                </>
              ) : (
                <>
                  <span>🔍</span>
                  Compare & Load
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ExistingSSPUpload;

