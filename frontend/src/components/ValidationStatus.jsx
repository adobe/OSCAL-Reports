/**
 * Validation Status Component - Display OSCAL validation results
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license MIT
 */

import React from 'react';
import './ValidationStatus.css';

function ValidationStatus({ result, onClose }) {
  if (!result) return null;

  const { valid, validated, message, errors, output, executionTime, framework, type } = result;

  return (
    <div className="validation-overlay">
      <div className="validation-modal">
        <div className="validation-header">
          <h3>
            {validated ? (
              <>
                <span className={`validation-icon ${valid ? 'valid' : 'invalid'}`}>
                  {valid ? '✓' : '✗'}
                </span>
                OSCAL Validation Result
              </>
            ) : (
              <>
                <span className="validation-icon warning">⚠</span>
                Validation Status
              </>
            )}
          </h3>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="validation-body">
          {/* Status Badge */}
          <div className={`status-badge ${validated ? (valid ? 'success' : 'error') : 'warning'}`}>
            {validated ? (
              valid ? 'VALID - Metaschema Compliant' : 'INVALID - Schema Violations'
            ) : (
              'Validation Not Available'
            )}
          </div>

          {/* Message */}
          <div className="validation-message">
            {message}
          </div>

          {/* Details */}
          {validated && (
            <div className="validation-details">
              <div className="detail-row">
                <span className="detail-label">Document Type:</span>
                <span className="detail-value">{type?.toUpperCase() || 'Unknown'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Framework:</span>
                <span className="detail-value">{framework || 'N/A'}</span>
              </div>
              <div className="detail-row">
                <span className="detail-label">Execution Time:</span>
                <span className="detail-value">{executionTime ? `${executionTime}ms` : 'N/A'}</span>
              </div>
            </div>
          )}

          {/* Errors (if invalid) */}
          {validated && !valid && errors && errors.length > 0 && (
            <div className="validation-errors">
              <h4>Validation Errors:</h4>
              <div className="error-list">
                {errors.map((error, index) => (
                  <div key={index} className={`error-item ${error.type?.toLowerCase()}`}>
                    <div className="error-type">{error.type || 'ERROR'}</div>
                    <div className="error-message">{error.message}</div>
                    {error.line && <div className="error-line">Line: {error.line}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Success Output */}
          {validated && valid && output && (
            <div className="validation-output">
              <h4>Validation Output:</h4>
              <pre className="output-text">{output}</pre>
            </div>
          )}

          {/* Setup Instructions (if validation not available) */}
          {!validated && result.recommendation && (
            <div className="setup-instructions">
              <h4>Setup Required:</h4>
              <p>{result.recommendation}</p>
              <div className="instruction-steps">
                <h5>Quick Setup:</h5>
                <ol>
                  <li>Install Docker Desktop from <a href="https://www.docker.com/products/docker-desktop" target="_blank" rel="noopener noreferrer">docker.com</a></li>
                  <li>Run: <code>docker pull ghcr.io/metaschema-framework/oscal-cli:latest</code></li>
                  <li>Restart this application</li>
                </ol>
              </div>
            </div>
          )}
        </div>

        <div className="validation-footer">
          <button className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default ValidationStatus;

