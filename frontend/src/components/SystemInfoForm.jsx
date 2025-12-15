/**
 * SystemInfoForm Component - Capture system information and security classification
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license MIT
 */

import React, { useState, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './SystemInfoForm.css';

// Framework-specific classification levels
const CLASSIFICATION_LEVELS = {
  'ACSC': [
    { value: 'Non-Classified', label: 'Non-Classified' },
    { value: 'Official Sensitive', label: 'Official Sensitive' },
    { value: 'Protected', label: 'Protected' },
    { value: 'Secret', label: 'Secret' },
    { value: 'Top Secret', label: 'Top Secret' }
  ],
  'NIST': [
    { value: 'low', label: 'Low' },
    { value: 'moderate', label: 'Moderate' },
    { value: 'high', label: 'High' }
  ],
  'Singapore': [
    { value: 'low', label: 'Low' },
    { value: 'moderate', label: 'Moderate' },
    { value: 'high', label: 'High' }
  ],
  'default': [
    { value: 'low', label: 'Low' },
    { value: 'moderate', label: 'Moderate' },
    { value: 'high', label: 'High' }
  ]
};

function SystemInfoForm({ onSubmit, onBack, catalogueUrl, initialClassification, initialValues }) {
  const { canEditAssessorDetails, canEditSystemInfo } = useAuth();
  
  // Detect framework type from catalogue URL
  const frameworkType = useMemo(() => {
    if (!catalogueUrl) return 'default';
    const url = catalogueUrl.toLowerCase();
    if (url.includes('acsc') || url.includes('ism-oscal') || url.includes('australiancybersecuritycentre')) {
      return 'ACSC';
    } else if (url.includes('nist')) {
      return 'NIST';
    } else if (url.includes('govtechsg') || url.includes('singapore') || url.includes('im8')) {
      return 'Singapore';
    }
    return 'default';
  }, [catalogueUrl]);

  const classificationLevels = CLASSIFICATION_LEVELS[frameworkType] || CLASSIFICATION_LEVELS['default'];
  // Use initialClassification if provided, otherwise use first option
  const defaultLevel = initialClassification || classificationLevels[0].value;

  const [formData, setFormData] = useState({
    systemName: initialValues?.systemName || '',
    systemId: initialValues?.systemId || '',
    description: initialValues?.description || '',
    authorizationBoundary: initialValues?.authorizationBoundary || '',
    organization: initialValues?.organization || '',
    assessorDetails: initialValues?.assessorDetails || '',
    systemOwner: initialValues?.systemOwner || '',
    cspIaaS: initialValues?.cspIaaS || '',
    cspPaaS: initialValues?.cspPaaS || '',
    cspSaaS: initialValues?.cspSaaS || '',
    securityLevel: initialValues?.securityLevel || defaultLevel,
    confidentiality: initialValues?.confidentiality || 'moderate',
    integrity: initialValues?.integrity || 'moderate',
    availability: initialValues?.availability || 'moderate',
    status: initialValues?.status || 'under-development',
    systemType: initialValues?.systemType || '',
    authorizationDate: initialValues?.authorizationDate || ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="system-info-container">
      <div className="card">
        <h2>System Information</h2>
        <p className="card-description">
          Provide details about the system you're documenting
        </p>

        <form onSubmit={handleSubmit} className="system-form">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="systemName">System Name *</label>
              <input
                id="systemName"
                name="systemName"
                type="text"
                className="form-control"
                placeholder="e.g., Customer Portal"
                value={formData.systemName}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="systemId">System ID</label>
              <input
                id="systemId"
                name="systemId"
                type="text"
                className="form-control"
                placeholder="e.g., SYS-001"
                value={formData.systemId}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="description">System Description *</label>
            <textarea
              id="description"
              name="description"
              className="form-control"
              rows="4"
              placeholder="Describe the purpose and functionality of this system..."
              value={formData.description}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="authorizationBoundary">Authorization Boundary *</label>
            <textarea
              id="authorizationBoundary"
              name="authorizationBoundary"
              className="form-control"
              rows="4"
              placeholder="Describe what is included/excluded in the system authorization boundary (network, physical, logical boundaries)..."
              value={formData.authorizationBoundary}
              onChange={handleChange}
              required
            />
            <small className="form-hint">
              Define the scope of authorization including components, infrastructure, and service dependencies within/outside the boundary.
            </small>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="organization">Organisation</label>
              <input
                id="organization"
                name="organization"
                type="text"
                className="form-control"
                placeholder="e.g., Adobe Inc."
                value={formData.organization}
                onChange={handleChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="systemOwner">System Owner</label>
              <input
                id="systemOwner"
                name="systemOwner"
                type="text"
                className="form-control"
                placeholder="e.g., John Doe"
                value={formData.systemOwner}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="assessorDetails">
              Assessor Details
              {!canEditAssessorDetails() && <span style={{ marginLeft: '0.5rem', color: '#d97706', fontSize: '0.85em' }}>🔒 Assessor Role Required</span>}
            </label>
            <textarea
              id="assessorDetails"
              name="assessorDetails"
              className="form-control"
              rows="3"
              placeholder="Enter assessor name, organization, and contact details..."
              value={formData.assessorDetails}
              onChange={handleChange}
              disabled={!canEditAssessorDetails()}
            />
          </div>

          <div className="security-objectives">
            <h3>CSP Providers</h3>
            <p className="section-description">
              Specify the Cloud Service Providers for each service model
            </p>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="cspIaaS">IaaS Provider</label>
                <input
                  id="cspIaaS"
                  name="cspIaaS"
                  type="text"
                  className="form-control"
                  placeholder="e.g., AWS, Azure, GCP"
                  value={formData.cspIaaS}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label htmlFor="cspPaaS">PaaS Provider</label>
                <input
                  id="cspPaaS"
                  name="cspPaaS"
                  type="text"
                  className="form-control"
                  placeholder="e.g., Heroku, Cloud Foundry"
                  value={formData.cspPaaS}
                  onChange={handleChange}
                />
              </div>

              <div className="form-group">
                <label htmlFor="cspSaaS">SaaS Provider</label>
                <input
                  id="cspSaaS"
                  name="cspSaaS"
                  type="text"
                  className="form-control"
                  placeholder="e.g., Salesforce, Microsoft 365"
                  value={formData.cspSaaS}
                  onChange={handleChange}
                />
              </div>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="securityLevel">Data/System Sensitivity/Classification Level</label>
              <select
                id="securityLevel"
                name="securityLevel"
                className="form-control"
                value={formData.securityLevel}
                onChange={handleChange}
              >
                {classificationLevels.map(level => (
                  <option key={level.value} value={level.value}>
                    {level.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="status">System Status</label>
              <select
                id="status"
                name="status"
                className="form-control"
                value={formData.status}
                onChange={handleChange}
              >
                <option value="under-development">Under Development</option>
                <option value="operational">Operational</option>
                <option value="under-major-modification">Under Major Modification</option>
                <option value="disposition">Disposition</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div className="security-objectives">
            <h3>Security Impact Level</h3>
            <p className="section-description">
              Define the security objectives for confidentiality, integrity, and availability
            </p>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="confidentiality">Confidentiality</label>
                <select
                  id="confidentiality"
                  name="confidentiality"
                  className="form-control"
                  value={formData.confidentiality}
                  onChange={handleChange}
                >
                  <option value="low">Low</option>
                  <option value="moderate">Moderate</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="integrity">Integrity</label>
                <select
                  id="integrity"
                  name="integrity"
                  className="form-control"
                  value={formData.integrity}
                  onChange={handleChange}
                >
                  <option value="low">Low</option>
                  <option value="moderate">Moderate</option>
                  <option value="high">High</option>
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="availability">Availability</label>
                <select
                  id="availability"
                  name="availability"
                  className="form-control"
                  value={formData.availability}
                  onChange={handleChange}
                >
                  <option value="low">Low</option>
                  <option value="moderate">Moderate</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onBack}>
              Back
            </button>
            <button type="submit" className="btn btn-primary">
              Continue to Controls
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default SystemInfoForm;

