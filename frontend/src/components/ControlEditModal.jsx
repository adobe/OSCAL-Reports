/**
 * ControlEditModal Component - Modal popup for editing control details
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license GPL-3.0-or-later
 */

import React, { useState, useEffect } from 'react';
import ControlSuggestions from './ControlSuggestions';
import './ControlEditModal.css';

function ControlEditModal({ control, onClose, onSave, allControls = [], organizationName = 'Organization' }) {
  const [editedControl, setEditedControl] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState('implementation');
  const [showAISuggestions, setShowAISuggestions] = useState(false);

  useEffect(() => {
    if (control) {
      setEditedControl({ ...control });
      setHasChanges(false);
    }
  }, [control]);

  if (!control || !editedControl) {
    return null;
  }

  const handleChange = (field, value) => {
    setEditedControl(prev => {
      const updated = {
      ...prev,
      [field]: value
      };
      
      // Auto-populate related fields when status changes to "Not Applicable"
      if (field === 'status' && value === 'not-applicable') {
        // Set Responsible Party to "Not Applicable" if not already set
        if (!prev.responsibleParty || prev.responsibleParty === '') {
          updated.responsibleParty = 'Not Applicable';
        }
        // Set Control Inheritance/Implementation by Consumer to "Control Implementer" if not already set
        if (!prev.controlOwner || prev.controlOwner === '') {
          updated.controlOwner = 'Control Implementer';
        }
      }
      
      return updated;
    });
    setHasChanges(true);
  };

  const handleApplySuggestion = (controlId, field, value) => {
    handleChange(field, value);
  };

  const handleSave = () => {
    onSave(editedControl);
    setHasChanges(false);
  };

  const handleClose = () => {
    if (hasChanges) {
      if (window.confirm('You have unsaved changes. Are you sure you want to close?')) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  return (
    <div className="control-edit-modal-overlay" onClick={handleClose}>
      <div className="control-edit-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📝 Edit Control: {editedControl.id}</h2>
          <button className="modal-close-btn" onClick={handleClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="control-info-header">
            <h3>{editedControl.title || editedControl.catalogTitle}</h3>
          </div>

          {/* Control Details - Statement */}
          {(editedControl.catalogDescription || editedControl.description) && (
            <div className="control-statement-box">
              <h4>📋 Control Details</h4>
              <div className="statement-content">
                <strong>Statement:</strong>
                <p>{editedControl.catalogDescription || editedControl.description}</p>
              </div>
            </div>
          )}

          {/* AI Suggestions - Single toggle section */}
          <div className="ai-suggestions-section-top">
            <button
              type="button"
              className="btn-ai-blue"
              onClick={() => setShowAISuggestions(!showAISuggestions)}
            >
              🤖 {showAISuggestions ? 'Hide' : 'Get'} Suggestions
            </button>
            {showAISuggestions && (
              <div className="ai-panel">
                <ControlSuggestions
                  control={editedControl}
                  existingControls={allControls.filter(c => c.id !== editedControl.id && c.implementation)}
                  onApplySuggestion={handleApplySuggestion}
                  hideButton={true}
                  autoFetch={true}
                />
              </div>
            )}
          </div>

          {/* Tab Navigation */}
          <div className="tab-navigation">
            <button
              className={`tab-btn ${activeTab === 'implementation' ? 'active' : ''}`}
              onClick={() => setActiveTab('implementation')}
            >
              Implementation
            </button>
            <button
              className={`tab-btn ${activeTab === 'responsibility' ? 'active' : ''}`}
              onClick={() => setActiveTab('responsibility')}
            >
              Responsibility & Ownership
            </button>
            <button
              className={`tab-btn ${activeTab === 'testing' ? 'active' : ''}`}
              onClick={() => setActiveTab('testing')}
            >
              Testing & Evidence
            </button>
            {(editedControl.status === 'ineffective' || editedControl.status === 'not-implemented') && (
              <button
                className={`tab-btn ${activeTab === 'risk' ? 'active' : ''}`}
                onClick={() => setActiveTab('risk')}
              >
                Risk & Compliance
              </button>
            )}
          </div>

          {/* Tab Content */}
          <div className="tab-content">
            {activeTab === 'implementation' && (
              <div className="tab-pane">
                <div className="form-group">
                  <label>Implementation Status *</label>
                  <select
                    value={editedControl.status || 'not-assessed'}
                    onChange={(e) => handleChange('status', e.target.value)}
                    className={`form-control status-select status-${editedControl.status || 'not-assessed'}`}
                  >
                    <option value="not-assessed">🔴 Not Assessed</option>
                    <option value="effective">🟢 Effective</option>
                    <option value="alternate-control">🔵 Alternate Control</option>
                    <option value="ineffective">🟠 Ineffective</option>
                    <option value="no-visibility">⚪ No Visibility</option>
                    <option value="not-implemented">🟣 Not Implemented</option>
                    <option value="not-applicable">⚫ Not Applicable</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Implementation Details *</label>
                  <textarea
                    value={editedControl.implementation || editedControl.implementationDescription || ''}
                    onChange={(e) => handleChange('implementation', e.target.value)}
                    className="form-control"
                    rows="4"
                    placeholder="Describe how this control is implemented in your system..."
                  />
                </div>

                <div className="form-row-3">
                  <div className="form-group">
                    <label>Implementation Date</label>
                    <input
                      type="date"
                      value={editedControl.implementationDate || ''}
                      onChange={(e) => handleChange('implementationDate', e.target.value)}
                      className="form-control"
                    />
                  </div>
                  <div className="form-group">
                    <label>Last Review Date</label>
                    <input
                      type="date"
                      value={editedControl.reviewDate || ''}
                      onChange={(e) => handleChange('reviewDate', e.target.value)}
                      className="form-control"
                    />
                  </div>
                  <div className="form-group">
                    <label>Next Review Date</label>
                    <input
                      type="date"
                      value={editedControl.nextReviewDate || ''}
                      onChange={(e) => handleChange('nextReviewDate', e.target.value)}
                      className="form-control"
                    />
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'responsibility' && (
              <div className="tab-pane">
                <div className="form-group">
                  <label>Responsible Party</label>
                  <select
                    value={editedControl.responsibleParty || ''}
                    onChange={(e) => handleChange('responsibleParty', e.target.value)}
                    className="form-control"
                  >
                    <option value="">Select...</option>
                    <option value="Not Applicable">Not Applicable</option>
                    <option value="Inherited from Service Provider">Inherited from Service Provider</option>
                    <option value={`Implemented by ${organizationName}`}>Implemented by {organizationName}</option>
                    <option value="Shared">Shared</option>
                    <option value="Consumer Responsibility">Consumer Responsibility</option>
                  </select>
                </div>

                {editedControl.responsibleParty === 'Consumer Responsibility' && (
                  <div className="form-group">
                    <label>Consumer Guidance</label>
                    <textarea
                      value={editedControl.consumerGuidance || ''}
                      onChange={(e) => handleChange('consumerGuidance', e.target.value)}
                      className="form-control"
                      rows="3"
                      placeholder="Provide guidance for consumer responsibility..."
                    />
                  </div>
                )}

                <div className="form-group">
                  <label>Control Inheritance/Implementation by Consumer</label>
                  <select
                    value={editedControl.controlOwner || editedControl.cloudProviderResponsibility || ''}
                    onChange={(e) => handleChange('controlOwner', e.target.value)}
                    className="form-control"
                  >
                    <option value="">Select...</option>
                    <option value="Control Inherited from Service Provider">Control Inherited from Service Provider</option>
                    <option value="Control Configurator Based on Options Given">Control Configurator Based on Options Given</option>
                    <option value="Control Implementer">Control Implementer</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Related Frameworks/Standards</label>
                  <input
                    type="text"
                    value={editedControl.frameworks || ''}
                    onChange={(e) => handleChange('frameworks', e.target.value)}
                    className="form-control"
                    placeholder="e.g., ISO 27001:A.5.1, A.5.2; SOC 2:CC6.1; NIST CSF:PR.AC-1"
                  />
                </div>

                <div className="form-group">
                  <label>Additional Notes or Consumer Guidance</label>
                  <textarea
                    value={editedControl.remarks || ''}
                    onChange={(e) => handleChange('remarks', e.target.value)}
                    className="form-control"
                    rows="2"
                    placeholder="Any additional notes or comments..."
                  />
                </div>
              </div>
            )}

            {activeTab === 'testing' && (
              <div className="tab-pane">
                <div className="form-group">
                  <label>Control Type</label>
                  <select
                    value={editedControl.controlType || ''}
                    onChange={(e) => handleChange('controlType', e.target.value)}
                    className="form-control"
                  >
                    <option value="">Select...</option>
                    <option value="Policy">Policy</option>
                    <option value="Process (Isolated Implementation by Human)">Process (Isolated Implementation by Human)</option>
                    <option value="Orchestrated in Clusters or Pools by Tools">Orchestrated in Clusters or Pools by Tools</option>
                    <option value="Automated by Tools">Automated by Tools</option>
                  </select>
                </div>

                {editedControl.controlType === 'Automated by Tools' ? (
                  <>
                    <div className="form-group">
                      <label>API URL for Real-time Data</label>
                      <input
                        type="url"
                        value={editedControl.apiUrl || ''}
                        onChange={(e) => handleChange('apiUrl', e.target.value)}
                        className="form-control"
                        placeholder="https://api.example.com/control-status"
                      />
                    </div>
                    
                    <div className="info-box" style={{marginTop: '12px', marginBottom: '12px'}}>
                      <strong>ℹ️ Authentication:</strong> All API calls are routed through your configured API Gateway (AWS or Azure). 
                      No credentials are stored in this application. Configure your gateway in <strong>Settings</strong>.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="form-group">
                      <label>Evidence Location</label>
                      <textarea
                        value={editedControl.evidence || ''}
                        onChange={(e) => handleChange('evidence', e.target.value)}
                        className="form-control"
                        rows="2"
                        placeholder="Location of evidence or artifacts (e.g., documentation links, file paths)"
                      />
                    </div>

                    <div className="form-group">
                      <label>Testing Method</label>
                      <textarea
                        value={editedControl.testingProcedure || ''}
                        onChange={(e) => handleChange('testingProcedure', e.target.value)}
                        className="form-control"
                        rows="3"
                        placeholder="Describe how this control is tested or validated..."
                      />
                    </div>

                    <div className="form-row-2">
                      <div className="form-group">
                        <label>Testing Frequency</label>
                        <select
                          value={editedControl.testingFrequency || ''}
                          onChange={(e) => handleChange('testingFrequency', e.target.value)}
                          className="form-control"
                        >
                          <option value="">Select frequency...</option>
                          <option value="Continuous">Continuous</option>
                          <option value="Daily">Daily</option>
                          <option value="Weekly">Weekly</option>
                          <option value="Monthly">Monthly</option>
                          <option value="Quarterly">Quarterly</option>
                          <option value="Semi-Annual">Semi-Annual</option>
                          <option value="Annual">Annual</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label>Last Test Date</label>
                        <input
                          type="date"
                          value={editedControl.lastTestDate || ''}
                          onChange={(e) => handleChange('lastTestDate', e.target.value)}
                          className="form-control"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {activeTab === 'risk' && (
              <div className="tab-pane">
                <div className="form-row-2">
                  <div className="form-group">
                    <label>Inherent Risk Level</label>
                    <select
                      value={editedControl.riskRating || ''}
                      onChange={(e) => handleChange('riskRating', e.target.value)}
                      className="form-control"
                    >
                      <option value="">Select risk level...</option>
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Critical">Critical</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Residual Risk</label>
                    <select
                      value={editedControl.residualRisk || ''}
                      onChange={(e) => handleChange('residualRisk', e.target.value)}
                      className="form-control"
                    >
                      <option value="">Select risk level...</option>
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Critical">Critical</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Compensating Controls</label>
                  <textarea
                    value={editedControl.compensatingControls || ''}
                    onChange={(e) => handleChange('compensatingControls', e.target.value)}
                    className="form-control"
                    rows="3"
                    placeholder="Alternative controls that provide equivalent protection..."
                  />
                </div>

                <div className="form-group">
                  <label>Exceptions/Deviations</label>
                  <textarea
                    value={editedControl.exceptions || ''}
                    onChange={(e) => handleChange('exceptions', e.target.value)}
                    className="form-control"
                    rows="3"
                    placeholder="Any exceptions or deviations from the control requirement..."
                  />
                </div>

                <div className="form-group">
                  <label>Justification</label>
                  <textarea
                    value={editedControl.justification || ''}
                    onChange={(e) => handleChange('justification', e.target.value)}
                    className="form-control"
                    rows="3"
                    placeholder="Justification for exceptions or control selection..."
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={handleClose}>
            Cancel
          </button>
          <button 
            className="btn btn-primary" 
            onClick={handleSave}
            disabled={!hasChanges}
          >
            {hasChanges ? '💾 Save Changes' : '✓ Saved'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ControlEditModal;

