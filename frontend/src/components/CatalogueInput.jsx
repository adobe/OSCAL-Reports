/**
 * CatalogueInput Component - Select and load OSCAL catalogs
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license GPL-3.0-or-later
 */

import React, { useState } from 'react';
import './CatalogueInput.css';

const SAMPLE_CATALOGUES = [
  {
    name: 'Australian ISM (Non-Classified Baseline)',
    url: 'https://raw.githubusercontent.com/AustralianCyberSecurityCentre/ism-oscal/refs/tags/v2025.10.8/ISM_NON_CLASSIFIED-baseline-resolved-profile_catalog.json',
    description: 'Australian Signals Directorate ISM Non-Classified Baseline',
    classification: 'Non-Classified',
    publisher: 'ACSC'
  },
  {
    name: 'Australian ISM (Official Sensitive Baseline)',
    url: 'https://raw.githubusercontent.com/AustralianCyberSecurityCentre/ism-oscal/refs/tags/v2025.10.8/ISM_OFFICIAL_SENSITIVE-baseline-resolved-profile_catalog.json',
    description: 'Australian Signals Directorate ISM Official Sensitive Baseline',
    classification: 'Official Sensitive',
    publisher: 'ACSC'
  },
  {
    name: 'Australian ISM (Protected Baseline)',
    url: 'https://raw.githubusercontent.com/AustralianCyberSecurityCentre/ism-oscal/refs/heads/main/ISM_PROTECTED-baseline-resolved-profile_catalog.json',
    description: 'Australian Signals Directorate ISM Protected Baseline',
    classification: 'Protected',
    publisher: 'ACSC'
  },
  {
    name: 'Australian ISM (Secret Baseline)',
    url: 'https://raw.githubusercontent.com/AustralianCyberSecurityCentre/ism-oscal/refs/tags/v2025.10.8/ISM_SECRET-baseline-resolved-profile_catalog.json',
    description: 'Australian Signals Directorate ISM Secret Baseline',
    classification: 'Secret',
    publisher: 'ACSC'
  },
  {
    name: 'Australian ISM (Top Secret Baseline)',
    url: 'https://raw.githubusercontent.com/AustralianCyberSecurityCentre/ism-oscal/refs/tags/v2025.10.8/ISM_TOP_SECRET-baseline-resolved-profile_catalog.json',
    description: 'Australian Signals Directorate ISM Top Secret Baseline',
    classification: 'Top Secret',
    publisher: 'ACSC'
  },
  {
    name: 'Canadian CCCS Cloud Medium Profile',
    url: 'https://raw.githubusercontent.com/aws-samples/cccs-oscal-samples/refs/heads/main/profiles/cccs-cloud-medium-profile/cccs-cloud-medium-resolved.json',
    description: 'Canadian Centre for Cyber Security Cloud Medium Security Profile',
    classification: 'medium',
    publisher: 'CCCS'
  },
  {
    name: 'Canadian CCCS ITSP.10.033-01',
    url: 'https://raw.githubusercontent.com/aws-samples/cccs-oscal-samples/refs/heads/main/profiles/cccs-itsp.10.033-01-profile/cccs-itsp.10.033-01-resolved.json',
    description: 'Canadian Centre for Cyber Security ITSP.10.033-01 User Authentication Guidance Profile',
    classification: 'moderate',
    publisher: 'CCCS'
  },
  {
    name: 'Canadian CCCS ITSP.10.171 (Protected B)',
    url: 'https://raw.githubusercontent.com/aws-samples/cccs-oscal-samples/refs/heads/main/profiles/cccs-itsp.10.171-profile/cccs-itsp.10.171-resolved.json',
    description: 'Canadian Centre for Cyber Security ITSP.10.171 Protected B Profile',
    classification: 'Protected B',
    publisher: 'CCCS'
  },
  {
    name: 'Canadian CCCS Medium + PBHVA',
    url: 'https://raw.githubusercontent.com/aws-samples/cccs-oscal-samples/refs/heads/main/profiles/cccs-medium%2Bpbhva-profile/cccs-medium%2Bpbhva-resolved.json',
    description: 'Canadian Centre for Cyber Security Medium + Protected B, High Integrity, High Availability Profile',
    classification: 'Protected B',
    publisher: 'CCCS'
  },
  {
    name: 'Canadian CCCS PBHVA Overlay',
    url: 'https://raw.githubusercontent.com/aws-samples/cccs-oscal-samples/refs/heads/main/profiles/cccs-pbhva-overlay-profile/cccs-pbhva-overlay-resolved.json',
    description: 'Canadian Centre for Cyber Security Protected B, High Integrity, High Availability Overlay Profile',
    classification: 'Protected B',
    publisher: 'CCCS'
  },
  {
    name: 'Canadian CCCS SaaS FedRAMP Profile',
    url: 'https://raw.githubusercontent.com/aws-samples/cccs-oscal-samples/refs/heads/main/profiles/cccs-saas-fedramp-profile/cccs-saas-fedramp-resolved.json',
    description: 'Canadian Centre for Cyber Security SaaS FedRAMP Compliance Profile',
    classification: 'moderate',
    publisher: 'CCCS'
  },
  {
    name: 'NIST SP 800-53 Rev 5 (Full Catalog)',
    url: 'https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json',
    description: 'Complete NIST SP 800-53 Rev 5 catalog',
    classification: 'moderate',
    publisher: 'NIST'
  },
  {
    name: 'NIST SP 800-53 Rev 5 (High Baseline)',
    url: 'https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_HIGH-baseline_profile.json',
    description: 'High impact baseline profile',
    classification: 'high',
    publisher: 'NIST'
  },
  {
    name: 'NIST SP 800-53 Rev 5 (Low Baseline)',
    url: 'https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_LOW-baseline_profile.json',
    description: 'Low impact baseline profile',
    classification: 'low',
    publisher: 'NIST'
  },
  {
    name: 'NIST SP 800-53 Rev 5 (Moderate Baseline)',
    url: 'https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_MODERATE-baseline_profile.json',
    description: 'Moderate impact baseline profile',
    classification: 'moderate',
    publisher: 'NIST'
  },
  {
    name: 'Singapore IM8 Reform (Low Risk Cloud)',
    url: 'https://raw.githubusercontent.com/GovTechSG/tech-standards/refs/heads/master/catalogs/im8-reform.json',
    description: 'Singapore Government IM8 Reform catalog for low-risk cloud systems',
    classification: 'low',
    publisher: 'GovTech SG'
  }
].sort((a, b) => a.name.localeCompare(b.name));

