/**
 * Integrity Warning Component - Display FIPS 140-2 File Integrity Warnings
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license GPL-3.0-or-later
 */

import React, { useState } from 'react';
import './IntegrityWarning.css';

function IntegrityWarning({ warning, onDismiss }) {
  const [dismissed, setDismissed] = useState(false);

  // Debug logging
  React.useEffect(() => {
    console.log('🔍 IntegrityWarning component mounted/updated');
    console.log('   Warning prop:', warning);
    console.log('   Dismissed state:', dismissed);
    
    if (warning) {
      console.log('🚨 IntegrityWarning component received warning:', warning);
      console.log('   Message:', warning.message);
      console.log('   Severity:', warning.severity);
      console.log('   Details:', warning.details);
    } else {
      console.log('ℹ️ IntegrityWarning: No warning provided');
    }
  }, [warning, dismissed]);

  // Always log render decision
  console.log('🎨 IntegrityWarning render:', { hasWarning: !!warning, dismissed });

  if (!warning || dismissed) {
    if (dismissed) {
      console.log('ℹ️ IntegrityWarning: Warning dismissed - returning null');
    }
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    if (onDismiss) {
      onDismiss();
    }
  };

  const getSeverityClass = () => {
    if (warning.severity === 'warning') {
      return 'integrity-warning-warning';
    } else if (warning.severity === 'info') {
      return 'integrity-warning-info';
    }
    return 'integrity-warning-info';
  };

  const getIconClass = () => {
    if (warning.severity === 'warning') {
      return 'integrity-warning-icon-warning';
    } else if (warning.severity === 'info') {
      return 'integrity-warning-icon-info';
    }
    return 'integrity-warning-icon-info';
  };

  console.log('✅ IntegrityWarning: Rendering warning component');

  return (
    <div className={`integrity-warning ${getSeverityClass()}`}>
      <div className="integrity-warning-content">
        <div className={`integrity-warning-icon ${getIconClass()}`}></div>
        <div className="integrity-warning-text">
          <div className="integrity-warning-title">
            <strong>{warning.message}</strong>
          </div>
          <div className="integrity-warning-details">{warning.details}</div>
          {(warning.algorithm || warning.fipsCompliant || warning.timestamp) && (
            <div className="integrity-warning-meta">
              <small>
                {warning.algorithm && (
                  <>
                    Algorithm: <strong>{warning.algorithm}</strong>
                    {warning.fipsCompliant && (
                      <> <span className="integrity-fips-badge">FIPS 140-2 Compliant</span></>
                    )}
                  </>
                )}
                {warning.algorithm && warning.timestamp && (
                  <> | Timestamp: <strong>{new Date(warning.timestamp).toLocaleString()}</strong></>
                )}
                {!warning.algorithm && warning.fipsCompliant && (
                  <span className="integrity-fips-badge">FIPS 140-2 Compliant</span>
                )}
                {!warning.algorithm && warning.timestamp && (
                  <>Timestamp: <strong>{new Date(warning.timestamp).toLocaleString()}</strong></>
                )}
              </small>
            </div>
          )}
        </div>
        <button
          className="integrity-warning-dismiss"
          onClick={handleDismiss}
          title="Dismiss warning"
          aria-label="Dismiss warning"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default IntegrityWarning;

