/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import React, { useState } from 'react';
import { getSupportedCatalogueSummary } from '../catalogues/sampleCatalogues.js';
import './InitialChoice.css';

function InitialChoice({ onLoadExisting, onStartFresh, loading }) {
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

  const handleLoadExisting = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const sspData = JSON.parse(e.target.result);
          await onLoadExisting(sspData);
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
    <div className="initial-choice-container">
      <div className="initial-choice-header">
        <p className="subtitle">Generate compliance documentation from OSCAL catalogs</p>
      </div>

      <div className="choice-cards">
        {/* Start New Report - First Card */}
        <div className="choice-card">
          <div className="choice-icon">✨</div>
          <h2>Start New Report</h2>
          <p>Create a new compliance report from scratch</p>

          <div className="start-fresh-content">
            <div className="info-icon-large">📝</div>
            <h3>Begin Your Compliance Journey</h3>
            <p>Select an OSCAL catalog and document your system's security controls</p>
          </div>

          <button
            className="btn btn-success btn-full"
            onClick={onStartFresh}
            disabled={loading}
          >
            <span>✨</span>
            Start New Report
          </button>

          <div className="feature-list">
            <p className="feature-title">✨ What happens next:</p>
            <ul>
              <li>Choose from built-in OSCAL catalogs</li>
              <li>Or provide your own catalog URL</li>
              <li>Enter system information</li>
              <li>Document control implementations</li>
            </ul>
          </div>
        </div>

        {/* Load Existing Report - Second Card */}
        <div className="choice-card">
          <div className="choice-icon">📂</div>
          <h2>Load Existing Report</h2>
          <p>Continue working on an existing compliance report</p>

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
                <p className="upload-text">Drag & drop your OSCAL SSP JSON file</p>
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

          {file && (
            <button
              className="btn btn-primary btn-full"
              onClick={handleLoadExisting}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Loading...
                </>
              ) : (
                <>
                  <span>📂</span>
                  Load Existing Report
                </>
              )}
            </button>
          )}

          <div className="feature-list">
            <p className="feature-title">✨ What happens next:</p>
            <ul>
              <li>Extract catalog reference from your report</li>
              <li>Option to update to latest catalog version</li>
              <li>Identify new or changed controls</li>
              <li>Pre-populate all your existing data</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="supported-formats">
        <p className="text-muted">
          <strong>Supported Catalogs:</strong> {getSupportedCatalogueSummary()}
        </p>
      </div>
    </div>
  );
}

export default InitialChoice;

