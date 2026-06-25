/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import axios from '../utils/safeAxios.js';
import buildInfo from '../utils/buildInfo';
import { useAuth } from '../contexts/AuthContext';
import { exportErrorMessage } from '../utils/exportErrorMessage';
import {
  exportBaselineSspWithEdits,
  buildSspFromBaselineWithEdits,
} from '../utils/exportSsp.js';
import {
  loadComparisonReportPrefs,
  saveComparisonUrlForSlot,
  saveComparisonReportTypes,
  defaultSlotInputMode,
  loadComparisonWorkSession,
  saveComparisonWorkSession,
  mergeBaselineControlsFromSession,
} from '../utils/comparisonReportPrefs.js';
import { verifyOscalReportUrl } from '../utils/verifyOscalReportUrl.js';
import ControlEditModal from './ControlEditModal';
import ValidationStatus from './ValidationStatus';
import { validateSSP, getValidatorStatus } from '../services/oscalValidator';
import './MultiReportComparison.css';
import './ExportButtons.css';

const REPORT_SLOTS = ['baseline', 'csp1', 'csp2'];

const SLOT_LABELS = {
  baseline: '📄 Assessment Subject Report',
  csp1: '☁️ Cloud Service Provider Report 1',
  csp2: '☁️ Cloud Service Provider Report 2',
};

const DEFAULT_REPORT_NAMES = {
  baseline: 'Assessment Subject Report',
  csp1: 'Cloud Service Provider Report 1',
  csp2: 'Cloud Service Provider Report 2',
};

const FILE_UPLOAD_LABEL = {
  baseline: '📁 Upload OSCAL JSON',
  csp1: '📁 Update OSCAL JSON',
  csp2: '📁 Update OSCAL JSON',
};

async function fetchOscalJsonFromUrl(url, getAuthConfig) {
  const trimmed = url.trim();
  if (trimmed.startsWith('/api/')) {
    if (trimmed === '/api/baseline-report' || trimmed.startsWith('/api/baseline-report?')) {
      return axios.get('/api/baseline-report', getAuthConfig());
    }
    return axios.get(trimmed, getAuthConfig());
  }
  return axios.get(trimmed);
}

