/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import React, { useState } from 'react';
import './CatalogChoice.css';
import { SAMPLE_CATALOGUES } from '../catalogues/sampleCatalogues.js';

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
              {catalog.status === 'new' && (
                <span className="status-badge status-new" title="Newly added catalogue">🆕 New</span>
              )}
              {catalog.status === 'updated' && (
                <span className="status-badge status-updated" title="Reference updated to the latest version">🔄 Updated</span>
              )}
              <div className="catalog-name">
                {catalog.flag && (
                  <span className="catalogue-flag" title="Non-English catalogue">{catalog.flag}</span>
                )}
                {catalog.name}
              </div>
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

