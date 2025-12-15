/**
 * AI Integration Component
 * Configure AI Engine (e.g., Ollama) for control suggestions
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license MIT
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import './AIIntegration.css';

function AIIntegration({ embedded = false }) {
  const { canEditSettings, getAuthConfig } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [aiConfig, setAiConfig] = useState({
    enabled: false,
    url: '',
    apiToken: '',
    model: 'mistral:7b',
    timeout: 120000,
    organizationName: ''
  });
  const [availableModels, setAvailableModels] = useState([]);
  const [modelWarning, setModelWarning] = useState('');

  const isReadOnly = !canEditSettings();

  const checkModelWarning = (modelName) => {
    if (!modelName) {
      setModelWarning('');
      return;
    }
    
    const modelLower = modelName.toLowerCase();
    
    // Models that are accepted without warning
    const acceptedModels = [
      'llama-2', 'llama2', 'llama 2',
      'falcon',
      'gpt-5', 'gpt5', 'gpt-6', 'gpt6', 'gpt-7', 'gpt7', 'gpt-8', 'gpt8', 'gpt-9', 'gpt9'
    ];
    
    // Check if model contains any accepted model name
    const isAccepted = acceptedModels.some(accepted => modelLower.includes(accepted));
    
    // Check if it's mistral (also accepted)
    const isMistral = modelLower.includes('mistral') || modelLower.includes('mixtral');
    
    if (isAccepted || isMistral) {
      setModelWarning('');
    } else {
      setModelWarning('This model has not been fully tested with OSCAL context. Mistral, LLaMA 2, Falcon, and GPT-5+ are recommended.');
    }
  };

  useEffect(() => {
    loadAIConfig();
  }, []);

  useEffect(() => {
    // Check model warning when model changes
    if (aiConfig.model) {
      checkModelWarning(aiConfig.model);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiConfig.model]);

  const loadAIConfig = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/settings', getAuthConfig());
      const config = response.data.aiConfig || {
        enabled: false,
        url: '',
        apiToken: '',
        model: 'mistral:7b',
        timeout: 120000,
        organizationName: ''
      };
      
      // Migrate old format (url + port) to new format (full URL)
      if (config.port && !config.url.includes('://')) {
        const hostname = config.url || 'localhost';
        const port = config.port || 11434;
        config.url = `http://${hostname}:${port}`;
        delete config.port;
      }
      setAiConfig(config);
      setMessage('');
      setTestResult(null);
      setAvailableModels([]);
      setModelWarning('');
    } catch (error) {
      console.error('Failed to load AI config:', error);
      setMessage('⚠️ Failed to load AI configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (isReadOnly) {
      setMessage('⚠️ You do not have permission to edit settings. Only Platform Admins can make changes.');
      setTimeout(() => setMessage(''), 4000);
      return;
    }

    try {
      setSaving(true);
      setMessage('');

      // Validate URL if enabled
      if (aiConfig.enabled) {
        if (!aiConfig.url || !aiConfig.url.trim()) {
          throw new Error('AI Engine URL is required when enabled');
        }
        
        // Validate URL format (must be a valid URL)
        try {
          const urlStr = aiConfig.url.trim();
          const testUrl = new URL(urlStr.startsWith('http') ? urlStr : `http://${urlStr}`);
        } catch (e) {
          throw new Error('Invalid AI Engine URL format. Use format: http://hostname:port or https://hostname:port');
        }

        if (!aiConfig.model || !aiConfig.model.trim()) {
          throw new Error('Model name is required when enabled');
        }
      }

      const response = await axios.get('/api/settings', getAuthConfig());
      const currentConfig = response.data;
      
      const updatedConfig = {
        ...currentConfig,
        aiConfig: aiConfig
      };

      await axios.post('/api/settings', updatedConfig, getAuthConfig());
      setMessage('✅ AI configuration saved successfully');
      setTimeout(() => setMessage(''), 3000);
      setTestResult(null);
    } catch (error) {
      console.error('Failed to save AI config:', error);
      setMessage('❌ Failed to save AI configuration: ' + (error.response?.data?.error || error.message));
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!aiConfig.enabled || !aiConfig.url) {
      setTestResult({
        success: false,
        message: 'Please enable and configure AI Engine URL before testing'
      });
      return;
    }

    try {
      setTesting(true);
      setTestResult(null);
      setMessage('🔄 Testing AI Engine connection...');

      const response = await axios.post('/api/ai/test-connection', 
        {
          url: aiConfig.url,
          apiToken: aiConfig.apiToken || ''
        },
        getAuthConfig()
      );

      if (response.data.success) {
        const details = response.data.details || {};
        const models = details.models || [];
        const recommendedModel = details.recommendedModel;
        
        // Set available models
        setAvailableModels(models);
        
        // Auto-select recommended model (mistral) if available and no model is set, or current model is not in available models
        if (recommendedModel) {
          if (!aiConfig.model || !models.includes(aiConfig.model)) {
            setAiConfig({ ...aiConfig, model: recommendedModel });
            checkModelWarning(recommendedModel);
          } else {
            checkModelWarning(aiConfig.model);
          }
        } else if (aiConfig.model) {
          checkModelWarning(aiConfig.model);
        }
        
        setTestResult({
          success: true,
          message: '✅ Connection successful!',
          details: details
        });
        setMessage('✅ AI Engine connection test successful');
      } else {
        setTestResult({
          success: false,
          message: '❌ Connection failed',
          details: response.data.error || 'Unknown error'
        });
        setMessage('❌ AI Engine connection test failed');
        setAvailableModels([]);
        setModelWarning('');
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Unknown error';
      setTestResult({
        success: false,
        message: '❌ Connection test failed',
        details: errorMessage
      });
      setMessage('❌ AI Engine connection test failed: ' + errorMessage);
    } finally {
      setTesting(false);
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const handleClear = () => {
    if (confirm('Clear AI Engine configuration?')) {
      setAiConfig({
        enabled: false,
        url: '',
        apiToken: '',
        model: 'mistral:7b',
        timeout: 120000
      });
      setTestResult(null);
      setAvailableModels([]);
      setModelWarning('');
    }
  };

  const handleModelChange = (e) => {
    const newModel = e.target.value;
    setAiConfig({ ...aiConfig, model: newModel });
    checkModelWarning(newModel);
  };


  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="spinner">⏳ Loading AI configuration...</div>
      </div>
    );
  }

  return (
    <div className={`ai-integration-container ${embedded ? 'embedded' : ''}`}>
      {!embedded && (
        <div className="ai-integration-header">
          <h2>🤖 AI Integration</h2>
          <p className="subtitle">Configure AI Engine for control implementation suggestions</p>
          <p className="subtitle" style={{ fontSize: '0.85rem', color: '#d97706', marginTop: '0.5rem', fontWeight: '500' }}>
            🔒 <strong>Administrator Access Only:</strong> This page can only be modified by the platform Administrator
          </p>
          {isReadOnly && (
            <div style={{ 
              background: '#fff3cd', 
              color: '#856404', 
              padding: '1rem', 
              borderRadius: '6px', 
              marginTop: '1rem',
              border: '1px solid #ffc107'
            }}>
              ⚠️ <strong>Read-Only Mode:</strong> You are viewing settings in read-only mode. Only Platform Administrators can make changes.
            </div>
          )}
        </div>
      )}

      {message && (
        <div className={`ai-message ${message.includes('✅') ? 'success' : message.includes('🔄') ? 'info' : 'error'}`}>
          {message}
        </div>
      )}

      <div className="ai-integration-content">
        <div className="ai-section">
          <div className="section-header">
            <div className="section-title">
              <h3>⚙️ AI Engine Configuration</h3>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={aiConfig.enabled}
                  onChange={(e) => setAiConfig({ ...aiConfig, enabled: e.target.checked })}
                  disabled={isReadOnly}
                />
                <span className="toggle-slider"></span>
                <span className="toggle-label">{aiConfig.enabled ? 'Enabled' : 'Disabled'}</span>
              </label>
            </div>
          </div>

          <div className="ai-form">
            <div className="form-group">
              <label>
                AI Engine URL *
                <small>Full URL of your AI Engine (e.g., http://192.168.1.200:11434 or https://api.openai.com/v1)</small>
              </label>
              <input
                type="text"
                className="form-control"
                value={aiConfig.url}
                onChange={(e) => setAiConfig({ ...aiConfig, url: e.target.value })}
                placeholder="http://192.168.1.200:11434"
                disabled={!aiConfig.enabled || isReadOnly}
              />
            </div>

            <div className="form-group">
              <label>
                API Token (Optional)
                <small>API token for authentication (not needed if Ollama is hosted internally)</small>
              </label>
              <input
                type="password"
                className="form-control"
                value={aiConfig.apiToken}
                onChange={(e) => setAiConfig({ ...aiConfig, apiToken: e.target.value })}
                placeholder="Leave empty for internal Ollama instances"
                disabled={!aiConfig.enabled || isReadOnly}
              />
            </div>

            <div className="form-group">
              <label>
                Model Name *
                <small>Select a model from available models (test connection first to see available models)</small>
              </label>
              {availableModels.length > 0 ? (
                <select
                  className="form-control"
                  value={aiConfig.model}
                  onChange={handleModelChange}
                  disabled={!aiConfig.enabled || isReadOnly}
                >
                  {availableModels.map(model => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  className="form-control"
                  value={aiConfig.model}
                  onChange={(e) => {
                    setAiConfig({ ...aiConfig, model: e.target.value });
                    checkModelWarning(e.target.value);
                  }}
                  placeholder="mistral:7b (test connection to see available models)"
                  disabled={!aiConfig.enabled || isReadOnly}
                />
              )}
              {modelWarning && (
                <div style={{ 
                  marginTop: '0.5rem', 
                  padding: '0.75rem', 
                  background: '#fff3cd', 
                  border: '1px solid #ffc107', 
                  borderRadius: '6px',
                  color: '#856404',
                  fontSize: '0.9rem'
                }}>
                  ⚠️ {modelWarning}
                </div>
              )}
            </div>

            <div className="form-group">
              <label>
                Timeout (ms)
                <small>Request timeout in milliseconds (default: 180000 = 3 minutes, allows for model loading and processing)</small>
              </label>
              <input
                type="number"
                className="form-control"
                value={aiConfig.timeout}
                onChange={(e) => setAiConfig({ ...aiConfig, timeout: parseInt(e.target.value) || 180000 })}
                placeholder="180000"
                min="60000"
                max="600000"
                disabled={!aiConfig.enabled || isReadOnly}
              />
            </div>

            <div className="form-group">
              <label>
                Organization Name *
                <small>Organization name displayed in AI-generated implementation text (e.g., "Adobe", "Your Company")</small>
              </label>
              <input
                type="text"
                className="form-control"
                value={aiConfig.organizationName || ''}
                onChange={(e) => setAiConfig({ ...aiConfig, organizationName: e.target.value })}
                placeholder="Adobe"
                disabled={isReadOnly}
              />
            </div>

            <div className="form-actions">
              <button 
                className="btn-primary" 
                onClick={handleTestConnection}
                disabled={!aiConfig.enabled || !aiConfig.url || testing || isReadOnly}
              >
                {testing ? '⏳ Testing...' : '🔍 Test Connection & Fetch Models'}
              </button>
              <button 
                className="btn-danger" 
                onClick={handleClear}
                disabled={!aiConfig.url || isReadOnly}
              >
                🗑️ Clear
              </button>
            </div>

            {testResult && (
              <div className={`test-result ${testResult.success ? 'success' : 'error'}`}>
                <div className="test-result-header">
                  <strong>{testResult.message}</strong>
                </div>
                {testResult.details && (
                  <div className="test-result-details">
                    {typeof testResult.details === 'string' ? (
                      <pre>{testResult.details}</pre>
                    ) : (
                      <pre>{JSON.stringify(testResult.details, null, 2)}</pre>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="info-box">
              <strong>ℹ️ How it works:</strong>
              <p>Configure your external AI Engine (e.g., Ollama running on another server or container) to enable AI-powered control implementation suggestions.</p>
              <ul>
                <li>✅ Enter the full URL where your AI Engine is running (include protocol and port)</li>
                <li>✅ Enter API token if required (leave empty for internal Ollama instances or OpenAI API key)</li>
                <li>✅ Click "Test Connection & Fetch Models" to see available models</li>
                <li>✅ Mistral model will be automatically selected if available</li>
                <li>✅ The application will use this AI Engine for "Get Suggestions" functionality</li>
                <li>✅ AI Engine is NOT part of this project - you must set it up separately</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="ai-section">
          <div className="save-section">
            <button 
              className="btn-primary btn-large" 
              onClick={handleSave}
              disabled={saving || isReadOnly}
            >
              {saving ? '⏳ Saving...' : (isReadOnly ? '🔒 Read-Only (Admin Access Required)' : '💾 Save AI Configuration')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AIIntegration;

