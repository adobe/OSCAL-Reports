/**
 * ControlItem Component - Individual security control item with implementation details
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license MIT
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ControlSuggestions from './ControlSuggestions';
import './ControlItem.css';

const STATUS_OPTIONS = [
  { value: 'not-assessed', label: 'Not Assessed', color: 'not-assessed' },
  { value: 'effective', label: 'Effective', color: 'effective' },
  { value: 'alternate-control', label: 'Alternate Control', color: 'alternate-control' },
  { value: 'ineffective', label: 'Ineffective', color: 'ineffective' },
  { value: 'no-visibility', label: 'No Visibility', color: 'no-visibility' },
  { value: 'not-implemented', label: 'Not Implemented', color: 'not-implemented' },
  { value: 'not-applicable', label: 'Not Applicable', color: 'not-applicable' }
];

function ControlItem({ control, isExpanded, onToggle, onUpdate, allControls = [] }) {
  const { canEditImplementationStatus } = useAuth();
  const [fetchingData, setFetchingData] = useState({});
  const [credentials, setCredentials] = useState([]);

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

  const handleStatusChange = (e) => {
    const newStatus = e.target.value;
    onUpdate(control.id, 'status', newStatus);
    
    // Auto-populate related fields when "Not Applicable" is selected
    if (newStatus === 'not-applicable') {
      // Set Responsible Party to "Not Applicable" if not already set
      if (!control.responsibleParty || control.responsibleParty === '') {
        onUpdate(control.id, 'responsibleParty', 'Not Applicable');
      }
      // Set Cloud Provider Responsibility to "Control Implementer" if not already set
      if (!control.controlOwner || control.controlOwner === '') {
        onUpdate(control.id, 'controlOwner', 'Control Implementer');
      }
    }
  };

  const handleImplementationChange = (e) => {
    onUpdate(control.id, 'implementation', e.target.value);
  };

  const handleRemarksChange = (e) => {
    onUpdate(control.id, 'remarks', e.target.value);
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

  const currentStatus = STATUS_OPTIONS.find(s => s.value === control.status) || STATUS_OPTIONS[3];

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

          <div className="control-form">
            <div className="form-row-2">
              <div className="form-group">
                <label htmlFor={`status-${control.id}`}>
                  Implementation Status *
                  {!canEditImplementationStatus() && <span style={{ marginLeft: '0.5rem', color: '#d97706', fontSize: '0.85em' }}>🔒 Assessor Role Required</span>}
                </label>
                <select
                  id={`status-${control.id}`}
                  className={`form-control status-select status-${control.status || 'not-assessed'}`}
                  value={control.status}
                  onChange={handleStatusChange}
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
                <label htmlFor={`applicability-${control.id}`}>Applicability</label>
                <select
                  id={`applicability-${control.id}`}
                  className="form-control"
                  value={control.applicability || 'applicable'}
                  onChange={(e) => onUpdate(control.id, 'applicability', e.target.value)}
                >
                  <option value="applicable">Applicable</option>
                  <option value="not-applicable">Not Applicable</option>
                  <option value="conditional">Conditionally Applicable</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor={`implementation-${control.id}`}>
                Implementation Description *
              </label>
              <textarea
                id={`implementation-${control.id}`}
                className="form-control"
                rows="4"
                placeholder="Describe how this control is implemented in your system..."
                value={control.implementation}
                onChange={handleImplementationChange}
              />
            </div>

            <div className="form-row-3">
              <div className="form-group">
                <label htmlFor={`responsibleParty-${control.id}`}>Responsible Party</label>
              <select
                id={`responsibleParty-${control.id}`}
                className="form-control"
                value={control.responsibleParty || ''}
                onChange={(e) => onUpdate(control.id, 'responsibleParty', e.target.value)}
              >
                <option value="">Select...</option>
                <option value="Implemented By Adobe">Implemented By Adobe</option>
                <option value="Inherited from CSP">Inherited from CSP</option>
                <option value="Shared">Shared</option>
                <option value="Consumer Responsibility">Consumer Responsibility</option>
                <option value="Consumer Implementation Required">Consumer Implementation Required</option>
                <option value="Consumer Configuration Required">Consumer Configuration Required</option>
                <option value="Not Applicable">Not Applicable</option>
              </select>
              </div>

              <div className="form-group">
                <label htmlFor={`controlOwner-${control.id}`}>Cloud Provider Responsibility</label>
                <select
                  id={`controlOwner-${control.id}`}
                  className="form-control"
                  value={control.controlOwner || ''}
                  onChange={(e) => onUpdate(control.id, 'controlOwner', e.target.value)}
                >
                  <option value="">Select...</option>
                  <option value="Inherited from CSP">Inherited from CSP</option>
                  <option value="Control Implementer">Control Implementer</option>
                  <option value="Control Option Provider">Control Option Provider</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor={`implementationDate-${control.id}`}>Implementation Date</label>
                <input
                  type="date"
                  id={`implementationDate-${control.id}`}
                  className="form-control"
                  value={control.implementationDate || ''}
                  onChange={(e) => onUpdate(control.id, 'implementationDate', e.target.value)}
                />
              </div>
            </div>

            {(control.responsibleParty === 'Consumer Implementation Required' || 
              control.responsibleParty === 'Consumer Configuration Required') && (
              <div className="form-group">
                <label htmlFor={`consumerGuidance-${control.id}`}>Consumer Guidance</label>
                <textarea
                  id={`consumerGuidance-${control.id}`}
                  className="form-control"
                  rows="3"
                  placeholder="Provide guidance for consumer implementation or configuration..."
                  value={control.consumerGuidance || ''}
                  onChange={(e) => onUpdate(control.id, 'consumerGuidance', e.target.value)}
                />
              </div>
            )}

            <div className="form-row-3">
              <div className="form-group">
                <label htmlFor={`reviewDate-${control.id}`}>Last Review Date</label>
                <input
                  type="date"
                  id={`reviewDate-${control.id}`}
                  className="form-control"
                  value={control.reviewDate || ''}
                  onChange={(e) => onUpdate(control.id, 'reviewDate', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor={`nextReviewDate-${control.id}`}>Next Review Date</label>
                <input
                  type="date"
                  id={`nextReviewDate-${control.id}`}
                  className="form-control"
                  value={control.nextReviewDate || ''}
                  onChange={(e) => onUpdate(control.id, 'nextReviewDate', e.target.value)}
                />
              </div>

              <div className="form-group">
                <label htmlFor={`lastTestDate-${control.id}`}>Last Test Date</label>
                <input
                  type="date"
                  id={`lastTestDate-${control.id}`}
                  className="form-control"
                  value={control.lastTestDate || ''}
                  onChange={(e) => onUpdate(control.id, 'lastTestDate', e.target.value)}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor={`controlType-${control.id}`}>Control Type</label>
              <select
                id={`controlType-${control.id}`}
                className="form-control"
                value={control.controlType || ''}
                onChange={(e) => onUpdate(control.id, 'controlType', e.target.value)}
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
                  <label htmlFor={`apiUrl-${control.id}`}>API URL for Real-time Data</label>
                  <div className="api-url-input-group">
                    <input
                      type="url"
                      id={`apiUrl-${control.id}`}
                      className="form-control api-url-input"
                      placeholder="https://api.example.com/control-status"
                      value={control.apiUrl || ''}
                      onChange={(e) => onUpdate(control.id, 'apiUrl', e.target.value)}
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
                  <label htmlFor={`evidence-${control.id}`}>Evidence/Artifacts Location</label>
                  <input
                    type="text"
                    id={`evidence-${control.id}`}
                    className="form-control"
                    placeholder="e.g., SharePoint/Policies/AccessControl.pdf"
                    value={control.evidence || ''}
                    onChange={(e) => onUpdate(control.id, 'evidence', e.target.value)}
                  />
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label htmlFor={`testingProcedure-${control.id}`}>Testing/Assessment Procedure</label>
                    <textarea
                      id={`testingProcedure-${control.id}`}
                      className="form-control"
                      rows="2"
                      placeholder="How is this control tested?"
                      value={control.testingProcedure || ''}
                      onChange={(e) => onUpdate(control.id, 'testingProcedure', e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor={`testingFrequency-${control.id}`}>Testing Frequency</label>
                    <select
                      id={`testingFrequency-${control.id}`}
                      className="form-control"
                      value={control.testingFrequency || 'annual'}
                      onChange={(e) => onUpdate(control.id, 'testingFrequency', e.target.value)}
                    >
                      <option value="">Not Set</option>
                      <option value="continuous">Continuous</option>
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                      <option value="semi-annual">Semi-Annual</option>
                      <option value="annual">Annual</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            {/* Risk & Compliance Section - Only show for Not Implemented or Ineffective status */}
            {(control.status === 'not-implemented' || control.status === 'ineffective') && (
              <>
                <div className="form-row-2">
                  <div className="form-group">
                    <label htmlFor={`riskRating-${control.id}`}>Inherent Risk Level</label>
                    <select
                      id={`riskRating-${control.id}`}
                      className="form-control"
                      value={control.riskRating || ''}
                      onChange={(e) => onUpdate(control.id, 'riskRating', e.target.value)}
                    >
                      <option value="">Not Set</option>
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label htmlFor={`residualRisk-${control.id}`}>Residual Risk Level</label>
                    <select
                      id={`residualRisk-${control.id}`}
                      className="form-control"
                      value={control.residualRisk || ''}
                      onChange={(e) => onUpdate(control.id, 'residualRisk', e.target.value)}
                    >
                      <option value="">Not Set</option>
                      <option value="critical">Critical</option>
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor={`compensatingControls-${control.id}`}>Compensating Controls</label>
                  <textarea
                    id={`compensatingControls-${control.id}`}
                    className="form-control"
                    rows="2"
                    placeholder="Alternative controls providing equivalent protection..."
                    value={control.compensatingControls || ''}
                    onChange={(e) => onUpdate(control.id, 'compensatingControls', e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor={`exceptions-${control.id}`}>Exceptions/Deviations</label>
                  <textarea
                    id={`exceptions-${control.id}`}
                    className="form-control"
                    rows="2"
                    placeholder="Approved exceptions from the control requirement..."
                    value={control.exceptions || ''}
                    onChange={(e) => onUpdate(control.id, 'exceptions', e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="form-group">
              <label htmlFor={`frameworks-${control.id}`}>Mapped Frameworks</label>
              <input
                type="text"
                id={`frameworks-${control.id}`}
                className="form-control"
                placeholder="e.g., NIST, ISO 27001, PCI-DSS"
                value={control.frameworks || ''}
                onChange={(e) => onUpdate(control.id, 'frameworks', e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor={`remarks-${control.id}`}>Notes/Remarks</label>
              <textarea
                id={`remarks-${control.id}`}
                className="form-control"
                rows="2"
                placeholder="Additional notes or comments..."
                value={control.remarks}
                onChange={handleRemarksChange}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ControlItem;