function CatalogueInput({ onSubmit, loading }) {
  const [url, setUrl] = useState('');
  const [selectedSample, setSelectedSample] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (url.trim()) {
      // Find if this URL is in our samples to get classification
      const sample = SAMPLE_CATALOGUES.find(s => s.url === url.trim());
      const classification = sample?.classification || null;
      onSubmit(url.trim(), classification);
    }
  };

  const handleSampleSelect = (sampleUrl, classification) => {
    setUrl(sampleUrl);
    setSelectedSample(sampleUrl);
    // Auto-submit when sample is selected
    onSubmit(sampleUrl, classification);
  };

  return (
    <div className="catalogue-input-container">
      <div className="card">
        <h2>Load OSCAL Catalogue</h2>
        <p className="card-description">
          Enter the URL of an OSCAL catalogue or profile JSON file, or select from popular NIST catalogues below.
        </p>

        <form onSubmit={handleSubmit} className="catalogue-form">
          <div className="form-group">
            <label htmlFor="catalogue-url">Catalogue URL</label>
            <input
              id="catalogue-url"
              type="url"
              className="form-control"
              placeholder="https://example.com/oscal-catalogue.json"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>

          <button 
            type="submit" 
            className="btn btn-primary btn-large"
            disabled={loading || !url.trim()}
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Loading Catalogue...
              </>
            ) : (
              <>
                Load Catalogue
              </>
            )}
          </button>
        </form>

        <div className="divider">
          <span>OR SELECT A SAMPLE</span>
        </div>

        <div className="samples-grid">
          {SAMPLE_CATALOGUES.map((sample) => (
            <button
              key={sample.url}
              className={`sample-card ${selectedSample === sample.url ? 'selected' : ''}`}
              onClick={() => handleSampleSelect(sample.url, sample.classification)}
              disabled={loading}
              title={sample.description || sample.name}
            >
              <div className="sample-icon">📋</div>
              <div className="sample-content">
                <div className="sample-header">
                  <div className="sample-name">{sample.name}</div>
                  {sample.publisher && (
                    <span className="publisher-badge">{sample.publisher}</span>
                  )}
                </div>
                {sample.description && (
                  <div className="sample-description">{sample.description}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="info-card">
        <h3>What is OSCAL?</h3>
        <p>
          The Open Security Controls Assessment Language (OSCAL) is a set of formats 
          expressed in XML, JSON, and YAML. These formats provide machine-readable 
          representations of control catalogs, control baselines, system security plans, 
          and assessment results.
        </p>
        <h3>How to use this tool</h3>
        <ol>
          <li>Load an OSCAL catalogue or profile from a URL</li>
          <li>Enter your system information</li>
          <li>Document control implementations</li>
          <li>Export as OSCAL JSON or Excel spreadsheet</li>
        </ol>
      </div>
    </div>
  );
}

export default CatalogueInput;

