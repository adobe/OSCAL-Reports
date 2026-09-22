/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import React, { useState } from 'react';
import axios from '../utils/safeAxios.js';
import { useAuth } from '../contexts/AuthContext';
import './ControlSuggestions.css';

const AI_NOT_AUTHORISED_MESSAGE = 'You are not authorised to access this feature. Enablement requires engagement with the Adobe Managed Services Sales team to integrate a dedicated instance with a customer‑provided AI Engine. This capability is offered on an as‑is basis for existing customers, with no warranty or support provided by Adobe Managed Services.';

const ControlSuggestions = ({ control, existingControls, onApplySuggestion, hideButton = false, autoFetch = false }) => {
  const { getAuthConfig, sessionToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [error, setError] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const fetchSuggestions = async () => {
    if (!control || !control.id) {
      setError('Control information is required');
      return;
    }

    // Check authentication
    if (!sessionToken) {
      setError('Authentication required. Please log in.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('🚀 Requesting suggestions for control:', control.id);
      console.log('📤 Request payload:', {
        controlId: control.id,
        controlTitle: control.title,
        existingControlsCount: existingControls?.length || 0
      });
      
      const authConfig = getAuthConfig();
      console.log('🔑 Auth config:', {
        hasToken: !!sessionToken,
        tokenLength: sessionToken?.length,
        headers: authConfig.headers
      });
      
      // Set timeout to 210 seconds (210000ms) to allow for AI processing
      // Backend timeout is 180 seconds, so this gives extra buffer for network overhead
      const response = await axios.post(
        '/api/suggest-control',
        {
          control: control,
          existingControls: existingControls || []
        },
        {
          ...authConfig,
          timeout: 210000 // 210 seconds - longer than backend timeout to allow for processing
        }
      );
      
      console.log('✅ Received suggestions response:', response.data);

      // Always show suggestions if we get a response with success=true
      // The backend ALWAYS returns suggestions (either AI or fallback templates)
      if (response.data.success && response.data.suggestions) {
        setSuggestions(response.data.suggestions);
        setShowSuggestions(true);
        setError(null); // Clear any previous errors
      } else {
        // Even if success=false, try to use suggestions if available
        if (response.data.suggestions) {
          setSuggestions(response.data.suggestions);
          setShowSuggestions(true);
          setError(null);
        } else {
          // Only show error if we truly have no suggestions
          setError('Failed to generate suggestions. Please try again.');
        }
      }
    } catch (err) {
      console.error('Error fetching suggestions:', err);
      console.error('Error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        statusText: err.response?.statusText
      });
      
      // Only show errors for authentication/authorization issues
      // For all other errors, the backend should have returned fallback suggestions
      if (err.response?.status === 401) {
        setError('Authentication required. Please log in again.');
      } else if (err.response?.status === 403 && err.response?.data?.code === 'AI_SUGGESTIONS_NOT_ALLOWED') {
        setShowAuthModal(true);
        setError(null);
      } else if (err.response?.status === 403) {
        setError('Permission denied. You may not have access to this feature.');
      } else {
        // For all other errors (timeout, network, etc.), check if backend returned fallback
        // The backend should ALWAYS return suggestions, even if AI fails
        if (err.response?.data?.suggestions) {
          // Backend returned fallback suggestions despite error
          setSuggestions(err.response.data.suggestions);
          setShowSuggestions(true);
          setError(null); // Don't show error - we have fallback suggestions
        } else {
          // Only show error if we truly have no suggestions from backend
          // This should rarely happen as backend always returns fallback
          console.warn('⚠️ No suggestions received from backend, showing error');
          setError('Unable to fetch suggestions. The system should automatically use templates. Please try again.');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleApplySuggestion = (field = null) => {
    if (!suggestions) return;

    if (field) {
      // Form uses testingProcedure for "Testing Method"; backend returns testingMethod
      const applyField = field === 'testingMethod' ? 'testingProcedure' : field;
      const value = field === 'testingMethod' ? (suggestions.testingProcedure || suggestions.testingMethod) : suggestions[field];
      onApplySuggestion(control.id, applyField, value);
    } else {
      // Apply all suggestions; map testingMethod -> testingProcedure so form field is populated
      Object.keys(suggestions).forEach(key => {
        if (key === 'confidence' || key === 'reasoning' || suggestions[key] === null) return;
        if (key === 'testingMethod') {
          onApplySuggestion(control.id, 'testingProcedure', suggestions.testingProcedure || suggestions.testingMethod);
        } else {
          onApplySuggestion(control.id, key, suggestions[key]);
        }
      });
      setShowSuggestions(false);
    }
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.7) return '#10b981'; // Green
    if (confidence >= 0.5) return '#f59e0b'; // Yellow
    return '#ef4444'; // Red
  };

  const getConfidenceLabel = (confidence) => {
    if (confidence >= 0.7) return 'High';
    if (confidence >= 0.5) return 'Medium';
    return 'Low';
  };

  // Auto-fetch when autoFetch prop is true
  React.useEffect(() => {
    if (autoFetch && control && !suggestions && !loading) {
      fetchSuggestions();
    }
  }, [autoFetch, control]);

  return (
    <div className="control-suggestions">
      {!hideButton && (
        <button
          type="button"
          className="suggest-btn"
          onClick={fetchSuggestions}
          disabled={loading}
          title="Get AI-powered suggestions for this control"
        >
          {loading ? (
            <>
              <span className="spinner"></span>
              Generating...
            </>
          ) : (
            <>
              <span>🤖</span>
              Get Suggestions
            </>
          )}
        </button>
      )}

      {loading && hideButton && (
        <div className="suggestion-loading">
          <span className="spinner"></span>
          Generating AI suggestions...
        </div>
      )}

      {error && (
        <div className="suggestion-error">
          ⚠️ {error}
        </div>
      )}

      {suggestions && showSuggestions && (
        <div className="suggestions-panel">
          <div className="suggestions-header">
            <h4>💡 Implementation Suggestions</h4>
            <div className="suggestions-meta">
              <span 
                className="confidence-badge"
                style={{ backgroundColor: getConfidenceColor(suggestions.confidence) }}
              >
                Confidence: {getConfidenceLabel(suggestions.confidence)} ({Math.round(suggestions.confidence * 100)}%)
              </span>
              <button
                className="close-suggestions-btn"
                onClick={() => setShowSuggestions(false)}
                title="Close suggestions"
              >
                ×
              </button>
            </div>
          </div>

          {/* Source Indicator Badge */}
          {suggestions.source && (
            <div className="source-indicator" style={{
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              marginBottom: '1rem',
              fontWeight: '600',
              fontSize: '0.9rem',
              display: 'inline-block',
              ...(suggestions.source === 'ai' ? {
                backgroundColor: '#d1fae5',
                color: '#065f46',
                border: '1px solid #10b981'
              } : suggestions.source === 'fallback' ? {
                backgroundColor: '#fef3c7',
                color: '#92400e',
                border: '1px solid #f59e0b'
              } : {
                backgroundColor: '#e0e7ff',
                color: '#3730a3',
                border: '1px solid #6366f1'
              })
            }}>
              {suggestions.source === 'ai' && '🤖 '}
              {suggestions.source === 'fallback' && '⚠️ '}
              {suggestions.source === 'template' && '📋 '}
              <strong>Source:</strong> {suggestions.sourceLabel || suggestions.source}
            </div>
          )}

          {suggestions.reasoning && suggestions.reasoning.length > 0 && (
            <div className="suggestions-reasoning">
              <strong>Why these suggestions?</strong>
              <ul>
                {suggestions.reasoning.map((reason, idx) => (
                  <li key={idx}>{reason}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="suggestions-content">
            {suggestions.status && (
              <div className="suggestion-item">
                <div className="suggestion-label">
                  <strong>Status:</strong>
                  <button
                    className="apply-field-btn"
                    onClick={() => handleApplySuggestion('status')}
                    title="Apply this suggestion"
                  >
                    Apply
                  </button>
                </div>
                <div className="suggestion-value status-suggestion">
                  {suggestions.status}
                </div>
              </div>
            )}

            {suggestions.implementation && (
              <div className="suggestion-item">
                <div className="suggestion-label">
                  <strong>Implementation Description:</strong>
                  {suggestions.source && (
                    <span 
                      className="source-badge-inline"
                      style={{
                        marginLeft: '0.5rem',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        ...(suggestions.source === 'ai' ? {
                          backgroundColor: '#d1fae5',
                          color: '#065f46'
                        } : suggestions.source === 'fallback' ? {
                          backgroundColor: '#fef3c7',
                          color: '#92400e'
                        } : {
                          backgroundColor: '#e0e7ff',
                          color: '#3730a3'
                        })
                      }}
                      title={suggestions.source === 'ai' ? 'Generated by AI Engine' : suggestions.source === 'fallback' ? 'Template/Pattern (AI unavailable)' : 'Template/Pattern matching'}
                    >
                      {suggestions.source === 'ai' && '🤖 AI'}
                      {suggestions.source === 'fallback' && '⚠️ Template'}
                      {suggestions.source === 'template' && '📋 Template'}
                    </span>
                  )}
                  <button
                    className="apply-field-btn"
                    onClick={() => handleApplySuggestion('implementation')}
                    title="Apply this suggestion"
                  >
                    Apply
                  </button>
                </div>
                <div className="suggestion-value">
                  {suggestions.implementation}
                </div>
              </div>
            )}

            {suggestions.responsibleParty && (
              <div className="suggestion-item">
                <div className="suggestion-label">
                  <strong>Responsible Party:</strong>
                  <button
                    className="apply-field-btn"
                    onClick={() => handleApplySuggestion('responsibleParty')}
                    title="Apply this suggestion"
                  >
                    Apply
                  </button>
                </div>
                <div className="suggestion-value">
                  {suggestions.responsibleParty}
                </div>
              </div>
            )}

            {suggestions.controlType && (
              <div className="suggestion-item">
                <div className="suggestion-label">
                  <strong>Control Type:</strong>
                  <button
                    className="apply-field-btn"
                    onClick={() => handleApplySuggestion('controlType')}
                    title="Apply this suggestion"
                  >
                    Apply
                  </button>
                </div>
                <div className="suggestion-value">
                  {suggestions.controlType}
                </div>
              </div>
            )}

            {suggestions.testingObjective && (
              <div className="suggestion-item">
                <div className="suggestion-label">
                  <strong>Assessment/Testing Objective:</strong>
                  <button
                    className="apply-field-btn"
                    onClick={() => handleApplySuggestion('testingObjective')}
                    title="Apply this suggestion"
                  >
                    Apply
                  </button>
                </div>
                <div className="suggestion-value">
                  {suggestions.testingObjective}
                </div>
              </div>
            )}

            {(suggestions.testingProcedure || suggestions.testingMethod) && (
              <div className="suggestion-item">
                <div className="suggestion-label">
                  <strong>Testing Method:</strong>
                  <button
                    className="apply-field-btn"
                    onClick={() => handleApplySuggestion('testingMethod')}
                    title="Apply this suggestion"
                  >
                    Apply
                  </button>
                </div>
                <div className="suggestion-value">
                  {suggestions.testingProcedure || suggestions.testingMethod}
                </div>
              </div>
            )}

            {suggestions.remarks !== undefined && suggestions.remarks !== null && (
              <div className="suggestion-item">
                <div className="suggestion-label">
                  <strong>Additional Notes or Consumer Guidance:</strong>
                  <button
                    className="apply-field-btn"
                    onClick={() => handleApplySuggestion('remarks')}
                    title="Apply this suggestion"
                  >
                    Apply
                  </button>
                </div>
                <div className="suggestion-value">
                  {suggestions.remarks && suggestions.remarks.trim() ? suggestions.remarks : '— No additional notes suggested'}
                </div>
              </div>
            )}

            {suggestions.testingFrequency && (
              <div className="suggestion-item">
                <div className="suggestion-label">
                  <strong>Testing Frequency:</strong>
                  <button
                    className="apply-field-btn"
                    onClick={() => handleApplySuggestion('testingFrequency')}
                    title="Apply this suggestion"
                  >
                    Apply
                  </button>
                </div>
                <div className="suggestion-value">
                  {suggestions.testingFrequency}
                </div>
              </div>
            )}

            {suggestions.riskRating && (
              <div className="suggestion-item">
                <div className="suggestion-label">
                  <strong>Risk Rating:</strong>
                  <button
                    className="apply-field-btn"
                    onClick={() => handleApplySuggestion('riskRating')}
                    title="Apply this suggestion"
                  >
                    Apply
                  </button>
                </div>
                <div className="suggestion-value risk-rating-suggestion">
                  {suggestions.riskRating}
                </div>
              </div>
            )}
          </div>

          <div className="suggestions-actions">
            <button
              className="apply-all-btn"
              onClick={() => handleApplySuggestion()}
            >
              ✅ Apply All Suggestions
            </button>
            <button
              className="dismiss-btn"
              onClick={() => setShowSuggestions(false)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Not authorised modal (same style as Platform Settings popout) */}
      {showAuthModal && (
        <div className="modal-overlay" onClick={() => setShowAuthModal(false)}>
          <div className="modal-content settings-modal auth-message-modal" onClick={(e) => e.stopPropagation()}>
            <div className="auth-modal-header">
              <h2>Not authorised</h2>
              <button type="button" className="modal-close" onClick={() => setShowAuthModal(false)} aria-label="Close">&times;</button>
            </div>
            <div className="auth-modal-body">
              <p>{AI_NOT_AUTHORISED_MESSAGE}</p>
            </div>
            <div className="auth-modal-footer">
              <button type="button" className="btn-primary" onClick={() => setShowAuthModal(false)}>OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ControlSuggestions;

