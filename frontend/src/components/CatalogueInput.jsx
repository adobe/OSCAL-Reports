/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import React, { useState } from 'react';
import './CatalogueInput.css';
import { SAMPLE_CATALOGUES } from '../catalogues/sampleCatalogues.js';

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
                  <div className="sample-name">
                    {sample.flag && (
                      <span className="catalogue-flag" title="Non-English catalogue">{sample.flag}</span>
                    )}
                    {sample.name}
                  </div>
                  {sample.status === 'new' && (
                    <span className="status-badge status-new" title="Newly added catalogue">🆕 New</span>
                  )}
                  {sample.status === 'updated' && (
                    <span className="status-badge status-updated" title="Reference updated to the latest version">🔄 Updated</span>
                  )}
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

