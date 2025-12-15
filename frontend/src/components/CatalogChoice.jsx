/**
 * CatalogChoice Component - Choose between keeping current catalog or updating
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license MIT
 */

import React, { useState } from 'react';
import './CatalogChoice.css';

const SAMPLE_CATALOGUES = [
  {
    name: 'Australian ISM (Non-Classified Baseline)',
    url: 'https://raw.githubusercontent.com/AustralianCyberSecurityCentre/ism-oscal/refs/tags/v2025.10.8/ISM_NON_CLASSIFIED-baseline-resolved-profile_catalog.json',
    description: 'Australian Signals Directorate ISM Non-Classified Baseline',
    classification: 'Non-Classified'
  },
  {
    name: 'Australian ISM (Official Sensitive Baseline)',
    url: 'https://raw.githubusercontent.com/AustralianCyberSecurityCentre/ism-oscal/refs/tags/v2025.10.8/ISM_OFFICIAL_SENSITIVE-baseline-resolved-profile_catalog.json',
    description: 'Australian Signals Directorate ISM Official Sensitive Baseline',
    classification: 'Official Sensitive'
  },
  {
    name: 'Australian ISM (Protected Baseline)',
    url: 'https://raw.githubusercontent.com/AustralianCyberSecurityCentre/ism-oscal/refs/heads/main/ISM_PROTECTED-baseline-resolved-profile_catalog.json',
    description: 'Australian Signals Directorate ISM Protected Baseline',
    classification: 'Protected'
  },
  {
    name: 'Australian ISM (Secret Baseline)',
    url: 'https://raw.githubusercontent.com/AustralianCyberSecurityCentre/ism-oscal/refs/tags/v2025.10.8/ISM_SECRET-baseline-resolved-profile_catalog.json',
    description: 'Australian Signals Directorate ISM Secret Baseline',
    classification: 'Secret'
  },
  {
    name: 'Australian ISM (Top Secret Baseline)',
    url: 'https://raw.githubusercontent.com/AustralianCyberSecurityCentre/ism-oscal/refs/tags/v2025.10.8/ISM_TOP_SECRET-baseline-resolved-profile_catalog.json',
    description: 'Australian Signals Directorate ISM Top Secret Baseline',
    classification: 'Top Secret'
  },
  {
    name: 'NIST SP 800-53 Rev 5 (Full Catalog)',
    url: 'https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json',
    description: 'Complete NIST SP 800-53 Rev 5 catalog',
    classification: 'moderate'
  },
  {
    name: 'NIST SP 800-53 Rev 5 (High Baseline)',
    url: 'https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_HIGH-baseline_profile.json',
    description: 'High impact baseline profile',
    classification: 'high'
  },
  {
    name: 'NIST SP 800-53 Rev 5 (Low Baseline)',
    url: 'https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_LOW-baseline_profile.json',
    description: 'Low impact baseline profile',
    classification: 'low'
  },
  {
    name: 'NIST SP 800-53 Rev 5 (Moderate Baseline)',
    url: 'https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_MODERATE-baseline_profile.json',
    description: 'Moderate impact baseline profile',
    classification: 'moderate'
  },
  {
    name: 'Singapore IM8 Reform',
    url: 'https://raw.githubusercontent.com/GovTechSG/tech-standards/refs/heads/master/catalogs/im8-reform.json',
    description: 'Singapore Government IM8 Reform catalog',
    classification: 'moderate'
  },
  {
    name: 'Canadian CCCS Cloud Medium Profile',
    url: 'https://raw.githubusercontent.com/aws-samples/cccs-oscal-samples/refs/heads/main/profiles/cccs-cloud-medium-profile/cccs-cloud-medium-resolved.json',
    description: 'Canadian Centre for Cyber Security Cloud Medium Security Profile',
    classification: 'medium',
    tags: ['Canadian', 'CCCS', 'Cloud']
  },
  {
    name: 'Canadian CCCS ITSP.10.033-01',
    url: 'https://raw.githubusercontent.com/aws-samples/cccs-oscal-samples/refs/heads/main/profiles/cccs-itsp.10.033-01-profile/cccs-itsp.10.033-01-resolved.json',
    description: 'Canadian Centre for Cyber Security ITSP.10.033-01 User Authentication Guidance Profile',
    classification: 'moderate',
    tags: ['Canadian', 'CCCS', 'Authentication']
  },
  {
    name: 'Canadian CCCS ITSP.10.171 (Protected B)',
    url: 'https://raw.githubusercontent.com/aws-samples/cccs-oscal-samples/refs/heads/main/profiles/cccs-itsp.10.171-profile/cccs-itsp.10.171-resolved.json',
    description: 'Canadian Centre for Cyber Security ITSP.10.171 Protected B Profile',
    classification: 'Protected B',
    tags: ['Canadian', 'CCCS', 'Protected B']
  },
  {
    name: 'Canadian CCCS Medium + PBHVA',
    url: 'https://raw.githubusercontent.com/aws-samples/cccs-oscal-samples/refs/heads/main/profiles/cccs-medium%2Bpbhva-profile/cccs-medium%2Bpbhva-resolved.json',
    description: 'Canadian Centre for Cyber Security Medium + Protected B, High Integrity, High Availability Profile',
    classification: 'Protected B',
    tags: ['Canadian', 'CCCS', 'High Availability']
  },
  {
    name: 'Canadian CCCS PBHVA Overlay',
    url: 'https://raw.githubusercontent.com/aws-samples/cccs-oscal-samples/refs/heads/main/profiles/cccs-pbhva-overlay-profile/cccs-pbhva-overlay-resolved.json',
    description: 'Canadian Centre for Cyber Security Protected B, High Integrity, High Availability Overlay Profile',
    classification: 'Protected B',
    tags: ['Canadian', 'CCCS', 'Overlay']
  },
  {
    name: 'Canadian CCCS SaaS FedRAMP Profile',
    url: 'https://raw.githubusercontent.com/aws-samples/cccs-oscal-samples/refs/heads/main/profiles/cccs-saas-fedramp-profile/cccs-saas-fedramp-resolved.json',
    description: 'Canadian Centre for Cyber Security SaaS FedRAMP Compliance Profile',
    classification: 'moderate',
    tags: ['Canadian', 'CCCS', 'SaaS', 'FedRAMP']
  }
].sort((a, b) => a.name.localeCompare(b.name));

