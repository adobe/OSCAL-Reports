/**
 * OSCAL SOA/SSP/CCM Generator - Main Application Component
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license MIT
 * 
 * Main application component that manages the workflow for creating and editing
 * OSCAL-compliant System Security Plans (SSP), Statement of Applicability (SOA),
 * and Cloud Control Matrix (CCM) documents.
 */

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './components/Login';
import UserManagement from './components/UserManagement';
import SettingsWithTabs from './components/SettingsWithTabs';
import UseCases from './components/UseCases';
import InitialChoice from './components/InitialChoice';
import CatalogChoice from './components/CatalogChoice';
import CatalogueInput from './components/CatalogueInput';
import CCMUpload from './components/CCMUpload';
import SystemInfoForm from './components/SystemInfoForm';
import ControlsList from './components/ControlsList';
import ExportButtons from './components/ExportButtons';
import SaveLoadBar from './components/SaveLoadBar';
import MultiReportComparison from './components/MultiReportComparison';
import IntegrityWarning from './components/IntegrityWarning';
import { saveSSPData, loadSSPData, hasSavedData, getLastSaveTime, clearSSPData } from './utils/storage';
import buildInfo from './utils/buildInfo';
import './App.css';

function App() {
  const [step, setStep] = useState(1); // 1: Load/New, 1.5: Catalog selection, 1.75: CCM Upload (optional), 2: System Info, 3: Controls
  const [catalogueUrl, setCatalogueUrl] = useState('');
  const [catalogue, setCatalogue] = useState(null);
  const [controls, setControls] = useState([]);
  const [initialClassification, setInitialClassification] = useState(null);
  const [systemInfo, setSystemInfo] = useState({
    title: 'System Security Plan',
    systemName: '',
    systemId: '',
    description: '',
    securityLevel: 'moderate',
    confidentiality: 'moderate',
    integrity: 'moderate',
    availability: 'moderate',
    status: 'under-development'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [integrityWarning, setIntegrityWarning] = useState(null);
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const [comparisonStats, setComparisonStats] = useState(null);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [showLoadPrompt, setShowLoadPrompt] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // New states for revised workflow
  const [existingSSP, setExistingSSP] = useState(null);
  const [existingCatalogUrl, setExistingCatalogUrl] = useState(null);
  const [isStartingFresh, setIsStartingFresh] = useState(false);

  // Check for saved data on mount
  useEffect(() => {
    if (hasSavedData() && step === 1) {
      setShowLoadPrompt(true);
    }
    const savedTime = getLastSaveTime();
    if (savedTime) {
      setLastSaveTime(savedTime);
    }
  }, []);

  // Helper function to sanitize date fields in controls
  const sanitizeDateFields = useCallback((controlsArray) => {
    if (!Array.isArray(controlsArray)) return controlsArray;
    
    return controlsArray.map(control => {
      const sanitized = { ...control };
      
      // Convert any Date objects to strings
      const dateFields = ['implementationDate', 'reviewDate', 'nextReviewDate', 'lastTestDate'];
      dateFields.forEach(field => {
        if (sanitized[field] instanceof Date) {
          sanitized[field] = sanitized[field].toISOString().split('T')[0];
        } else if (sanitized[field] && typeof sanitized[field] === 'object' && !(typeof sanitized[field] === 'string')) {
          // If it's some other object that's not a string, convert to empty string
          sanitized[field] = '';
        }
      });
      
      return sanitized;
    });
  }, []);

  // Debug: Log state changes
  useEffect(() => {
    console.log('📊 Current State:', {
      step,
      isStartingFresh,
      existingCatalogUrl: existingCatalogUrl || 'null/empty',
      loading,
      hasExistingSSP: !!existingSSP,
      hasCatalogue: !!catalogue,
      controlsCount: controls.length
    });
  }, [step, isStartingFresh, existingCatalogUrl, loading, existingSSP, catalogue, controls.length]);

  // Track controls changes specifically
  useEffect(() => {
    console.log('🎯 CONTROLS CHANGED:', {
      count: controls.length,
      firstControl: controls[0]?.id || 'none',
      timestamp: new Date().toLocaleTimeString()
    });
  }, [controls]);

  // Auto-save functionality
  const autoSave = useCallback(() => {
    if (autoSaveEnabled && step === 3 && controls.length > 0) {
      const dataToSave = {
        step,
        catalogueUrl,
        catalogue,
        controls,
        systemInfo
      };
      const success = saveSSPData(dataToSave);
      if (success) {
        setLastSaveTime(new Date());
      }
    }
  }, [autoSaveEnabled, step, catalogueUrl, catalogue, controls, systemInfo]);

  // Auto-save on control updates (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      autoSave();
    }, 2000); // 2 second debounce

    return () => clearTimeout(timer);
  }, [controls, systemInfo, autoSave]);

  // NEW WORKFLOW: Load existing SSP
  const handleLoadExistingSSP = async (sspData) => {
    console.log('🔵 handleLoadExistingSSP called with SSP data');
    setLoading(true);
    setError('');
    
    try {
      console.log('📡 Extracting catalog URL from SSP...');
      // Extract catalog URL from SSP
      const response = await axios.post('/api/extract-catalog-from-ssp', { sspData });
      console.log('✅ Catalog URL extracted:', response.data.catalogUrl);
      
      // Check for integrity warning
      if (response.data.integrityWarning) {
        console.warn('⚠️ Integrity warning:', response.data.integrityWarning);
        setIntegrityWarning(response.data.integrityWarning);
      }
      
      setExistingSSP(sspData);
      setExistingCatalogUrl(response.data.catalogUrl);
      setIsStartingFresh(false);
      console.log('✅ State set: existingCatalogUrl =', response.data.catalogUrl, ', isStartingFresh = false');
      console.log('✅ Moving to step 1.5');
      setStep(1.5); // Go to catalog choice
    } catch (err) {
      console.error('❌ Error in handleLoadExistingSSP:', err);
      const errorMessage = err.response?.data?.error || 'Failed to extract catalog from SSP';
      const warning = err.response?.data?.integrityWarning;
      
      if (warning) {
        setIntegrityWarning(warning);
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // NEW WORKFLOW: Start fresh
  const handleStartFresh = () => {
    console.log('🔵 handleStartFresh called');
    setIsStartingFresh(true);
    setExistingSSP(null);
    setExistingCatalogUrl(null);
    setComparisonStats(null);
    console.log('✅ Moving to step 1.5 (CatalogueInput) for fresh start');
    setStep(1.5); // Go to catalog input
  };

  // NEW WORKFLOW: Keep existing catalog
  const handleKeepExistingCatalog = async () => {
    console.log('🔵 handleKeepExistingCatalog called');
    setLoading(true);
    setError('');
    
    try {
      console.log('📡 Fetching catalog:', existingCatalogUrl);
      // Load the same catalog and populate with existing data
      const response = await axios.post('/api/fetch-catalogue', { url: existingCatalogUrl });
      console.log('✅ Catalog fetched:', response.data);
      setCatalogue(response.data.catalogue);
      setCatalogueUrl(existingCatalogUrl);
      
      console.log('📡 Extracting controls from SSP');
      // Extract controls from existing SSP and populate
      const extractResponse = await axios.post('/api/extract-controls-from-ssp', {
        catalogControls: response.data.controls,
        existingSSP: existingSSP
      });
      console.log('✅ Controls extracted:', extractResponse.data);
      
      // Check for integrity warning
      if (extractResponse.data.integrityWarning) {
        console.warn('⚠️ Integrity warning:', extractResponse.data.integrityWarning);
        setIntegrityWarning(extractResponse.data.integrityWarning);
      }
      
      setControls(sanitizeDateFields(extractResponse.data.controls));
      setSystemInfo(extractResponse.data.systemInfo || systemInfo);
      setInitialClassification(extractResponse.data.classification);
      setComparisonStats(null); // No comparison needed
      console.log('✅ Moving to step 2');
      setStep(2); // Go to system info
    } catch (err) {
      console.error('❌ Error in handleKeepExistingCatalog:', err);
      const errorMessage = err.response?.data?.error || 'Failed to load existing catalog';
      const warning = err.response?.data?.integrityWarning;
      
      if (warning) {
        setIntegrityWarning(warning);
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // NEW WORKFLOW: Update to new catalog
  const handleUpdateCatalog = async (url, classification) => {
    console.log('🔵 handleUpdateCatalog called with:', url, classification);
    setLoading(true);
    setError('');
    
    try {
      console.log('📡 Fetching new catalog:', url);
      // Fetch new catalog
      const response = await axios.post('/api/fetch-catalogue', { url });
      console.log('✅ New catalog fetched:', response.data);
      setCatalogue(response.data.catalogue);
      setCatalogueUrl(url);
      setInitialClassification(classification);
      
      console.log('📡 Comparing with existing SSP');
      // Compare with existing SSP
      const compareResponse = await axios.post('/api/compare-ssp', {
        catalogControls: response.data.controls,
        existingSSP: existingSSP,
        catalogData: response.data.catalogue
      });
      console.log('✅ Comparison complete:', compareResponse.data);
      
      // Check for integrity warning
      if (compareResponse.data.integrityWarning) {
        console.warn('⚠️ Integrity warning:', compareResponse.data.integrityWarning);
        setIntegrityWarning(compareResponse.data.integrityWarning);
      }
      
      setControls(sanitizeDateFields(compareResponse.data.controls));
      setComparisonStats(compareResponse.data.stats);
      setSystemInfo(compareResponse.data.systemInfo || systemInfo);
      console.log('✅ Moving to step 2');
      setStep(2); // Go to system info
    } catch (err) {
      console.error('❌ Error in handleUpdateCatalog:', err);
      const errorMessage = err.response?.data?.error || 'Failed to update catalog';
      const warning = err.response?.data?.integrityWarning;
      
      if (warning) {
        setIntegrityWarning(warning);
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // For starting fresh: just select catalog
  const handleFetchCatalogue = async (url, classification = null) => {
    setLoading(true);
    setError('');
    
    console.log('🔵 handleFetchCatalogue called with URL:', url);
    
    try {
      console.log('📡 Posting to /api/fetch-catalogue...');
      const response = await axios.post('/api/fetch-catalogue', { url });
      console.log('✅ Catalogue fetched successfully');
      console.log('📊 Controls count in response:', response.data.controls?.length);
      
      const processedControls = sanitizeDateFields(response.data.controls.map(control => ({
        ...control,
        status: 'not-assessed',
        implementation: '',
        remarks: ''
      })));
      
      console.log('✅ Processed controls count:', processedControls.length);
      console.log('📦 Setting catalogue...');
      setCatalogue(response.data.catalogue);
      console.log('📦 Setting controls...');
      setControls(processedControls);
      console.log('📦 Setting catalogueUrl...');
      setCatalogueUrl(url);
      console.log('📦 Setting initialClassification...');
      setInitialClassification(classification);
      console.log('📦 Clearing comparisonStats...');
      setComparisonStats(null);
      console.log('📦 Setting step to 1.75...');
      setStep(1.75); // Go to CCM upload (optional)
      console.log('✅ All state updates complete!');
    } catch (err) {
      console.error('❌ Catalogue fetch failed:', {
        url,
        status: err.response?.status,
        statusText: err.response?.statusText,
        errorMessage: err.response?.data?.error,
        fullError: err.message
      });
      setError(err.response?.data?.error || `Failed to fetch catalogue: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle CCM import
  const handleCCMImport = (importData) => {
    console.log('CCM Import received:', importData.statistics);
    
    // Merge imported controls with catalog controls
    const mergedControls = controls.map(catalogControl => {
      const importedControl = importData.controls.find(ic => ic.id === catalogControl.id);
      if (importedControl) {
        // Merge imported data with catalog structure
        return {
          ...catalogControl,
          ...importedControl,
          // Keep catalog metadata
          groupId: catalogControl.groupId,
          groupTitle: catalogControl.groupTitle,
          parentId: catalogControl.parentId
        };
      }
      return catalogControl;
    });
    
    setControls(sanitizeDateFields(mergedControls));
    
    // Update system info from imported data
    if (importData.systemInfo) {
      setSystemInfo(prev => ({
        ...prev,
        ...importData.systemInfo
      }));
    }
    
    // Set a flag or message indicating CCM was imported
    setComparisonStats({
      imported: true,
      totalControls: importData.statistics.totalControls,
      withImplementation: importData.statistics.withImplementation,
      withStatus: importData.statistics.withStatus
    });
    
    setStep(2); // Go to system info for review/validation
  };

  // Skip CCM upload
  const handleSkipCCMUpload = () => {
    setStep(2); // Go directly to system info
  };

  const handleSystemInfoComplete = (info) => {
    console.log('🔵 handleSystemInfoComplete called');
    console.log('📊 Current controls count:', controls?.length || 0);
    console.log('📊 Current catalogue:', catalogue ? 'Loaded' : 'Not loaded');
    
    if (!controls || controls.length === 0) {
      console.error('❌ ERROR: No controls available when moving to step 3!');
      console.error('   - catalogueUrl:', catalogueUrl);
      console.error('   - catalogue object:', catalogue);
      setError('Controls data is missing. Please go back and reload the catalog.');
      return;
    }
    
    setSystemInfo({ ...systemInfo, ...info, catalogueUrl });
    console.log('✅ Moving to step 3 with', controls.length, 'controls');
    setStep(3);
  };

  const handleControlUpdate = (controlId, field, value) => {
    setControls(prevControls => prevControls.map(control => 
      control.id === controlId ? { ...control, [field]: value } : control
    ));
  };

  // Helper function to get current page title
  const getPageTitle = () => {
    if (step === 1) return 'Initial Choice';
    if (step === 1.5) return 'Catalog Selection';
    if (step === 1.75) return 'Select Compliance Framework';
    if (step === 2) return 'System Information';
    if (step === 3) return 'Document Controls';
    return 'OSCAL Generator';
  };

  // Helper function to generate filename with system name and date
  const generateFileName = (extension) => {
    const systemName = systemInfo.systemName || 'System';
    const sanitizedName = systemName.replace(/[^a-zA-Z0-9]/g, '_'); // Replace special chars with underscore
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    return `${sanitizedName}_ComplianceReport_${today}.${extension}`;
  };

  const handleExportSSP = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await axios.post('/api/generate-ssp', {
        metadata: catalogue?.catalog?.metadata || catalogue?.metadata,
        controls,
        systemInfo: {
          ...systemInfo,
          catalogueUrl  // Include catalogueUrl so it can be saved in import-profile.href
        }
      });

      const blob = new Blob([JSON.stringify(response.data, null, 2)], {
        type: 'application/json'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = generateFileName('json');
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate SSP');
    } finally {
      setLoading(false);
    }
  };

  const handleExportExcel = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await axios.post('/api/generate-excel', {
        controls,
        systemInfo
      }, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = generateFileName('xlsx');
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to generate Excel file');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    if (window.confirm('Start over? Your current progress will be saved locally.')) {
      autoSave(); // Save before reset
      setStep(1);
      setCatalogueUrl('');
      setCatalogue(null);
      setControls([]);
      setError('');
    }
  };

  const handleLoadData = (data = null) => {
    const savedData = data || loadSSPData();
    if (savedData) {
      setStep(savedData.step || 1);
      setCatalogueUrl(savedData.catalogueUrl || '');
      setCatalogue(savedData.catalogue || null);
      setControls(sanitizeDateFields(savedData.controls || []));
      setSystemInfo(savedData.systemInfo || systemInfo);
      setShowLoadPrompt(false);
      setLastSaveTime(new Date(savedData.lastModified));
    }
  };

  const handleClearData = () => {
    setStep(1);
    setCatalogueUrl('');
    setCatalogue(null);
    setControls([]);
    setSystemInfo({
      title: 'System Security Plan',
      systemName: '',
      systemId: '',
      description: '',
      securityLevel: 'moderate',
      confidentiality: 'moderate',
      integrity: 'moderate',
      availability: 'moderate',
      status: 'under-development'
    });
    setLastSaveTime(null);
  };

  const handleExportCCM = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await axios.post('/api/generate-ccm', {
        controls,
        systemInfo
      }, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = generateFileName('xlsx').replace('ComplianceReport', 'CCM');
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to generate Cloud Control Matrix');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await axios.post('/api/generate-pdf', {
        metadata: catalogue?.catalog?.metadata || catalogue?.metadata,
        controls,
        systemInfo: {
          ...systemInfo,
          catalogueUrl  // Include catalogueUrl for proper export
        }
      }, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = generateFileName('pdf');
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to generate PDF report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <button 
          className="settings-btn" 
          onClick={() => setShowSettings(true)}
          title="API Credentials & Settings"
        >
          ⚙️ Settings
        </button>
        <div className="header-content">
          <h1>Keekar's OSCAL SOA/SSP/CCM Generator</h1>
          <p>Generate Statement of Applicability, System Security Plans, and Cloud Control Matrix from OSCAL Catalogues</p>
        </div>
      </header>

      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
            <SettingsWithTabs onClose={() => setShowSettings(false)} />
          </div>
        </div>
      )}

      <main className="app-main">
        {/* Saved Session Alert with Page Title */}
        {showLoadPrompt && (
          <div className="alert alert-info alert-thin">
            <button className="btn btn-secondary btn-sm alert-btn-left" onClick={() => setShowLoadPrompt(false)}>
              ✨ Start Fresh
            </button>
            <div className="alert-title">
              <span className="page-title">{getPageTitle()}</span>
              <small className="alert-subtitle">You have saved data from a previous session</small>
            </div>
            <button className="btn btn-primary btn-sm alert-btn-right" onClick={() => handleLoadData()}>
              💾 Load Saved Data
            </button>
          </div>
        )}

        {integrityWarning && (
          <IntegrityWarning 
            warning={integrityWarning} 
            onDismiss={() => setIntegrityWarning(null)}
          />
        )}
        {error && (
          <div className="alert alert-error">
            <span className="alert-icon">⚠️</span>
            <span>{error}</span>
            <button className="alert-close" onClick={() => setError('')}>×</button>
          </div>
        )}

        {/* Progress Steps Indicator */}
        {step > 1 && (
          <div className="steps-indicator">
            <div className={`step ${step >= 1.5 ? 'active' : ''} ${step > 1.5 ? 'completed' : ''}`}>
              <div className="step-number">1</div>
              <div className="step-label">Select Catalog</div>
            </div>
            <div className={`step ${step >= 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}>
              <div className="step-number">2</div>
              <div className="step-label">System Info</div>
            </div>
            <div className={`step ${step >= 3 ? 'active' : ''}`}>
              <div className="step-number">3</div>
              <div className="step-label">Document Controls</div>
            </div>
          </div>
        )}

        {/* Auto-save Status Bar */}
        {step === 3 && (
          <div className="autosave-bar">
            <div className="autosave-status">
              <span className="autosave-icon">💾</span>
              <span className="autosave-text">
                <strong>Auto-save enabled</strong>
                {lastSaveTime && (
                  <> · Last saved: <span className="save-time">{lastSaveTime.toLocaleTimeString()}</span></>
                )}
              </span>
            </div>
            <div className="autosave-actions">
              <button 
                className="btn btn-sm btn-secondary" 
                onClick={handleLoadData}
                title="Reload saved data"
              >
                🔄 Reload
              </button>
              <button 
                className="btn btn-sm btn-secondary" 
                onClick={handleClearData}
                title="Clear all saved data"
              >
                🗑️ Clear
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Initial Choice - Load existing or start fresh */}
        {step === 1 && (
          <InitialChoice
            onLoadExisting={handleLoadExistingSSP}
            onStartFresh={handleStartFresh}
            loading={loading}
          />
        )}

        {/* Step 1.5: Catalog Selection - Only for loaded SSP */}
        {step === 1.5 && !isStartingFresh && existingCatalogUrl && (
          <CatalogChoice
            existingCatalogUrl={existingCatalogUrl}
            onKeepExisting={handleKeepExistingCatalog}
            onUpdateCatalog={handleUpdateCatalog}
            loading={loading}
          />
        )}

        {step === 1.5 && isStartingFresh && (
          <CatalogueInput 
            onSubmit={handleFetchCatalogue}
            loading={loading}
          />
        )}

        {/* Step 1.75: CCM Upload (Optional) */}
        {step === 1.75 && (
          <CCMUpload
            onImportComplete={handleCCMImport}
            onSkip={handleSkipCCMUpload}
            catalogueUrl={catalogueUrl}
          />
        )}

        {step === 2 && (
          <SystemInfoForm
            onSubmit={handleSystemInfoComplete}
            onBack={() => setStep(1.5)}
            catalogueUrl={catalogueUrl}
            initialClassification={initialClassification}
            initialValues={systemInfo}
          />
        )}

        {step === 3 && (
          <>
            {!controls || !Array.isArray(controls) || controls.length === 0 ? (
              <div style={{ 
                padding: '3rem', 
                textAlign: 'center', 
                background: '#fff3cd', 
                borderRadius: '8px',
                border: '1px solid #ffc107',
                margin: '2rem 0'
              }}>
                <h3>⚠️ No Controls Available</h3>
                <p>Controls data is missing or empty. This usually happens if:</p>
                <ul style={{ textAlign: 'left', maxWidth: '600px', margin: '1rem auto' }}>
                  <li>The catalog failed to load properly</li>
                  <li>The catalog URL is invalid</li>
                  <li>Network connection issues</li>
                </ul>
                <button 
                  className="btn btn-primary" 
                  onClick={handleReset}
                  style={{ marginTop: '1rem' }}
                >
                  Start Over
                </button>
              </div>
            ) : (
              <>
                <div className="controls-header">
                  <div>
                    <h2>Control Implementation</h2>
                    <p className="text-muted">
                      Document implementation details for <strong>{controls.length} controls</strong> of{' '}
                      <strong>{catalogue?.catalog?.metadata?.title || catalogue?.metadata?.title || 'OSCAL Catalogue'}</strong>
                      {(catalogue?.catalog?.metadata?.version || catalogue?.metadata?.version) && (
                        <>, Version: <strong>{catalogue.catalog?.metadata?.version || catalogue.metadata?.version}</strong></>
                      )}
                      {(catalogue?.catalog?.metadata?.['oscal-version'] || catalogue?.metadata?.['oscal-version']) && (
                        <>, OSCAL Version: <strong>{catalogue.catalog?.metadata?.['oscal-version'] || catalogue.metadata?.['oscal-version']}</strong></>
                      )}
                      {systemInfo.systemName && (
                        <> | System: <strong>{systemInfo.systemName}</strong></>
                      )}
                      {systemInfo.securityLevel && (
                        <> | Classification: <strong>{systemInfo.securityLevel}</strong></>
                      )}
                    </p>
                  </div>
                  <button className="btn btn-secondary" onClick={handleReset}>
                    Start Over
                  </button>
                </div>
                
                <ControlsList
                  controls={controls}
                  onControlUpdate={handleControlUpdate}
                />

                <ExportButtons
                  onExportSSP={handleExportSSP}
                  onExportExcel={handleExportExcel}
                  onExportCCM={handleExportCCM}
                  onExportPDF={handleExportPDF}
                  loading={loading}
                  systemInfo={systemInfo}
                  controls={controls}
                />
              </>
            )}
          </>
        )}
      </main>

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

// Wrap the main app to show use cases first
function AppWithUseCases() {
  const { isAuthenticated, loading, user, logout, canManageUsers } = useAuth();
  const [showUseCases, setShowUseCases] = useState(true);
  const [showMultiReportComparison, setShowMultiReportComparison] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="login-container">
        <div className="login-box">
          <div className="login-header">
            <h1>🔐 Keekar's OSCAL Generator</h1>
            <p>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!isAuthenticated) {
    return <Login />;
  }

  // User menu component
  const UserMenu = () => (
    <div className="user-menu">
      <button 
        className="user-menu-btn"
        onClick={() => setShowUserMenu(!showUserMenu)}
      >
        👤 {user?.username} ({user?.role})
      </button>
      {showUserMenu && (
        <div className="user-menu-dropdown">
          <div className="user-info">
            <strong>{user?.fullName || user?.username}</strong>
            <small>{user?.email}</small>
            <small className="user-role">{user?.role}</small>
          </div>
          {canManageUsers() && (
            <button onClick={() => { setShowUserManagement(true); setShowUserMenu(false); }}>👥 User Management</button>
          )}
          <button onClick={() => { setShowSettings(true); setShowUserMenu(false); }}>⚙️ Settings</button>
          <button onClick={logout} className="logout-btn">🚪 Logout</button>
        </div>
      )}
    </div>
  );

  if (showMultiReportComparison) {
    return (
      <>
        <div className="app-header-user-menu">
          <UserMenu />
        </div>
        <MultiReportComparison 
          onBack={() => {
            setShowMultiReportComparison(false);
            setShowUseCases(true);
          }}
          onShowSettings={() => setShowSettings(true)}
        />
        {/* Settings Modal Overlay */}
        {showSettings && (
          <div className="modal-overlay" onClick={() => setShowSettings(false)}>
            <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
              <SettingsWithTabs onClose={() => setShowSettings(false)} />
            </div>
          </div>
        )}
        {/* User Management Modal */}
        {showUserManagement && (
          <div className="modal-overlay user-management-overlay" onClick={() => setShowUserManagement(false)}>
            <div className="modal-content user-management-modal" onClick={(e) => e.stopPropagation()}>
              <UserManagement onClose={() => setShowUserManagement(false)} />
            </div>
          </div>
        )}
      </>
    );
  }

  if (showUseCases) {
    return (
      <>
        <div className="app-header-user-menu">
          <UserMenu />
        </div>
        <UseCases 
          onGetStarted={() => setShowUseCases(false)} 
          onMultiReportComparison={() => {
            setShowUseCases(false);
            setShowMultiReportComparison(true);
          }}
        />
        {/* Settings Modal */}
        {showSettings && (
          <div className="modal-overlay" onClick={() => setShowSettings(false)}>
            <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
              <SettingsWithTabs onClose={() => setShowSettings(false)} />
            </div>
          </div>
        )}
        {/* User Management Modal */}
        {showUserManagement && (
          <div className="modal-overlay user-management-overlay" onClick={() => setShowUserManagement(false)}>
            <div className="modal-content user-management-modal" onClick={(e) => e.stopPropagation()}>
              <UserManagement onClose={() => setShowUserManagement(false)} />
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="app-header-user-menu">
        <UserMenu />
      </div>
      <App onShowSettings={() => setShowSettings(true)} />
      {/* Settings Modal */}
      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
            <SettingsWithTabs onClose={() => setShowSettings(false)} />
          </div>
        </div>
      )}
      {/* User Management Modal */}
      {showUserManagement && (
        <div className="modal-overlay" onClick={() => setShowUserManagement(false)}>
          <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
            <UserManagement onClose={() => setShowUserManagement(false)} />
          </div>
        </div>
      )}
    </>
  );
}

// Wrap with AuthProvider
function AppWithAuth() {
  return (
    <AuthProvider>
      <AppWithUseCases />
    </AuthProvider>
  );
}

export default AppWithAuth;