function MultiReportComparison({ onBack, onShowSettings }) {
  const { getAuthConfig, user } = useAuth();
  const [slotUrls, setSlotUrls] = useState({ baseline: '', csp1: '', csp2: '' });
  const [slotModes, setSlotModes] = useState({ baseline: 'url', csp1: 'file', csp2: 'file' });
  const [slotVerifyMessages, setSlotVerifyMessages] = useState({ baseline: '', csp1: '', csp2: '' });
  const [verifyingSlot, setVerifyingSlot] = useState(null);
  const [loadingSlot, setLoadingSlot] = useState(null);
  const [reports, setReports] = useState({
    baseline: null,      // Your default/current report or published SOA
    csp1: null,          // First CSP report (IaaS/PaaS/SaaS)
    csp2: null           // Second CSP report (IaaS/PaaS/SaaS)
  });
  const [reportNames, setReportNames] = useState({
    baseline: 'Assessment Subject Report',
    csp1: 'Cloud Service Provider Report 1',
    csp2: 'Cloud Service Provider Report 2',
  });
  const [reportTypes, setReportTypes] = useState({
    baseline: 'PaaS',
    csp1: 'IaaS',
    csp2: 'SaaS'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [comparisonResult, setComparisonResult] = useState(null);
  const [step, setStep] = useState(1); // 1: Upload, 2: Comparison View
  const [editingControl, setEditingControl] = useState(null);
  const [baselineControls, setBaselineControls] = useState(null); // Editable baseline controls
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [exportValidating, setExportValidating] = useState(false);
  const [exportValidationResult, setExportValidationResult] = useState(null);
  const [validatorReady, setValidatorReady] = useState(false);
  const [exportValidationOptions, setExportValidationOptions] = useState({
    requiredFields: true,
    stringPatterns: false,
    enums: false,
    formats: false,
    lengthRestrictions: false,
    additionalProperties: false,
  });
  const [databaseIntegrationEnabled, setDatabaseIntegrationEnabled] = useState(false);
  const [adobeTeamOptions, setAdobeTeamOptions] = useState([]);
  const [workSessionSavedAt, setWorkSessionSavedAt] = useState(null);

  const persistWorkSession = useCallback((partial = {}) => {
    if (!user?.id) {
      return { saved: false, reason: 'no_user' };
    }
    const result = saveComparisonWorkSession(user.id, {
      baselineControls: partial.baselineControls ?? baselineControls,
      exportValidationOptions: partial.exportValidationOptions ?? exportValidationOptions,
      reportNames: partial.reportNames ?? reportNames,
      reportTypes: partial.reportTypes ?? reportTypes,
    });
    if (result.saved) {
      setWorkSessionSavedAt(new Date().toISOString());
    }
    return result;
  }, [user?.id, baselineControls, exportValidationOptions, reportNames, reportTypes]);

  const persistReportTypes = useCallback((nextTypes) => {
    if (user?.id) {
      saveComparisonReportTypes(user.id, nextTypes);
    }
  }, [user?.id]);

  // Per-user URL prefs (localStorage) + DB settings; legacy baseline URL pre-fill (UI only)
  useEffect(() => {
    const init = async () => {
      try {
        if (user?.id) {
          const prefs = loadComparisonReportPrefs(user.id);
          const workSession = loadComparisonWorkSession(user.id);
          if (workSession.exportValidationOptions) {
            setExportValidationOptions(workSession.exportValidationOptions);
          }
          if (workSession.reportNames) {
            setReportNames((prev) => ({ ...prev, ...workSession.reportNames }));
          }
          if (prefs) {
            setSlotUrls({
              baseline: prefs.baselineUrl || '',
              csp1: prefs.csp1Url || '',
              csp2: prefs.csp2Url || '',
            });
            setReportTypes(prefs.reportTypes);
            setSlotModes({
              baseline: defaultSlotInputMode(prefs, 'baseline'),
              csp1: defaultSlotInputMode(prefs, 'csp1'),
              csp2: defaultSlotInputMode(prefs, 'csp2'),
            });
            if (workSession.updatedAt) {
              setWorkSessionSavedAt(workSession.updatedAt);
            }
            if (!prefs.baselineUrl) {
              try {
                const settingsRes = await axios.get('/api/settings', getAuthConfig());
                const legacyUrl = (settingsRes.data?.publishedSoaUrl || '').trim();
                if (legacyUrl && !legacyUrl.startsWith('/api/published-soa/')) {
                  setSlotUrls((prev) => ({ ...prev, baseline: legacyUrl }));
                  setSlotModes((prev) => ({ ...prev, baseline: 'url' }));
                }
              } catch {
                /* ignore legacy pre-fill errors */
              }
            }
          }
        }

        const response = await axios.get('/api/settings', getAuthConfig());
        const serverSettings = response.data;
        const dbEnabled = !!(serverSettings.databaseConfig?.enabled);
        setDatabaseIntegrationEnabled(dbEnabled);
        if (dbEnabled) {
          const optsRes = await axios.get('/api/database/adobe-team-options', getAuthConfig()).catch(() => ({ data: { options: [] } }));
          setAdobeTeamOptions(Array.isArray(optsRes.data?.options) ? optsRes.data.options : []);
        } else {
          setAdobeTeamOptions([]);
        }
      } catch (error) {
        console.error('❌ Failed to load comparison settings:', error);
      }
    };
    init();
  }, [getAuthConfig, user?.id]);

  useEffect(() => {
    if (step === 2) {
      getValidatorStatus().then((status) => setValidatorReady(status.ready));
    }
  }, [step]);

  const buildExportContext = useCallback(() => {
    if (!reports.baseline) {
      throw new Error('No assessment subject report to export.');
    }
    return {
      existingSSP: reports.baseline,
      controlEdits: baselineControls || {},
      validationOptions: exportValidationOptions,
    };
  }, [reports.baseline, baselineControls, exportValidationOptions]);

  const applyLoadedReport = (reportKey, jsonData, displayName) => {
    setReports((prev) => ({ ...prev, [reportKey]: jsonData }));
    setReportNames((prev) => ({
      ...prev,
      [reportKey]: displayName
        || jsonData['system-security-plan']?.['system-characteristics']?.['system-name']
        || jsonData['system-security-plan']?.metadata?.title
        || DEFAULT_REPORT_NAMES[reportKey],
    }));
    setError('');
  };

  const handleFileUpload = async (reportKey, file) => {
    if (!file) return;

    try {
      const text = await file.text();
      const jsonData = JSON.parse(text);
      applyLoadedReport(reportKey, jsonData, file.name);
      setSlotUrls((prev) => ({ ...prev, [reportKey]: '' }));
    } catch (err) {
      setError(`Error reading ${reportKey} file: ${err.message}`);
    }
  };

  const handleSlotUrlChange = (reportKey, value) => {
    setSlotUrls((prev) => ({ ...prev, [reportKey]: value }));
    setSlotVerifyMessages((prev) => ({ ...prev, [reportKey]: '' }));
  };

  const handleSlotModeChange = (reportKey, mode) => {
    setSlotModes((prev) => ({ ...prev, [reportKey]: mode }));
  };

  const handleReportTypeChange = (reportKey, value) => {
    setReportTypes((prev) => {
      const next = { ...prev, [reportKey]: value };
      persistReportTypes(next);
      return next;
    });
  };

  const handleVerifySlotUrl = async (reportKey) => {
    const url = (slotUrls[reportKey] || '').trim();
    if (!url) {
      setSlotVerifyMessages((prev) => ({ ...prev, [reportKey]: '❌ Please enter a URL to verify' }));
      return;
    }
    setVerifyingSlot(reportKey);
    setSlotVerifyMessages((prev) => ({ ...prev, [reportKey]: '🔄 Verifying URL...' }));
    const result = await verifyOscalReportUrl(url, getAuthConfig());
    setSlotVerifyMessages((prev) => ({ ...prev, [reportKey]: result.message }));
    setVerifyingSlot(null);
  };

  const handleLoadFromUrl = async (reportKey) => {
    const url = (slotUrls[reportKey] || '').trim();
    if (!url) {
      setError(`Enter a URL for ${DEFAULT_REPORT_NAMES[reportKey]}.`);
      return;
    }

    setLoadingSlot(reportKey);
    setError('');

    try {
      const response = await fetchOscalJsonFromUrl(url, getAuthConfig());
      applyLoadedReport(reportKey, response.data, null);
      if (user?.id) {
        saveComparisonUrlForSlot(user.id, reportKey, url);
      }
    } catch (err) {
      setError(`Failed to load ${reportKey} report: ${err.message}`);
    } finally {
      setLoadingSlot(null);
    }
  };

  const handleCompare = async () => {
    // Check if at least 2 reports are uploaded
    const uploadedCount = Object.values(reports).filter(r => r !== null).length;
    if (uploadedCount < 2) {
      setError('Please upload at least 2 reports to compare.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await axios.post('/api/compare-multiple-reports', {
        reports: reports,
        reportNames: reportNames,
        reportTypes: reportTypes
      }, getAuthConfig());

      console.log('🔍 Comparison response received:', response.data);
      console.log('🔍 Catalogs structure:', response.data.catalogs);
      console.log('🔍 Catalog differences:', response.data.catalogDifferences);
      
      setComparisonResult(response.data);
      
      // Extract baseline controls for editing
      if (response.data.controls) {
        const baselineControlsMap = {};
        response.data.controls.forEach(control => {
          if (control.baseline) {
            baselineControlsMap[control.id] = { ...control.baseline, id: control.id, title: control.title };
          }
        });
        const workSession = user?.id ? loadComparisonWorkSession(user.id) : null;
        const merged = mergeBaselineControlsFromSession(
          baselineControlsMap,
          workSession?.baselineControls || {},
        );
        setBaselineControls(merged);
        if (user?.id) {
          persistWorkSession({ baselineControls: merged });
        }
        console.log('📋 Extracted baseline controls for editing:', Object.keys(merged).length);
      }
      
      setStep(2); // Move to comparison view
    } catch (err) {
      setError(`Comparison failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    if (hasUnsavedChanges) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to start a new comparison?')) {
        return;
      }
    }
    setReports({
      baseline: null,
      csp1: null,
      csp2: null
    });
    setReportNames({
      baseline: 'Assessment Subject Report',
      csp1: 'Cloud Service Provider Report 1',
      csp2: 'Cloud Service Provider Report 2',
    });
    setComparisonResult(null);
    setBaselineControls(null);
    setHasUnsavedChanges(false);
    setStep(1);
    setError('');
  };

  const handleControlClick = (controlId) => {
    if (baselineControls && baselineControls[controlId]) {
      setEditingControl(baselineControls[controlId]);
      return;
    }
    // Fallback: find control in comparison result (handles ID mismatch or baselineControls not yet set)
    const row = comparisonResult?.controls?.find(c => c.id === controlId);
    if (row?.baseline) {
      setEditingControl({
        ...row.baseline,
        id: row.id,
        title: row.title || row.baseline?.catalogTitle || row.id,
        catalogTitle: row.baseline?.catalogTitle || row.title,
        catalogDescription: row.baseline?.catalogDescription || row.baseline?.description || '',
      });
      return;
    }
    console.warn('Control not found in baseline:', controlId);
  };

  const handleControlSave = (updatedControl) => {
    setBaselineControls(prev => {
      const next = {
        ...prev,
        [updatedControl.id]: updatedControl,
      };
      if (user?.id) {
        persistWorkSession({ baselineControls: next });
      }
      return next;
    });
    setHasUnsavedChanges(true);
    setEditingControl(null);
    console.log('✅ Control updated:', updatedControl.id);
  };

  const handleExportValidationOptionChange = (option) => {
    setExportValidationOptions((prev) => {
      const next = {
        ...prev,
        [option]: !prev[option],
      };
      if (user?.id) {
        persistWorkSession({ exportValidationOptions: next });
      }
      return next;
    });
  };

  const renderAssessmentExportPanel = () => (
    <div className="export-container">
      <div className="export-card">
        <h3>Export Assessment Subject Report</h3>
        <p className="export-description">
          Export edits made to the assessment subject report as OSCAL JSON. Use Validate below to check
          OSCAL compliance before exporting (recommended). Export generates the file directly without a
          second validation pass, which avoids gateway timeouts on large reports.
        </p>
        {workSessionSavedAt && (
          <p className="mrc-work-session-note">
            Your comparison edits are saved in this browser only (last saved {new Date(workSessionSavedAt).toLocaleString()}).
          </p>
        )}

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
                checked={exportValidationOptions.requiredFields}
                onChange={() => handleExportValidationOptionChange('requiredFields')}
              />
              <span className="checkbox-text">
                <strong>Required Fields</strong>
                <span className="info-icon" title="Validate all mandatory OSCAL fields">ⓘ</span>
              </span>
            </label>

            <label className="checkbox-label" title="Validate string formats: no leading/trailing spaces, proper trimming, pattern compliance">
              <input
                type="checkbox"
                checked={exportValidationOptions.stringPatterns}
                onChange={() => handleExportValidationOptionChange('stringPatterns')}
              />
              <span className="checkbox-text">
                <strong>String Patterns</strong>
                <span className="info-icon" title="Validate string format rules">ⓘ</span>
              </span>
            </label>

            <label className="checkbox-label" title="Validate that values match predefined options (oscal-version: '2.1.0', status states, classification levels)">
              <input
                type="checkbox"
                checked={exportValidationOptions.enums}
                onChange={() => handleExportValidationOptionChange('enums')}
              />
              <span className="checkbox-text">
                <strong>Enum Values</strong>
                <span className="info-icon" title="Validate predefined value lists">ⓘ</span>
              </span>
            </label>

            <label className="checkbox-label" title="Validate email addresses (RFC 5322), URIs, UUIDs (RFC 4122), date-time (RFC 3339), and other format types">
              <input
                type="checkbox"
                checked={exportValidationOptions.formats}
                onChange={() => handleExportValidationOptionChange('formats')}
              />
              <span className="checkbox-text">
                <strong>Format Validation</strong>
                <span className="info-icon" title="Validate email, URI, UUID, date formats">ⓘ</span>
              </span>
            </label>

            <label className="checkbox-label" title="Validate min/max length constraints for strings, arrays, and objects (e.g., string minLength: 1, array maxItems: 100)">
              <input
                type="checkbox"
                checked={exportValidationOptions.lengthRestrictions}
                onChange={() => handleExportValidationOptionChange('lengthRestrictions')}
              />
              <span className="checkbox-text">
                <strong>Length Restrictions</strong>
                <span className="info-icon" title="Validate size/length constraints">ⓘ</span>
              </span>
            </label>

            <label className="checkbox-label" title="Flag custom fields not defined in OSCAL schema. Helps identify non-standard extensions and ensure strict compliance.">
              <input
                type="checkbox"
                checked={exportValidationOptions.additionalProperties}
                onChange={() => handleExportValidationOptionChange('additionalProperties')}
              />
              <span className="checkbox-text">
                <strong>No Additional Properties</strong>
                <span className="info-icon" title="Flag custom/non-standard fields">ⓘ</span>
              </span>
            </label>
          </div>

          <button
            type="button"
            className={`btn validation-btn ${validatorReady ? 'btn-info' : 'btn-warning'}`}
            onClick={handleValidateAssessmentExport}
            disabled={exportValidating || loading || !reports.baseline || !validatorReady}
            title={validatorReady ? 'Validate with selected options' : 'Docker not available - validation disabled'}
          >
            {exportValidating ? (
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

        <div className="export-buttons mrc-export-buttons">
          <button
            type="button"
            className="btn btn-primary export-btn"
            onClick={handleExportAssessmentSubject}
            disabled={loading || exportValidating || !reports.baseline}
            title="Export assessment subject report as OSCAL JSON"
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Exporting...
              </>
            ) : (
              <>
                <span className="export-icon">📄</span>
                Export OSCAL JSON
              </>
            )}
          </button>
        </div>

        {exportValidationResult && (
          <ValidationStatus
            result={exportValidationResult}
            onClose={() => setExportValidationResult(null)}
          />
        )}
      </div>
    </div>
  );

  const handleValidateAssessmentExport = async () => {
    setExportValidating(true);
    setExportValidationResult(null);
    setError('');
    try {
      const exportCtx = buildExportContext();
      const ssp = await buildSspFromBaselineWithEdits(exportCtx, getAuthConfig());
      const result = await validateSSP(ssp, exportValidationOptions);
      setExportValidationResult(result);
    } catch (err) {
      setError(`Validation failed: ${await exportErrorMessage(err, err?.message || 'Unknown error')}`);
    } finally {
      setExportValidating(false);
    }
  };

  const handleExportAssessmentSubject = async () => {
    if (!reports.baseline) {
      setError('No assessment subject report to export.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const saveResult = persistWorkSession();
      if (!saveResult.saved && saveResult.reason === 'too_large') {
        setError('Could not save your edits in this browser (data too large). Export will still use current in-memory edits.');
      }

      await exportBaselineSspWithEdits(buildExportContext(), getAuthConfig());
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error('❌ Export failed:', err);
      setError(`Export failed: ${await exportErrorMessage(err, err?.message || 'Unknown error')}`);
    } finally {
      setLoading(false);
    }
  };

  const renderReportSlot = (reportKey) => {
    const mode = slotModes[reportKey] || 'file';
    const verifyMsg = slotVerifyMessages[reportKey] || '';
    const isVerifying = verifyingSlot === reportKey;
    const isLoading = loadingSlot === reportKey;

    return (
      <div key={reportKey} className="upload-card">
        <div className="upload-header">
          <h4>{SLOT_LABELS[reportKey]}</h4>
        </div>
        <div className="upload-body">
          <div className="csp-type-selector">
            <label>Service Type:</label>
            <select
              className="csp-type-select"
              value={reportTypes[reportKey]}
              onChange={(e) => handleReportTypeChange(reportKey, e.target.value)}
            >
              <option value="IaaS">IaaS (Infrastructure)</option>
              <option value="PaaS">PaaS (Platform)</option>
              <option value="SaaS">SaaS (Software)</option>
            </select>
          </div>

          {reports[reportKey] ? (
            <div className="uploaded-info">
              <span className="success-icon">✅</span>
              <div>
                <strong>{reportNames[reportKey]}</strong>
                <small>{reportTypes[reportKey]} Provider OSCAL Report</small>
              </div>
              <label className="file-upload-btn file-upload-btn-sm">
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => handleFileUpload(reportKey, e.target.files[0])}
                />
                📁 Update OSCAL JSON
              </label>
              <button
                type="button"
                className="btn-sm btn-danger"
                onClick={() => setReports((prev) => ({ ...prev, [reportKey]: null }))}
              >
                Remove
              </button>
            </div>
          ) : (
            <>
              <div className="mrc-input-mode-toggle" role="group" aria-label="Report source">
                <button
                  type="button"
                  className={`mrc-mode-btn ${mode === 'url' ? 'active' : ''}`}
                  onClick={() => handleSlotModeChange(reportKey, 'url')}
                >
                  🔗 URL
                </button>
                <button
                  type="button"
                  className={`mrc-mode-btn ${mode === 'file' ? 'active' : ''}`}
                  onClick={() => handleSlotModeChange(reportKey, 'file')}
                >
                  📁 Upload file
                </button>
              </div>

              {mode === 'url' ? (
                <div className="mrc-url-panel">
                  <input
                    type="url"
                    className="form-control mrc-url-input"
                    value={slotUrls[reportKey] || ''}
                    onChange={(e) => handleSlotUrlChange(reportKey, e.target.value)}
                    placeholder="https://raw.githubusercontent.com/.../report.json"
                  />
                  <div className="mrc-url-actions">
                    <button
                      type="button"
                      className="btn-verify"
                      onClick={() => handleVerifySlotUrl(reportKey)}
                      disabled={isVerifying || !(slotUrls[reportKey] || '').trim()}
                    >
                      {isVerifying ? '⏳ Verifying...' : '🔍 Verify'}
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => handleLoadFromUrl(reportKey)}
                      disabled={isLoading || !(slotUrls[reportKey] || '').trim()}
                    >
                      {isLoading ? '⏳ Loading...' : '🌐 Load report'}
                    </button>
                  </div>
                  {verifyMsg && (
                    <div className={`verification-message ${verifyMsg.includes('✅') ? 'success' : verifyMsg.includes('⚠️') ? 'warning' : verifyMsg.includes('🔄') ? 'info' : 'error'}`}>
                      {verifyMsg.split('\n').map((line, idx) => (
                        <div key={idx}>{line}</div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="upload-options">
                  <label className="file-upload-btn">
                    <input
                      type="file"
                      accept=".json"
                      onChange={(e) => handleFileUpload(reportKey, e.target.files[0])}
                    />
                    {FILE_UPLOAD_LABEL[reportKey]}
                  </label>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  if (step === 2 && comparisonResult) {
    console.log('🔍 DEBUG: Rendering Results View with Header');
    return (
      <div className="multi-report-comparison">
        {/* Application Title */}
        <header className="app-header" style={{ display: 'block', visibility: 'visible' }}>
          <button 
            className="settings-btn" 
            onClick={onShowSettings}
            title="API Credentials & Settings"
          >
            ⚙️ Settings
          </button>
          <div className="header-content">
            <h1>Keekar's OSCAL SOA/SSP/CCM Generator <span className="beta-badge" title="Beta Release">Beta</span></h1>
            <p>Generate Statement of Applicability, System Security Plans, and Cloud Control Matrix from OSCAL Catalogues</p>
          </div>
        </header>

        <div className="comparison-header">
          <button className="btn-secondary" onClick={handleReset}>
            ← New Comparison
          </button>
          <div className="comparison-header-center">
            <h2>📊 Multi-Report Comparison Results</h2>
            {hasUnsavedChanges && (
              <span className="unsaved-changes-badge">⚠️ Unsaved Changes</span>
            )}
          </div>
          <div className="header-actions">
            <button className="btn-secondary" onClick={onBack}>
              ← Back to Main
            </button>
          </div>
        </div>

        {error && (
          <div className="alert alert-error">
            ❌ {error}
          </div>
        )}

        <div className="comparison-summary">
          <h3>Reports Being Compared:</h3>
          <div className="report-cards">
            {reports.baseline && (
              <div className="report-card">
                <div className="report-icon">📄</div>
                <div className="report-info">
                  <strong>{reportNames.baseline}</strong>
                  <small>{reportTypes.baseline} Provider</small>
                  {comparisonResult.catalogs?.baseline ? (
                    typeof comparisonResult.catalogs.baseline === 'object' ? (
                      <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', lineHeight: '1.4' }}>
                        <div><strong>Catalog Version:</strong> {comparisonResult.catalogs.baseline.catalogVersion || 'N/A'}</div>
                        <div><strong>OSCAL Metadata Framework Version:</strong> {comparisonResult.catalogs.baseline.oscalMetadataVersion || 'N/A'}</div>
                        <div><strong>OSCAL Version:</strong> {comparisonResult.catalogs.baseline.oscalVersion || 'N/A'}</div>
                      </div>
                    ) : (
                      <small>Catalog: {comparisonResult.catalogs.baseline}</small>
                    )
                  ) : (
                    <small>Catalog: N/A</small>
                  )}
                </div>
              </div>
            )}
            {reports.csp1 && (
              <div className="report-card">
                <div className="report-icon">☁️</div>
                <div className="report-info">
                  <strong>{reportNames.csp1}</strong>
                  <small>{reportTypes.csp1} Provider</small>
                  {comparisonResult.catalogs?.csp1 ? (
                    typeof comparisonResult.catalogs.csp1 === 'object' ? (
                      <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', lineHeight: '1.4' }}>
                        <div><strong>Catalog Version:</strong> {comparisonResult.catalogs.csp1.catalogVersion || 'N/A'}</div>
                        <div><strong>OSCAL Metadata Framework Version:</strong> {comparisonResult.catalogs.csp1.oscalMetadataVersion || 'N/A'}</div>
                        <div><strong>OSCAL Version:</strong> {comparisonResult.catalogs.csp1.oscalVersion || 'N/A'}</div>
                      </div>
                    ) : (
                      <small>Catalog: {comparisonResult.catalogs.csp1}</small>
                    )
                  ) : (
                    <small>Catalog: N/A</small>
                  )}
                </div>
              </div>
            )}
            {reports.csp2 && (
              <div className="report-card">
                <div className="report-icon">☁️</div>
                <div className="report-info">
                  <strong>{reportNames.csp2}</strong>
                  <small>{reportTypes.csp2} Provider</small>
                  {comparisonResult.catalogs?.csp2 ? (
                    typeof comparisonResult.catalogs.csp2 === 'object' ? (
                      <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', lineHeight: '1.4' }}>
                        <div><strong>Catalog Version:</strong> {comparisonResult.catalogs.csp2.catalogVersion || 'N/A'}</div>
                        <div><strong>OSCAL Metadata Framework Version:</strong> {comparisonResult.catalogs.csp2.oscalMetadataVersion || 'N/A'}</div>
                        <div><strong>OSCAL Version:</strong> {comparisonResult.catalogs.csp2.oscalVersion || 'N/A'}</div>
                      </div>
                    ) : (
                      <small>Catalog: {comparisonResult.catalogs.csp2}</small>
                    )
                  ) : (
                    <small>Catalog: N/A</small>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {comparisonResult.catalogDifferences && (
          <div className="catalog-differences">
            <h3>📋 Catalog Version Differences</h3>
            <div className="diff-box">
              {comparisonResult.catalogDifferences.map((diff, idx) => (
                <div key={idx} className="diff-item" style={{ marginBottom: '1rem', padding: '0.75rem', background: '#f8f9fa', borderRadius: '4px' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>{diff.label}:</div>
                  <div style={{ fontSize: '0.9rem', lineHeight: '1.6' }}>
                    <div><strong>Catalog Version:</strong> {diff.catalogVersion || 'N/A'}</div>
                    <div><strong>OSCAL Metadata Framework Version:</strong> {diff.oscalMetadataVersion || 'N/A'}</div>
                    <div><strong>OSCAL Version:</strong> {diff.oscalVersion || 'N/A'}</div>
                    {diff.catalogUrl && diff.catalogUrl !== 'Unknown' && (
                      <div style={{ marginTop: '0.25rem', fontSize: '0.85rem', color: '#666', wordBreak: 'break-all' }}>
                        <strong>Catalog URL:</strong> {diff.catalogUrl}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="comparison-stats">
          <h3>📈 Statistics</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-number">{comparisonResult.totalControls || 0}</div>
              <div className="stat-label">Total Controls</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{comparisonResult.identical || 0}</div>
              <div className="stat-label">Identical</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{comparisonResult.different || 0}</div>
              <div className="stat-label">Different</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{comparisonResult.missingInSome || 0}</div>
              <div className="stat-label">Missing in Some</div>
            </div>
          </div>
        </div>

        <div className="controls-comparison">
          <h3>🔍 Control-by-Control Comparison</h3>
          <div className="comparison-table-container">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>Control ID</th>
                  <th>Title</th>
                  {reports.baseline && <th>{reportNames.baseline}</th>}
                  {reports.csp1 && <th>{reportNames.csp1}</th>}
                  {reports.csp2 && <th>{reportNames.csp2}</th>}
                  <th>Differences</th>
                </tr>
              </thead>
              <tbody>
                {comparisonResult.controls && comparisonResult.controls.map((control, idx) => (
                  <tr key={idx} className={control.hasDifferences ? 'has-differences' : ''}>
                    <td>
                      <button 
                        className="control-id-link"
                        onClick={() => handleControlClick(control.id)}
                        title="Click to edit this control in the Assessment Subject Report"
                      >
                        <strong>{control.id}</strong> 📝
                      </button>
                    </td>
                    <td>{control.title || 'N/A'}</td>
                    {reports.baseline && (
                      <td className={`status-${control.baseline?.status || 'not-found'}`}>
                        {control.baseline ? control.baseline.status : 'N/A'}
                      </td>
                    )}
                    {reports.csp1 && (
                      <td className={`status-${control.csp1?.status || 'not-found'}`}>
                        {control.csp1 ? control.csp1.status : 'N/A'}
                      </td>
                    )}
                    {reports.csp2 && (
                      <td className={`status-${control.csp2?.status || 'not-found'}`}>
                        {control.csp2 ? control.csp2.status : 'N/A'}
                      </td>
                    )}
                    <td>
                      {control.hasDifferences ? (
                        <span className="badge badge-warning">⚠️ Differs</span>
                      ) : (
                        <span className="badge badge-success">✓ Same</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Control Edit Modal - portaled to document.body so it appears above comparison view */}
        {editingControl && ReactDOM.createPortal(
          <ControlEditModal
            control={editingControl}
            onClose={() => setEditingControl(null)}
            onSave={handleControlSave}
            allControls={baselineControls ? Object.values(baselineControls) : []}
            organizationName={reports.baseline?.['system-security-plan']?.['system-characteristics']?.organization || 'Organization'}
            databaseIntegrationEnabled={databaseIntegrationEnabled}
            adobeTeamOptions={adobeTeamOptions}
          />,
          document.body
        )}

        {renderAssessmentExportPanel()}

        <footer className="app-footer">
          <p>
            <strong>Made with Passion by Mukesh Kesharwani</strong><br />
            <small>mukesh.kesharwani@adobe.com | Adobe - Built with React and Node.js</small><br />
            <small style={{ opacity: 0.7, fontSize: '0.85em' }}>
              {buildInfo.getFormattedInfo()} | {buildInfo.environment === 'development' ? '🔧 Development Mode' : '🚀 Production Build'}
            </small>
          </p>
        </footer>
      </div>
    );
  }

  return (
    <div className="multi-report-comparison">
      {/* Application Title */}
      <header className="app-header">
        <button 
          className="settings-btn" 
          onClick={onShowSettings}
          title="API Credentials & Settings"
        >
          ⚙️ Settings
        </button>
        <div className="header-content">
          <h1>Keekar's OSCAL SOA/SSP/CCM Generator <span className="beta-badge" title="Beta Release">Beta</span></h1>
          <p>Generate Statement of Applicability, System Security Plans, and Cloud Control Matrix from OSCAL Catalogues</p>
        </div>
      </header>

      <div className="comparison-header">
        <button className="btn-secondary comparison-back-btn" onClick={onBack}>
          ← Back to Main
        </button>
        <div className="comparison-title-section">
          <h2>📊 Multi-Report Comparison</h2>
          <p>Compare your platform baseline report with Supporting Cloud Service Provider (CSP) reports - Maximum Two More</p>
          <h3 className="step-title">Step 1: Load Reports</h3>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          ❌ {error}
        </div>
      )}

      <div className="mrc-prefs-notice info-box">
        <div className="mrc-prefs-notice-title">ℹ️ Your report URLs</div>
        <p>
          — Each user supplies report sources here (URL or file). Last-used URLs are remembered in this browser only, not on the server. Other users will not see your URLs.
        </p>
        <p>
          — If you clear your browser cache, these remembered URLs will be removed.
        </p>
      </div>

      <div className="upload-section">
        {REPORT_SLOTS.map((slotKey) => renderReportSlot(slotKey))}
      </div>

      <div className="action-section">
        <button 
          className="btn-primary btn-large"
          onClick={handleCompare}
          disabled={loading || Object.values(reports).filter(r => r !== null).length < 2}
        >
          {loading ? '⏳ Comparing...' : '🔍 Compare Reports'}
        </button>
        <p className="help-text">
          Upload at least 2 reports to enable comparison
        </p>
      </div>

      <footer className="app-footer">
        <p>
          <strong>Made with Passion by Mukesh Kesharwani</strong><br />
          <small>mukesh.kesharwani@adobe.com | Adobe - Built with React and Node.js</small><br />
          <small style={{ opacity: 0.7, fontSize: '0.85em' }}>
            {buildInfo.getFormattedInfo()} | {buildInfo.environment === 'development' ? '🔧 Development Mode' : '🚀 Production Build'}
          </small>
        </p>
      </footer>
    </div>
  );
}

export default MultiReportComparison;

