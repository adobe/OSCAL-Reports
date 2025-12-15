/**
 * MultiReportComparison Component - Compare 3 OSCAL reports
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license MIT
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import buildInfo from '../utils/buildInfo';
import { useAuth } from '../contexts/AuthContext';
import './MultiReportComparison.css';

function MultiReportComparison({ onBack, onShowSettings }) {
  const { getAuthConfig } = useAuth();
  const [publishedSoaUrl, setPublishedSoaUrl] = useState('');
  const [reports, setReports] = useState({
    baseline: null,      // Your default/current report or published SOA
    csp1: null,          // First CSP report (IaaS/PaaS/SaaS)
    csp2: null           // Second CSP report (IaaS/PaaS/SaaS)
  });
  const [reportNames, setReportNames] = useState({
    baseline: 'Baseline Report',
    csp1: 'CSP Report 1',
    csp2: 'CSP Report 2'
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

  // Load published SOA URL from server settings
  useEffect(() => {
    const fetchPublishedUrl = async () => {
      try {
        const response = await axios.get('/api/settings', getAuthConfig());
        const serverSettings = response.data;
        setPublishedSoaUrl(serverSettings.publishedSoaUrl || '');
        console.log('✅ Loaded Published URL from server:', serverSettings.publishedSoaUrl);
      } catch (error) {
        console.error('❌ Failed to load Published URL from server:', error);
      }
    };
    fetchPublishedUrl();
  }, [getAuthConfig]);

  const handleFileUpload = async (reportKey, file) => {
    if (!file) return;

    try {
      const text = await file.text();
      const jsonData = JSON.parse(text);
      
      setReports(prev => ({
        ...prev,
        [reportKey]: jsonData
      }));
      
      // Extract system name for display
      const systemName = jsonData['system-security-plan']?.['system-characteristics']?.['system-name'] || 
                        jsonData['system-security-plan']?.metadata?.title ||
                        file.name;
      setReportNames(prev => ({
        ...prev,
        [reportKey]: systemName
      }));
      
      setError('');
    } catch (err) {
      setError(`Error reading ${reportKey} file: ${err.message}`);
    }
  };

  const handleFetchPublished = async () => {
    if (!publishedSoaUrl) {
      setError('No Published SOA/CCM URL configured. Please set it in Settings.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await axios.get(publishedSoaUrl);
      setReports(prev => ({
        ...prev,
        baseline: response.data
      }));
      
      const systemName = response.data['system-security-plan']?.['system-characteristics']?.['system-name'] || 
                        response.data['system-security-plan']?.metadata?.title ||
                        'Published Report';
      setReportNames(prev => ({
        ...prev,
        baseline: systemName
      }));
      
      setError('');
    } catch (err) {
      setError(`Failed to fetch published report: ${err.message}`);
    } finally {
      setLoading(false);
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
      setStep(2); // Move to comparison view
    } catch (err) {
      setError(`Comparison failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setReports({
      baseline: null,
      csp1: null,
      csp2: null
    });
    setReportNames({
      baseline: 'Baseline Report',
      csp1: 'CSP Report 1',
      csp2: 'CSP Report 2'
    });
    setComparisonResult(null);
    setStep(1);
    setError('');
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
            <h1>Keekar's OSCAL SOA/SSP/CCM Generator</h1>
            <p>Generate Statement of Applicability, System Security Plans, and Cloud Control Matrix from OSCAL Catalogues</p>
          </div>
        </header>

        <div className="comparison-header">
          <button className="btn-secondary" onClick={handleReset}>
            ← New Comparison
          </button>
          <h2>📊 Multi-Report Comparison Results</h2>
          <button className="btn-secondary" onClick={onBack}>
            ← Back to Main
          </button>
        </div>

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
                    <td><strong>{control.id}</strong></td>
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
          <h1>Keekar's OSCAL SOA/SSP/CCM Generator</h1>
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

      <div className="upload-section">
        
        {/* Baseline Report */}
        <div className="upload-card">
          <div className="upload-header">
            <h4>📄 This platform default published report</h4>
          </div>
          <div className="upload-body">
            <div className="csp-type-selector">
              <label>Service Type:</label>
              <select 
                className="csp-type-select"
                value={reportTypes.baseline}
                onChange={(e) => setReportTypes(prev => ({ ...prev, baseline: e.target.value }))}
              >
                <option value="IaaS">IaaS (Infrastructure)</option>
                <option value="PaaS">PaaS (Platform)</option>
                <option value="SaaS">SaaS (Software)</option>
              </select>
            </div>
            {reports.baseline ? (
              <div className="uploaded-info">
                <span className="success-icon">✅</span>
                <div>
                  <strong>{reportNames.baseline}</strong>
                  <small>{reportTypes.baseline} Provider OSCAL Report</small>
                </div>
                <button 
                  className="btn-sm btn-danger"
                  onClick={() => setReports(prev => ({ ...prev, baseline: null }))}
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="upload-options">
                {publishedSoaUrl ? (
                  <button 
                    className="btn-primary"
                    onClick={handleFetchPublished}
                    disabled={loading}
                  >
                    {loading ? '⏳ Fetching...' : '🌐 Fetch Published'}
                  </button>
                ) : (
                  <div className="no-url-message">
                    <p>⚠️ No Published SOA/CCM URL configured.</p>
                    <p>Please configure the URL in <strong>Settings</strong> to use this feature.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* CSP Report 1 */}
        <div className="upload-card">
          <div className="upload-header">
            <h4>☁️ Cloud Service Provider 1 Report</h4>
          </div>
          <div className="upload-body">
            <div className="csp-type-selector">
              <label>Service Type:</label>
              <select 
                className="csp-type-select"
                value={reportTypes.csp1}
                onChange={(e) => setReportTypes(prev => ({ ...prev, csp1: e.target.value }))}
              >
                <option value="IaaS">IaaS (Infrastructure)</option>
                <option value="PaaS">PaaS (Platform)</option>
                <option value="SaaS">SaaS (Software)</option>
              </select>
            </div>
            {reports.csp1 ? (
              <div className="uploaded-info">
                <span className="success-icon">✅</span>
                <div>
                  <strong>{reportNames.csp1}</strong>
                  <small>{reportTypes.csp1} Provider OSCAL Report</small>
                </div>
                <button 
                  className="btn-sm btn-danger"
                  onClick={() => setReports(prev => ({ ...prev, csp1: null }))}
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="upload-options">
                <label className="file-upload-btn">
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => handleFileUpload('csp1', e.target.files[0])}
                  />
                  📁 Upload OSCAL JSON
                </label>
              </div>
            )}
          </div>
        </div>

        {/* CSP Report 2 */}
        <div className="upload-card">
          <div className="upload-header">
            <h4>☁️ Cloud Service Provider 2 Report</h4>
          </div>
          <div className="upload-body">
            <div className="csp-type-selector">
              <label>Service Type:</label>
              <select 
                className="csp-type-select"
                value={reportTypes.csp2}
                onChange={(e) => setReportTypes(prev => ({ ...prev, csp2: e.target.value }))}
              >
                <option value="IaaS">IaaS (Infrastructure)</option>
                <option value="PaaS">PaaS (Platform)</option>
                <option value="SaaS">SaaS (Software)</option>
              </select>
            </div>
            {reports.csp2 ? (
              <div className="uploaded-info">
                <span className="success-icon">✅</span>
                <div>
                  <strong>{reportNames.csp2}</strong>
                  <small>{reportTypes.csp2} Provider OSCAL Report</small>
                </div>
                <button 
                  className="btn-sm btn-danger"
                  onClick={() => setReports(prev => ({ ...prev, csp2: null }))}
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="upload-options">
                <label className="file-upload-btn">
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => handleFileUpload('csp2', e.target.files[0])}
                  />
                  📁 Upload OSCAL JSON
                </label>
              </div>
            )}
          </div>
        </div>
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

