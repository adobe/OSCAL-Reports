/**
 * ControlItemCCM Component - CCM-specific control item with enhanced fields
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license MIT
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ControlSuggestions from './ControlSuggestions';
import './ControlItem.css';
import './ControlItemCCM.css';

const STATUS_OPTIONS = [
  { value: 'not-assessed', label: 'Not Assessed', color: 'not-assessed' },
  { value: 'effective', label: 'Effective', color: 'effective' },
  { value: 'alternate-control', label: 'Alternate Control', color: 'alternate-control' },
  { value: 'ineffective', label: 'Ineffective', color: 'ineffective' },
  { value: 'no-visibility', label: 'No Visibility', color: 'no-visibility' },
  { value: 'not-implemented', label: 'Not Implemented', color: 'not-implemented' },
  { value: 'not-applicable', label: 'Not Applicable', color: 'not-applicable' }
];

const RISK_LEVELS = ['Critical', 'High', 'Medium', 'Low'];
const TEST_FREQUENCIES = ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Annually', 'Ad-hoc'];

function ControlItemCCM({ control, isExpanded, onToggle, onUpdate, allControls = [], organizationName = 'Organization' }) {
  const { canEditImplementationStatus, canEditTestingMethod } = useAuth();
  const [activeTab, setActiveTab] = useState('implementation');
  const [fetchingData, setFetchingData] = useState({});
  const [credentials, setCredentials] = useState([]);

  // Helper function to safely convert Date objects to strings
  const ensureString = (value) => {
    if (!value) return '';
    if (value instanceof Date) {
      return value.toISOString().split('T')[0]; // Convert Date to YYYY-MM-DD
    }
    if (typeof value === 'string') return value;
    return String(value);
  };

  // Load credentials from localStorage
  useEffect(() => {
    const loadCredentials = () => {
      const saved = localStorage.getItem('apiCredentials');
      if (saved) {
        try {
          setCredentials(JSON.parse(saved));
        } catch (e) {
          console.error('Error loading credentials:', e);
          setCredentials([{ id: 'default', name: 'Default Credential', headers: '', isDefault: true }]);
        }
      } else {
        setCredentials([{ id: 'default', name: 'Default Credential', headers: '', isDefault: true }]);
      }
    };

    loadCredentials();

    // Listen for credential updates
    const handleStorageChange = () => {
      loadCredentials();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('credentialsUpdated', handleStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('credentialsUpdated', handleStorageChange);
    };
  }, []);

  const handleChange = (field, value) => {
    onUpdate(control.id, field, value);
  };

  // Function to fetch API data and manage history
  const handleFetchApiData = async (controlId, apiUrl) => {
    if (!apiUrl) {
      alert('Please enter an API URL first.');
      return;
    }

    // Set fetching state
    setFetchingData(prev => ({ ...prev, [controlId]: true }));

    try {
      // Check for API Gateway configuration - route ALL requests through gateway
      const gatewaysConfig = localStorage.getItem('apiGateways');
      let finalUrl = apiUrl;
      let gatewayName = null;

      if (gatewaysConfig) {
        try {
          const gateways = JSON.parse(gatewaysConfig);
          
          // Prefer AWS Gateway if enabled, otherwise use Azure
          if (gateways.aws && gateways.aws.enabled && gateways.aws.url) {
            finalUrl = `${gateways.aws.url}?targetUrl=${encodeURIComponent(apiUrl)}`;
            gatewayName = 'AWS';
            console.log('🔄 Routing through AWS API Gateway:', gateways.aws.url);
          } else if (gateways.azure && gateways.azure.enabled && gateways.azure.url) {
            finalUrl = `${gateways.azure.url}?targetUrl=${encodeURIComponent(apiUrl)}`;
            gatewayName = 'Azure';
            console.log('🔄 Routing through Azure API Gateway:', gateways.azure.url);
          }
        } catch (e) {
          console.warn('Error parsing API Gateway configuration:', e);
        }
      }

      // Check if gateway is configured
      if (!gatewayName) {
        throw new Error('No API Gateway configured. Please configure AWS or Azure API Gateway in Settings.');
      }

      // Use backend proxy to avoid CORS issues
      // API Gateway handles all authentication - no custom headers needed
      const response = await fetch('/api/proxy-fetch', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for SSO
        body: JSON.stringify({
          url: finalUrl,
          method: 'GET',
          headers: {}, // API Gateway handles authentication
        }),
      });

      const proxyResponse = await response.json();
      
      // Check if proxy request was successful
      if (!proxyResponse.success) {
        throw new Error(proxyResponse.error || 'Failed to fetch data through proxy');
      }

      const data = proxyResponse.data;
      const timestamp = new Date().toISOString();
      const dateOnly = timestamp.split('T')[0]; // Get YYYY-MM-DD

      // Get existing history or create new array
      const existingHistory = control.apiDataHistory || [];

      // Check if we already have an entry for today
      const todayEntryIndex = existingHistory.findIndex(entry => 
        entry.timestamp.split('T')[0] === dateOnly
      );

      // Create new entry
      const newEntry = {
        timestamp,
        success: proxyResponse.success,
        status: proxyResponse.status,
        data: data,
      };

      let updatedHistory;
      if (todayEntryIndex >= 0) {
        // Replace today's entry with the new one (most current)
        updatedHistory = [...existingHistory];
        updatedHistory[todayEntryIndex] = newEntry;
      } else {
        // Add new entry at the beginning
        updatedHistory = [newEntry, ...existingHistory];
      }

      // Keep only last 12 entries
      updatedHistory = updatedHistory.slice(0, 12);

      // Update control with new history
      onUpdate(controlId, 'apiDataHistory', updatedHistory);

      // Show success message
      alert(`✅ Data fetched successfully from API!\nStatus: ${proxyResponse.status}\nTimestamp: ${new Date(timestamp).toLocaleString()}`);

    } catch (error) {
      console.error('Error fetching API data:', error);
      
      // Provide more specific error messages
      let errorMessage = error.message;
      if (error.message.includes('Failed to fetch')) {
        errorMessage = 'Network error. Please check your internet connection and verify the API URL is correct.';
      } else if (error.message.includes('NetworkError')) {
        errorMessage = 'Network connection failed. Please check your internet connection.';
      }
      
      // Store failed attempt in history
      const timestamp = new Date().toISOString();
      const dateOnly = timestamp.split('T')[0];
      
      const existingHistory = control.apiDataHistory || [];
      const todayEntryIndex = existingHistory.findIndex(entry => 
        entry.timestamp.split('T')[0] === dateOnly
      );

      const newEntry = {
        timestamp,
        success: false,
        error: errorMessage,
        data: null,
      };

      let updatedHistory;
      if (todayEntryIndex >= 0) {
        updatedHistory = [...existingHistory];
        updatedHistory[todayEntryIndex] = newEntry;
      } else {
        updatedHistory = [newEntry, ...existingHistory];
      }

      updatedHistory = updatedHistory.slice(0, 12);
      onUpdate(controlId, 'apiDataHistory', updatedHistory);

      alert(`❌ Failed to fetch data from API.\nError: ${errorMessage}\n\nTroubleshooting:\n1. Verify the API URL is correct and accessible\n2. If using authentication, ensure you're logged into SSO in this browser\n3. Check if the API endpoint is reachable\n4. Review browser console for detailed error information`);
    } finally {
      // Clear fetching state
      setFetchingData(prev => ({ ...prev, [controlId]: false }));
    }
  };

  const currentStatus = STATUS_OPTIONS.find(s => s.value === control.status) || STATUS_OPTIONS[0];

  return (
    <div className={`control-item ${isExpanded ? 'expanded' : ''}`}>
      <div className="control-header" onClick={onToggle}>
        <div className="control-info">
          <div className="control-id-badge">{control.id}</div>
          <div className="control-title-section">
            <h4 className="control-title">{control.title}</h4>
            {control.groupTitle && (
              <span className="control-group">{control.groupTitle}</span>
            )}
          </div>
        </div>
        <div className="control-header-actions">
          {control.changeStatus && control.changeStatus !== 'unchanged' && (
            <span 
              className={`change-badge change-${control.changeStatus}`}
              title={control.changeReason || ''}
            >
              {control.changeStatus === 'new' && '🆕 New'}
              {control.changeStatus === 'changed' && '⚠️ Changed'}
            </span>
          )}
          <span className={`status-badge status-${currentStatus.color}`}>
            {currentStatus.label}
          </span>
          <button className="expand-btn" type="button">
            {isExpanded ? '▼' : '▶'}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="control-body">
          {control.parts && control.parts.length > 0 && (
            <div className="control-details">
              <h5>Control Details</h5>
              {control.parts.map((part, idx) => (
                <div key={idx} className="control-part">
                  {part.name && <strong>{part.name}:</strong>}
                  {part.prose && <p>{part.prose}</p>}
                </div>
              ))}
            </div>
          )}

          <ControlSuggestions
            control={control}
            existingControls={allControls.filter(c => c.id !== control.id && c.implementation)}
            onApplySuggestion={onUpdate}
          />

          {/* Tab Navigation */}
          <div className="ccm-tabs">
            <button
              className={`ccm-tab ${activeTab === 'implementation' ? 'active' : ''}`}
              onClick={() => setActiveTab('implementation')}
            >
              Implementation
            </button>
            <button
              className={`ccm-tab ${activeTab === 'responsibility' ? 'active' : ''}`}
              onClick={() => setActiveTab('responsibility')}
            >
              Responsibility & Ownership
            </button>
            <button
              className={`ccm-tab ${activeTab === 'testing' ? 'active' : ''}`}
              onClick={() => setActiveTab('testing')}
            >
              Testing & Evidence
            </button>
            {/* Only show Risk & Compliance tab for Not Implemented or Ineffective status */}
            {(control.status === 'not-implemented' || control.status === 'ineffective') && (
              <button
                className={`ccm-tab ${activeTab === 'risk' ? 'active' : ''}`}
                onClick={() => setActiveTab('risk')}
              >
                Risk & Compliance
              </button>
            )}
          </div>

          {/* Tab Content */}
          <div className="ccm-tab-content">
            {activeTab === 'implementation' && (
              <div className="control-form">
                <div className="form-group">
                  <label htmlFor={`status-${control.id}`}>
                    Implementation Status *
                    {!canEditImplementationStatus() && <span style={{ marginLeft: '0.5rem', color: '#d97706', fontSize: '0.85em' }}>🔒 Assessor Role Required</span>}
                  </label>
                  <select
                    id={`status-${control.id}`}
                    className={`form-control status-select status-${control.status || 'not-assessed'}`}
                    value={control.status || 'not-assessed'}
                    onChange={(e) => handleChange('status', e.target.value)}
                    disabled={!canEditImplementationStatus()}
                  >
                    {STATUS_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor={`implementation-${control.id}`}>
                    Implementation Details *
                  </label>
                  <textarea
                    id={`implementation-${control.id}`}
                    className="form-control"
                    rows="4"
                    placeholder="Describe how this control is implemented in your system..."
                    value={control.implementation || ''}
                    onChange={(e) => handleChange('implementation', e.target.value)}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor={`impl-date-${control.id}`}>Implementation Date</label>
                    <input
                      id={`impl-date-${control.id}`}
                      type="date"
                      className="form-control"
                      value={ensureString(control.implementationDate)}
                      onChange={(e) => handleChange('implementationDate', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor={`review-date-${control.id}`}>Last Review Date</label>
                    <input
                      id={`review-date-${control.id}`}
                      type="date"
                      className="form-control"
                      value={ensureString(control.reviewDate)}
                      onChange={(e) => handleChange('reviewDate', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor={`next-review-${control.id}`}>Next Review Date</label>
                    <input
                      id={`next-review-${control.id}`}
                      type="date"
                      className="form-control"
                      value={ensureString(control.nextReviewDate)}
                      onChange={(e) => handleChange('nextReviewDate', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'responsibility' && (
              <div className="control-form">
                <div className="form-group">
                  <label htmlFor={`responsible-party-${control.id}`}>Responsible Party</label>
                  <select
                    id={`responsible-party-${control.id}`}
                    className="form-control"
                    value={control.responsibleParty || ''}
                    onChange={(e) => handleChange('responsibleParty', e.target.value)}
                  >
                    <option value="">Select...</option>
                    <option value="Not Applicable">Not Applicable</option>
                    <option value="Inherited from Service Provider">Inherited from Service Provider</option>
                    <option value={`Implemented by ${organizationName}`}>Implemented by {organizationName}</option>
                    <option value="Shared">Shared</option>
                    <option value="Consumer Responsibility">Consumer Responsibility</option>
                  </select>
                </div>

                {control.responsibleParty === 'Consumer Responsibility' && (
                  <div className="form-group">
                    <label htmlFor={`consumer-guidance-${control.id}`}>Consumer Guidance</label>
                    <textarea
                      id={`consumer-guidance-${control.id}`}
                      className="form-control"
                      rows="3"
                      placeholder="Provide guidance for consumer responsibility..."
                      value={control.consumerGuidance || ''}
                      onChange={(e) => handleChange('consumerGuidance', e.target.value)}
                    />
                  </div>
                )}

                <div className="form-group">
                  <label htmlFor={`control-owner-${control.id}`}>Control Inheritance/Implementation by Consumer</label>
                  <select
                    id={`control-owner-${control.id}`}
                    className="form-control"
                    value={control.controlOwner || ''}
                    onChange={(e) => handleChange('controlOwner', e.target.value)}
                  >
                    <option value="">Select...</option>
                    <option value="Control Inherited from Service Provider">Control Inherited from Service Provider</option>
                    <option value="Control Configurator Based on Options Given">Control Configurator Based on Options Given</option>
                    <option value="Control Implementer">Control Implementer</option>
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor={`frameworks-${control.id}`}>Related Frameworks/Standards</label>
                  <input
                    id={`frameworks-${control.id}`}
                    type="text"
                    className="form-control"
                    placeholder="e.g., ISO 27001:A.5.1, A.5.2; SOC 2:CC6.1; NIST CSF:PR.AC-1"
                    value={control.frameworks || ''}
                    onChange={(e) => handleChange('frameworks', e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor={`remarks-${control.id}`}>Additional Notes or Consumer Guidance</label>
                  <textarea
                    id={`remarks-${control.id}`}
                    className="form-control"
                    rows="2"
                    placeholder="Any additional notes or comments..."
                    value={control.remarks || ''}
                    onChange={(e) => handleChange('remarks', e.target.value)}
                  />
                </div>
              </div>
            )}

            {activeTab === 'testing' && (
              <div className="control-form">
                <div className="form-group">
                  <label htmlFor={`control-type-${control.id}`}>Control Type</label>
                  <select
                    id={`control-type-${control.id}`}
                    className="form-control"
                    value={control.controlType || ''}
                    onChange={(e) => handleChange('controlType', e.target.value)}
                  >
                    <option value="">Select...</option>
                    <option value="Policy">Policy</option>
                    <option value="Process (Isolated Implementation by Human)">Process (Isolated Implementation by Human)</option>
                    <option value="Orchestrated in Clusters or Pools by Tools">Orchestrated in Clusters or Pools by Tools</option>
                    <option value="Automated by Tools">Automated by Tools</option>
                  </select>
                </div>

                {control.controlType === 'Automated by Tools' ? (
                  <>
                    <div className="form-group">
                      <label htmlFor={`api-url-${control.id}`}>API URL for Real-time Data</label>
                      <div className="api-url-input-group">
                        <input
                          id={`api-url-${control.id}`}
                          type="url"
                          className="form-control api-url-input"
                          placeholder="https://api.example.com/control-status"
                          value={control.apiUrl || ''}
                          onChange={(e) => handleChange('apiUrl', e.target.value)}
                        />
                        <button
                          type="button"
                          className="fetch-data-btn"
                          onClick={() => handleFetchApiData(control.id, control.apiUrl)}
                          disabled={!control.apiUrl || fetchingData[control.id]}
                          title="Fetch data from API"
                        >
                          {fetchingData[control.id] ? '⏳' : '🔄'} Fetch Data
                        </button>
                      </div>
                    </div>
                    
                    <div className="info-box" style={{marginTop: '12px', marginBottom: '12px'}}>
                      <strong>ℹ️ Authentication:</strong> All API calls are routed through your configured API Gateway (AWS or Azure). 
                      No credentials are stored in this application. Configure your gateway in <strong>Settings</strong>.
                    </div>
                    
                    {/* API Data History - Show last 12 entries */}
                    {control.apiDataHistory && control.apiDataHistory.length > 0 && (
                      <div className="form-group">
                        <label>API Data History (Last 12 Entries)</label>
                        <div className="api-history-container">
                          {control.apiDataHistory.slice(0, 12).map((entry, index) => (
                            <div key={index} className="api-history-entry">
                              <div className="api-history-header">
                                <span className="api-history-date">
                                  📅 {new Date(entry.timestamp).toLocaleString()}
                                </span>
                                <span className="api-history-status">
                                  {entry.success ? '✅ Success' : '❌ Failed'}
                                </span>
                              </div>
                              <div className="api-history-data">
                                <pre>{JSON.stringify(entry.data, null, 2)}</pre>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="form-group">
                      <label htmlFor={`evidence-${control.id}`}>Evidence Location</label>
                      <textarea
                        id={`evidence-${control.id}`}
                        className="form-control"
                        rows="2"
                        placeholder="Location of evidence or artifacts (e.g., documentation links, file paths)"
                        value={control.evidence || ''}
                        onChange={(e) => handleChange('evidence', e.target.value)}
                      />
                    </div>

                    <div className="form-group">
                      <label htmlFor={`testing-procedure-${control.id}`}>
                        Testing Method
                        {!canEditTestingMethod() && <span style={{ marginLeft: '0.5rem', color: '#d97706', fontSize: '0.85em' }}>🔒 Assessor Role Required</span>}
                      </label>
                      <textarea
                        id={`testing-procedure-${control.id}`}
                        className="form-control"
                        rows="3"
                        placeholder="Describe how this control is tested or validated..."
                        value={control.testingProcedure || ''}
                        onChange={(e) => handleChange('testingProcedure', e.target.value)}
                        disabled={!canEditTestingMethod()}
                      />
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label htmlFor={`testing-frequency-${control.id}`}>Testing Frequency</label>
                        <select
                          id={`testing-frequency-${control.id}`}
                          className="form-control"
                          value={control.testingFrequency || ''}
                          onChange={(e) => handleChange('testingFrequency', e.target.value)}
                        >
                          <option value="">Select frequency...</option>
                          {TEST_FREQUENCIES.map(freq => (
                            <option key={freq} value={freq}>{freq}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label htmlFor={`last-test-date-${control.id}`}>Last Test Date</label>
                        <input
                          id={`last-test-date-${control.id}`}
                          type="date"
                          className="form-control"
                          value={ensureString(control.lastTestDate)}
                          onChange={(e) => handleChange('lastTestDate', e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Risk & Compliance tab content - Only show for Not Implemented or Ineffective status */}
            {activeTab === 'risk' && (control.status === 'not-implemented' || control.status === 'ineffective') && (
              <div className="control-form">
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor={`risk-rating-${control.id}`}>Inherent Risk Level</label>
                    <select
                      id={`risk-rating-${control.id}`}
                      className="form-control"
                      value={control.riskRating || ''}
                      onChange={(e) => handleChange('riskRating', e.target.value)}
                    >
                      <option value="">Select risk level...</option>
                      {RISK_LEVELS.map(level => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor={`residual-risk-${control.id}`}>Residual Risk</label>
                    <select
                      id={`residual-risk-${control.id}`}
                      className="form-control"
                      value={control.residualRisk || ''}
                      onChange={(e) => handleChange('residualRisk', e.target.value)}
                    >
                      <option value="">Select risk level...</option>
                      {RISK_LEVELS.map(level => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor={`compensating-controls-${control.id}`}>Compensating Controls</label>
                  <textarea
                    id={`compensating-controls-${control.id}`}
                    className="form-control"
                    rows="2"
                    placeholder="Alternative controls that provide equivalent protection..."
                    value={control.compensatingControls || ''}
                    onChange={(e) => handleChange('compensatingControls', e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor={`exceptions-${control.id}`}>Exceptions/Deviations</label>
                  <textarea
                    id={`exceptions-${control.id}`}
                    className="form-control"
                    rows="2"
                    placeholder="Any exceptions or deviations from the control requirement..."
                    value={control.exceptions || ''}
                    onChange={(e) => handleChange('exceptions', e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor={`justification-${control.id}`}>Justification</label>
                  <textarea
                    id={`justification-${control.id}`}
                    className="form-control"
                    rows="2"
                    placeholder="Justification for exceptions or control selection..."
                    value={control.justification || ''}
                    onChange={(e) => handleChange('justification', e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ControlItemCCM;

