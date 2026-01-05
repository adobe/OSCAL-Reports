/**
 * CCMUpload Component - Import Cloud Control Matrix (CCM) Excel files
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license GPL-3.0-or-later
 */

import React, { useState } from 'react';
import axios from 'axios';
import './CCMUpload.css';

function CCMUpload({ onImportComplete, onSkip, catalogueUrl }) {
  const [file, setFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
      if (isValidExcelFile(droppedFile)) {
        setFile(droppedFile);
      } else {
        setError('Please upload an Excel file (.xlsx)');
      }
    }
  };

  const handleFileSelect = (e) => {
    setError('');
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (isValidExcelFile(selectedFile)) {
        setFile(selectedFile);
      } else {
        setError('Please upload an Excel file (.xlsx)');
      }
    }
  };

  const isValidExcelFile = (file) => {
    return (
      file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.name.endsWith('.xlsx')
    );
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Read file as base64
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          // Convert ArrayBuffer to base64
          const arrayBuffer = e.target.result;
          const bytes = new Uint8Array(arrayBuffer);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);

          // Send to backend for parsing
          const response = await axios.post('/api/import-ccm', {
            fileData: base64
          });

          if (response.data.success) {
            console.log('CCM imported successfully:', response.data.statistics);
            onImportComplete({
              controls: response.data.controls,
              systemInfo: response.data.systemInfo,
              statistics: response.data.statistics,
              catalogueUrl: catalogueUrl
            });
          } else {
            setError('Failed to parse CCM file');
          }
        } catch (err) {
          console.error('Error importing CCM:', err);
          setError(err.response?.data?.details || 'Failed to import CCM file. Please ensure it\'s a valid CCM export.');
        } finally {
          setLoading(false);
        }
      };
      reader.onerror = () => {
        setError('Failed to read file');
        setLoading(false);
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      setError('Failed to process file');
      setLoading(false);
    }
  };

  return (
    <div className="ccm-upload-container">
      <div className="ccm-upload-card">
        <div className="card-header">
          <h2>📊 Import Existing CCM (Optional)</h2>
          <p className="text-muted">
            Have an existing Cloud Control Matrix Excel file? Upload it to pre-populate all control data.
            You can review and validate before saving.
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
                <div className="upload-icon">📊</div>
                <p className="upload-text">Drag & drop your CCM Excel file here</p>
                <p className="text-muted">or</p>
                <label htmlFor="ccm-file-upload" className="btn btn-secondary">
                  Browse Files
                </label>
                <input
                  id="ccm-file-upload"
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
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
            <h4>ℹ️ What gets imported?</h4>
            <ul>
              <li><strong>System Information:</strong> System name, ID, and classification level</li>
              <li><strong>Control Data:</strong> Implementation status, details, and responsible parties</li>
              <li><strong>Testing Evidence:</strong> Control types, evidence locations, and API URLs</li>
              <li><strong>Risk Assessment:</strong> Risk ratings, compensating controls, and exceptions</li>
              <li className="warning-item"><strong>⚠️ Important:</strong> Apologies this function is not working we are debugging it.</li>
            </ul>
            <p className="text-muted">
              After import, you can review, validate, and update any fields before saving locally.
            </p>
          </div>
        </div>

        <div className="button-group">
          <button
            className="btn btn-secondary"
            onClick={onSkip}
            disabled={loading}
          >
            Skip - Manual Entry
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
                  Importing...
                </>
              ) : (
                <>
                  <span>📥</span>
                  Import & Review
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default CCMUpload;

