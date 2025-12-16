/**
 * ExportButtons Component - Export controls to various formats
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license MIT
 */

import React, { useState, useEffect } from 'react';
import './ExportButtons.css';
import { validateSSP, getValidatorStatus } from '../services/oscalValidator';
import ValidationStatus from './ValidationStatus';
import { useAuth } from '../contexts/AuthContext';

function ExportButtons({ onExportSSP, onExportExcel, onExportCCM, onExportPDF, loading, systemInfo, controls }) {
  const { user } = useAuth();
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [validatorReady, setValidatorReady] = useState(false);
  const [showAssessorWarning, setShowAssessorWarning] = useState(false);
  
  // Validation options - user can select what to validate
  const [validationOptions, setValidationOptions] = useState({
    requiredFields: true,
    stringPatterns: false,
    enums: false,
    formats: false,
    lengthRestrictions: false,
    additionalProperties: false
  });

  // Check validator status on mount
  useEffect(() => {
    checkValidatorStatus();
  }, []);

  const checkValidatorStatus = async () => {
    const status = await getValidatorStatus();
    setValidatorReady(status.ready);
  };

  const handleValidationOptionChange = (option) => {
    setValidationOptions(prev => ({
      ...prev,
      [option]: !prev[option]
    }));
  };

  const handleValidate = async () => {
    setValidating(true);
    
    try {
      // Generate SSP data (similar to what onExportSSP would do)
      const response = await fetch('/api/generate-ssp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInfo: systemInfo || {},
          controls: controls || []
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate SSP for validation');
      }

      // Backend returns SSP directly (not wrapped in { ssp: ... })
      const ssp = await response.json();
      
      // Validate the generated SSP with selected options
      const result = await validateSSP(ssp, validationOptions);
      setValidationResult(result);
      
    } catch (error) {
      console.error('Validation error:', error);
      setValidationResult({
        valid: false,
        validated: false,
        message: 'Failed to validate OSCAL document',
        error: error.message
      });
    } finally {
      setValidating(false);
    }
  };

  const closeValidationModal = () => {
    setValidationResult(null);
  };

  // Handle OSCAL export with Assessor check
  const handleOSCALExport = () => {
    // Check if user is Assessor role
    if (user && user.role === 'Assessor') {
      setShowAssessorWarning(true);
    } else {
      // For other roles, export directly
      onExportSSP();
    }
  };

  // Handle Assessor confirmation
  const handleAssessorConfirm = () => {
    setShowAssessorWarning(false);
    onExportSSP();
  };

  const handleAssessorCancel = () => {
    setShowAssessorWarning(false);
  };

  return (
    <div className="export-container">
      <div className="export-card">
        <h3>Export Your Documentation</h3>
        <p className="export-description">
          Download your Compliance Report in multiple formats
        </p>

        {/* Validation Options & Button */}
        <div className="validation-section">
          <h4 className="validation-options-title">
            <span className="icon">⚙️</span> Validation Options (Metaschema Framework Awareness)
          </h4>
          <p className="validation-options-description">
            Select what aspects to validate. This helps understand Metaschema Framework compliance without affecting exports.
          </p>
          
          <div className="validation-checkboxes">
            <label className="checkbox-label" title="Validate all mandatory OSCAL fields (uuid, metadata, system-characteristics, system-implementation, control-implementation)">
              <input
                type="checkbox"
                checked={validationOptions.requiredFields}
                onChange={() => handleValidationOptionChange('requiredFields')}
              />
              <span className="checkbox-text">
                <strong>Required Fields</strong>
                <span className="info-icon" title="Validate all mandatory OSCAL fields">ⓘ</span>
              </span>
            </label>

            <label className="checkbox-label" title="Validate string formats: no leading/trailing spaces, proper trimming, pattern compliance">
              <input
                type="checkbox"
                checked={validationOptions.stringPatterns}
                onChange={() => handleValidationOptionChange('stringPatterns')}
              />
              <span className="checkbox-text">
                <strong>String Patterns</strong>
                <span className="info-icon" title="Validate string format rules">ⓘ</span>
              </span>
            </label>

            <label className="checkbox-label" title="Validate that values match predefined options (oscal-version: '2.1.0', status states, classification levels)">
              <input
                type="checkbox"
                checked={validationOptions.enums}
                onChange={() => handleValidationOptionChange('enums')}
              />
              <span className="checkbox-text">
                <strong>Enum Values</strong>
                <span className="info-icon" title="Validate predefined value lists">ⓘ</span>
              </span>
            </label>

            <label className="checkbox-label" title="Validate email addresses (RFC 5322), URIs, UUIDs (RFC 4122), date-time (RFC 3339), and other format types">
              <input
                type="checkbox"
                checked={validationOptions.formats}
                onChange={() => handleValidationOptionChange('formats')}
              />
              <span className="checkbox-text">
                <strong>Format Validation</strong>
                <span className="info-icon" title="Validate email, URI, UUID, date formats">ⓘ</span>
              </span>
            </label>

            <label className="checkbox-label" title="Validate min/max length constraints for strings, arrays, and objects (e.g., string minLength: 1, array maxItems: 100)">
              <input
                type="checkbox"
                checked={validationOptions.lengthRestrictions}
                onChange={() => handleValidationOptionChange('lengthRestrictions')}
              />
              <span className="checkbox-text">
                <strong>Length Restrictions</strong>
                <span className="info-icon" title="Validate size/length constraints">ⓘ</span>
              </span>
            </label>

            <label className="checkbox-label" title="Flag custom fields not defined in OSCAL schema. Helps identify non-standard extensions and ensure strict compliance.">
              <input
                type="checkbox"
                checked={validationOptions.additionalProperties}
                onChange={() => handleValidationOptionChange('additionalProperties')}
              />
              <span className="checkbox-text">
                <strong>No Additional Properties</strong>
                <span className="info-icon" title="Flag custom/non-standard fields">ⓘ</span>
              </span>
            </label>
          </div>

          <button
            className={`btn validation-btn ${validatorReady ? 'btn-info' : 'btn-warning'}`}
            onClick={handleValidate}
            disabled={validating || loading}
            title={validatorReady ? 'Validate with selected options' : 'Docker not available - validation disabled'}
          >
            {validating ? (
              <>
                <span className="spinner"></span>
                Validating...
              </>
            ) : (
              <>
                <span className="export-icon">{validatorReady ? '✓' : '⚠'}</span>
                Validate OSCAL with Selected Options
              </>
            )}
          </button>
          {!validatorReady && (
            <small className="validator-warning">
              Docker required for validation. <a href="https://www.docker.com/products/docker-desktop" target="_blank" rel="noopener noreferrer">Install Docker</a>
            </small>
          )}
        </div>

        <div className="export-buttons">
          <button
            className="btn btn-primary export-btn"
            onClick={handleOSCALExport}
            disabled={loading}
            title="OSCAL JSON: Standards-compliant format for automated processing and integration with other OSCAL tools"
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Generating...
              </>
            ) : (
              <>
                <span className="export-icon">📄</span>
                Export SOA/SSP/CCM in OSCAL
              </>
            )}
          </button>

          <button
            className="btn btn-success export-btn"
            onClick={onExportExcel}
            disabled={loading}
            title="Excel SSP: Easy-to-read spreadsheet format for manual review and distribution"
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Generating...
              </>
            ) : (
              <>
                <span className="export-icon">📊</span>
                Export SOA/SSP/CCM in Excel
              </>
            )}
          </button>

          <button
            className="btn btn-danger export-btn"
            onClick={onExportPDF}
            disabled={loading}
            title="PDF Report: Professional, print-ready compliance report with system information, control implementation details, and assessment summary"
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Generating...
              </>
            ) : (
              <>
                <span className="export-icon">📕</span>
                Export SOA/SSP/CCM in PDF
              </>
            )}
          </button>
        </div>
      </div>

      {/* Validation Status Modal */}
      {validationResult && (
        <ValidationStatus
          result={validationResult}
          onClose={closeValidationModal}
        />
      )}

      {/* Assessor Warning Modal */}
      {showAssessorWarning && (
        <div className="modal-overlay" onClick={handleAssessorCancel}>
          <div className="modal-content assessor-warning-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>⚠️ Assessor Export Warning</h3>
              <button className="modal-close" onClick={handleAssessorCancel}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="warning-icon-large">🔐</div>
              <p className="warning-message">
                You are exporting this OSCAL Report as an <strong>Assessor</strong>.
              </p>
              <div className="warning-details">
                <h4>⚠️ Important: File Integrity Reset</h4>
                <ul>
                  <li>
                    <strong>Integrity Hash Will Be Updated:</strong> A new FIPS 140-2 compliant SHA-256 integrity hash will be generated for this export.
                  </li>
                  <li>
                    <strong>Previous Hash Replaced:</strong> The old integrity hash will be replaced with a new one based on your current export.
                  </li>
                  <li>
                    <strong>Future Imports:</strong> When anyone imports this newly exported file, they will NOT see integrity warnings because the new hash will match.
                  </li>
                  <li>
                    <strong>Audit Trail:</strong> The timestamp of this integrity update will be recorded in the OSCAL metadata.
                  </li>
                </ul>
              </div>
              <div className="warning-question">
                <strong>Do you want to proceed with the export?</strong>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-secondary" 
                onClick={handleAssessorCancel}
              >
                ❌ Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleAssessorConfirm}
              >
                ✅ Yes, Proceed with Export
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ExportButtons;