function CatalogChoice({ existingCatalogUrl, onKeepExisting, onUpdateCatalog, loading }) {
  const [customUrl, setCustomUrl] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);

  const existingCatalogName = SAMPLE_CATALOGUES.find(cat => cat.url === existingCatalogUrl)?.name || 'Current Catalog';

  const handleKeepExisting = () => {
    onKeepExisting();
  };

  const handleSelectNewCatalog = (url, classification) => {
    onUpdateCatalog(url, classification);
  };

  const handleCustomCatalog = () => {
    if (customUrl.trim()) {
      onUpdateCatalog(customUrl.trim(), null);
    }
  };

  return (
    <div className="catalog-choice-container">
      <div className="catalog-choice-header">
        <h2>📚 Select Compliance Framework Catalog</h2>
        <p className="text-muted">
          Your existing report uses: <strong>{existingCatalogName}</strong>
        </p>
      </div>

      {/* Keep Existing Catalog */}
      <div className="catalog-option-card keep-existing">
        <div className="option-icon">✓</div>
        <div className="option-content">
          <h3>Keep Current Catalog</h3>
          <p>Continue with the same framework version</p>
          <p className="catalog-url">{existingCatalogUrl}</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleKeepExisting}
          disabled={loading}
        >
          {loading ? (
            <>
              <span className="spinner"></span>
              Loading...
            </>
          ) : (
            <>
              <span>✓</span>
              Keep Current
            </>
          )}
        </button>
      </div>

      <div className="divider">
        <span>OR</span>
      </div>

      {/* Update to New Catalog */}
      <div className="update-catalog-section">
        <h3>🔄 Update to Latest Framework Version</h3>
        <p className="text-muted">
          Select a newer catalog version to identify new or changed controls
        </p>

        <div className="catalog-grid">
          {SAMPLE_CATALOGUES.map((catalog) => (
            <button
              key={catalog.url}
              className={`catalog-card ${catalog.url === existingCatalogUrl ? 'current' : ''}`}
              onClick={() => handleSelectNewCatalog(catalog.url, catalog.classification)}
              disabled={loading || catalog.url === existingCatalogUrl}
            >
              {catalog.url === existingCatalogUrl && (
                <span className="current-badge">Current</span>
              )}
              <div className="catalog-name">{catalog.name}</div>
              <div className="catalog-description">{catalog.description}</div>
            </button>
          ))}
        </div>

        {/* Custom URL Option */}
        <div className="custom-url-section">
          {!showCustomInput ? (
            <button
              className="btn btn-secondary"
              onClick={() => setShowCustomInput(true)}
              disabled={loading}
            >
              <span>🔗</span>
              Use Custom Catalog URL
            </button>
          ) : (
            <div className="custom-url-input-group">
              <input
                type="url"
                className="form-control"
                placeholder="https://example.com/catalog.json"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                disabled={loading}
              />
              <button
                className="btn btn-primary"
                onClick={handleCustomCatalog}
                disabled={loading || !customUrl.trim()}
              >
                {loading ? 'Loading...' : 'Use This'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setShowCustomInput(false);
                  setCustomUrl('');
                }}
                disabled={loading}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="info-banner">
        <span className="info-icon">ℹ️</span>
        <div>
          <strong>What happens when you update the catalog?</strong>
          <p>
            We'll compare the new catalog with your existing report and highlight controls that are 
            new or have changed. All your existing data will be preserved.
          </p>
        </div>
      </div>
    </div>
  );
}

export default CatalogChoice;

