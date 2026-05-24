/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import React, { useState, useEffect } from 'react';
import axios from '../utils/safeAxios.js';
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
    provider: 'aws-bedrock', // 'aws-bedrock' or 'mistral-api'
    url: '',
    apiToken: '',
    model: 'mistral:7b',
    timeout: 120000,
    organizationName: '',
    extensiveLogging: false, // When true, append AI telemetry to logs/ (e.g. ai-telemetry-*.jsonl)
    allowedUsersForAI: '',  // Comma-separated, max 5; only for mistral-api/aws-bedrock, e.g. *@adobe.com, mkesharw
    // AWS Bedrock specific
    awsRegion: 'us-east-1',
    awsAccessKeyId: '',
    awsSecretAccessKey: '',
    bedrockModelId: 'mistral.mistral-large-2402-v1:0'
  });
  const [availableModels, setAvailableModels] = useState([]);
  const [modelWarning, setModelWarning] = useState('');
  const [bedrockModels, setBedrockModels] = useState([]);
  const [bedrockModelsLoading, setBedrockModelsLoading] = useState(false);
  const [bedrockModelsError, setBedrockModelsError] = useState('');

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
    
    // Check if it's gemma (also accepted)
    const isGemma = modelLower.includes('gemma');
    
    if (isAccepted || isMistral || isGemma) {
      setModelWarning('');
    } else {
      setModelWarning('This model has not been fully tested with OSCAL context. Mistral, Gemma, LLaMA 2, Falcon, and GPT-5+ are recommended.');
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

  useEffect(() => {
    if (aiConfig.provider === 'aws-bedrock') {
      fetchBedrockModels(aiConfig.awsRegion || 'us-east-1');
    } else {
      setBedrockModels([]);
      setBedrockModelsError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiConfig.provider, aiConfig.awsRegion]);

  const loadAIConfig = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/settings', getAuthConfig());
      const config = response.data.aiConfig || {
        enabled: false,
        provider: 'aws-bedrock',
        url: '',
        apiToken: '',
        model: 'mistral:7b',
        timeout: 120000,
        organizationName: '',
        extensiveLogging: false,
        allowedUsersForAI: '',
        awsRegion: 'us-east-1',
        awsAccessKeyId: '',
        awsSecretAccessKey: '',
        bedrockModelId: 'mistral.mistral-large-2402-v1:0'
      };
      
      // Migrate old format (url + port) to new format (full URL)
      if (config.port && !config.url.includes('://')) {
        const hostname = config.url || 'localhost';
        const port = config.port || 11434;
        config.url = `http://${hostname}:${port}`;
        delete config.port;
      }
      
      // Default provider to aws-bedrock if not set; migrate legacy ollama to aws-bedrock
      if (!config.provider || config.provider === 'ollama') {
        config.provider = 'aws-bedrock';
      }
      if (config.allowedUsersForAI == null) {
        config.allowedUsersForAI = '';
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

  const fetchBedrockModels = async (region) => {
    if (!region || !region.trim()) return;
    setBedrockModelsLoading(true);
    setBedrockModelsError('');
    try {
      const response = await axios.get(`/api/ai/bedrock-models?region=${encodeURIComponent(region)}`, getAuthConfig());
      setBedrockModels(response.data?.models || []);
    } catch (error) {
      const msg = error.response?.data?.error || error.message || 'Could not load Bedrock models.';
      setBedrockModelsError(msg);
      setBedrockModels([]);
    } finally {
      setBedrockModelsLoading(false);
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

      // Validate based on provider
      if (aiConfig.enabled) {
        if (aiConfig.provider === 'aws-bedrock') {
          // AWS Bedrock validation (credentials may be in pass vault, so accept non-empty string or _pass)
          if (!aiConfig.awsRegion || !aiConfig.awsRegion.trim()) {
            throw new Error('AWS region is required for AWS Bedrock');
          }
          const hasAccessKey = (typeof aiConfig.awsAccessKeyId === 'string' && aiConfig.awsAccessKeyId.trim()) || aiConfig.awsAccessKeyId?._pass;
          const hasSecretKey = (typeof aiConfig.awsSecretAccessKey === 'string' && aiConfig.awsSecretAccessKey.trim()) || aiConfig.awsSecretAccessKey?._pass;
          if (!hasAccessKey) {
            throw new Error('AWS Access Key ID is required for AWS Bedrock');
          }
          if (!hasSecretKey) {
            throw new Error('AWS Secret Access Key is required for AWS Bedrock');
          }
          if (!aiConfig.bedrockModelId || !aiConfig.bedrockModelId.trim()) {
            throw new Error('Bedrock Model ID is required for AWS Bedrock');
          }
        }
        if ((aiConfig.provider === 'mistral-api' || aiConfig.provider === 'aws-bedrock') && aiConfig.allowedUsersForAI != null && String(aiConfig.allowedUsersForAI).trim() !== '') {
          const entries = String(aiConfig.allowedUsersForAI).split(',').map(s => s.trim()).filter(Boolean);
          if (entries.length > 5) {
            throw new Error('Allowed users for Get Suggestions: maximum 5 comma-separated entries.');
          }
        }
        if (aiConfig.provider !== 'aws-bedrock') {
          // Mistral API validation
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
    // Validate based on provider (uses current form values; Save is not required first)
    if (aiConfig.provider === 'aws-bedrock') {
      const hasAccessKey = (typeof aiConfig.awsAccessKeyId === 'string' && aiConfig.awsAccessKeyId.trim()) ||
        (aiConfig.awsAccessKeyId && typeof aiConfig.awsAccessKeyId === 'object' && aiConfig.awsAccessKeyId._pass);
      const hasSecretKey = (typeof aiConfig.awsSecretAccessKey === 'string' && aiConfig.awsSecretAccessKey.trim()) ||
        (aiConfig.awsSecretAccessKey && typeof aiConfig.awsSecretAccessKey === 'object' && aiConfig.awsSecretAccessKey._pass);
      if (!aiConfig.awsRegion || !hasAccessKey || !hasSecretKey) {
        setTestResult({
          success: false,
          message: 'Configure AWS region and credentials in this form to test (or use Pass vault entries already saved on the server).'
        });
        return;
      }
    } else {
      if (!aiConfig.url?.trim()) {
        setTestResult({
          success: false,
          message: 'Enter the AI Engine URL in this form to test the connection.'
        });
        return;
      }
    }

    try {
      setTesting(true);
      setTestResult(null);
      setMessage(`🔄 Testing ${aiConfig.provider} connection...`);

      const requestBody = {
        provider: aiConfig.provider
      };

      // Add provider-specific parameters
      if (aiConfig.provider === 'aws-bedrock') {
        requestBody.awsRegion = aiConfig.awsRegion;
        // Send credentials only if they are real values (not masked/stored); backend will use pass-resolved config when masked
        const mask = '********';
        requestBody.awsAccessKeyId = (typeof aiConfig.awsAccessKeyId === 'string' && aiConfig.awsAccessKeyId !== mask)
          ? aiConfig.awsAccessKeyId
          : (aiConfig.awsAccessKeyId?._pass ? mask : '');
        requestBody.awsSecretAccessKey = (typeof aiConfig.awsSecretAccessKey === 'string' && aiConfig.awsSecretAccessKey !== mask)
          ? aiConfig.awsSecretAccessKey
          : (aiConfig.awsSecretAccessKey?._pass ? mask : '');
        requestBody.bedrockModelId = aiConfig.bedrockModelId;
      } else {
        requestBody.url = aiConfig.url;
        requestBody.apiToken = aiConfig.apiToken || '';
      }

      const response = await axios.post('/api/ai/test-connection', 
        requestBody,
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
        provider: 'aws-bedrock',
        url: '',
        apiToken: '',
        model: 'mistral:7b',
        timeout: 120000,
        organizationName: '',
        extensiveLogging: false,
        allowedUsersForAI: '',
        awsRegion: 'us-east-1',
        awsAccessKeyId: '',
        awsSecretAccessKey: '',
        bedrockModelId: 'mistral.mistral-large-2402-v1:0'
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
          <p className="subtitle">Configure AI Engine for control implementation suggestions. Test connection uses values in this form; save when you want to persist.</p>
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
            <div className="form-row-two-cols">
              <div className="form-group">
                <label>
                  AI Provider *
                  <small>Select your AI service provider</small>
                </label>
                <select
                  className="form-control"
                  value={aiConfig.provider}
                  onChange={(e) => setAiConfig({ ...aiConfig, provider: e.target.value })}
                  disabled={isReadOnly}
                >
                  <option value="aws-bedrock">AWS Bedrock</option>
                  <option value="mistral-api">Mistral API (Cloud)</option>
                </select>
              </div>
              <div className="form-group">
                <label>
                  Extensive AI Debug logging
                  <small>When on, appends AI telemetry to the logs directory (e.g. logs/ai-telemetry-*.jsonl). Turn off to reduce disk use.</small>
                </label>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={!!aiConfig.extensiveLogging}
                    onChange={(e) => setAiConfig({ ...aiConfig, extensiveLogging: e.target.checked })}
                    disabled={isReadOnly}
                  />
                  <span className="toggle-slider"></span>
                  <span className="toggle-label">{aiConfig.extensiveLogging ? 'On' : 'Off'}</span>
                </label>
              </div>
            </div>

            {(aiConfig.provider === 'mistral-api' || aiConfig.provider === 'aws-bedrock') && (
              <div className="form-group">
                <label>
                  Allowed users for Get Suggestions (chargeable providers)
                  <small>e.g. *@adobe.com, mkesharw (max 5, comma-separated). If empty, all users are allowed.</small>
                </label>
                <input
                  type="text"
                  className="form-control"
                  value={aiConfig.allowedUsersForAI || ''}
                  onChange={(e) => setAiConfig({ ...aiConfig, allowedUsersForAI: e.target.value })}
                  placeholder="*@adobe.com, mkesharw"
                  disabled={isReadOnly}
                />
              </div>
            )}

            {/* Mistral API Configuration */}
            {aiConfig.provider === 'mistral-api' && (
              <>
                <div className="form-group">
                  <label>
                    Mistral API URL *
                    <small>Mistral API endpoint (default: https://api.mistral.ai/v1/chat/completions)</small>
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={aiConfig.url || 'https://api.mistral.ai/v1/chat/completions'}
                    onChange={(e) => setAiConfig({ ...aiConfig, url: e.target.value })}
                    placeholder="https://api.mistral.ai/v1/chat/completions"
                    disabled={isReadOnly}
                  />
                </div>
                <div className="form-group">
                  <label>
                    Mistral API Key *
                    <small>Your Mistral API key from console.mistral.ai</small>
                  </label>
                  <input
                    type="password"
                    className="form-control"
                    value={aiConfig.apiToken}
                    onChange={(e) => setAiConfig({ ...aiConfig, apiToken: e.target.value })}
                    placeholder="Enter your Mistral API key"
                    disabled={isReadOnly}
                  />
                </div>
              </>
            )}

            {/* AWS Bedrock Configuration */}
            {aiConfig.provider === 'aws-bedrock' && (
              <>
                <div className="form-group">
                  <label>
                    AWS Region *
                    <small>AWS region where Bedrock is available (e.g., us-east-1)</small>
                  </label>
                  <select
                    className="form-control"
                    value={aiConfig.awsRegion || 'us-east-1'}
                    onChange={(e) => setAiConfig({ ...aiConfig, awsRegion: e.target.value })}
                    disabled={isReadOnly}
                  >
                    <option value="us-east-1">US East (N. Virginia) - us-east-1</option>
                    <option value="us-west-2">US West (Oregon) - us-west-2</option>
                    <option value="us-gov-west-1">AWS GovCloud (US-West) - us-gov-west-1</option>
                    <option value="ca-central-1">Canada (Central) - ca-central-1</option>
                    <option value="eu-west-1">Europe (Ireland) - eu-west-1</option>
                    <option value="eu-west-2">Europe (London) - eu-west-2</option>
                    <option value="eu-west-3">Europe (Paris) - eu-west-3</option>
                    <option value="eu-central-1">Europe (Frankfurt) - eu-central-1</option>
                    <option value="ap-south-1">Asia Pacific (Mumbai) - ap-south-1</option>
                    <option value="ap-northeast-1">Asia Pacific (Tokyo) - ap-northeast-1</option>
                    <option value="ap-northeast-2">Asia Pacific (Seoul) - ap-northeast-2</option>
                    <option value="ap-southeast-1">Asia Pacific (Singapore) - ap-southeast-1</option>
                    <option value="ap-southeast-2">Asia Pacific (Sydney) - ap-southeast-2</option>
                    <option value="sa-east-1">South America (São Paulo) - sa-east-1</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>
                    AWS Access Key ID *
                    <small>Your AWS IAM access key with Bedrock permissions</small>
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={typeof aiConfig.awsAccessKeyId === 'string' ? aiConfig.awsAccessKeyId : (aiConfig.awsAccessKeyId?._pass ? '********' : '')}
                    onChange={(e) => setAiConfig({ ...aiConfig, awsAccessKeyId: e.target.value })}
                    placeholder={aiConfig.awsAccessKeyId?._pass ? '' : 'AKIAIOSFODNN7EXAMPLE'}
                    disabled={isReadOnly}
                  />
                  {(typeof aiConfig.awsAccessKeyId === 'string' && aiConfig.awsAccessKeyId === '********') || aiConfig.awsAccessKeyId?._pass ? (
                    <small className="form-text text-muted">Stored in pass vault</small>
                  ) : null}
                </div>
                <div className="form-group">
                  <label>
                    AWS Secret Access Key *
                    <small>Your AWS IAM secret key (stored securely)</small>
                  </label>
                  <input
                    type="password"
                    className="form-control"
                    value={typeof aiConfig.awsSecretAccessKey === 'string' ? aiConfig.awsSecretAccessKey : (aiConfig.awsSecretAccessKey?._pass ? '********' : '')}
                    onChange={(e) => setAiConfig({ ...aiConfig, awsSecretAccessKey: e.target.value })}
                    placeholder={aiConfig.awsSecretAccessKey?._pass ? '' : 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'}
                    disabled={isReadOnly}
                  />
                  {(typeof aiConfig.awsSecretAccessKey === 'string' && aiConfig.awsSecretAccessKey === '********') || aiConfig.awsSecretAccessKey?._pass ? (
                    <small className="form-text text-muted">Stored in pass vault</small>
                  ) : null}
                </div>
                <div className="form-group">
                  <label>
                    Bedrock Model ID *
                    <small>Mistral, Gemma, and GPT models in this region (see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/models-regions.html" target="_blank" rel="noopener noreferrer">models by region</a>)</small>
                  </label>
                  <select
                    className="form-control"
                    value={aiConfig.bedrockModelId || 'mistral.mistral-large-2402-v1:0'}
                    onChange={(e) => setAiConfig({ ...aiConfig, bedrockModelId: e.target.value })}
                    disabled={isReadOnly || bedrockModelsLoading}
                  >
                    {bedrockModelsLoading && (
                      <option value={aiConfig.bedrockModelId || 'mistral.mistral-large-2402-v1:0'}>Loading models…</option>
                    )}
                    {!bedrockModelsLoading && bedrockModelsError && bedrockModels.length === 0 && (
                      <option value={aiConfig.bedrockModelId || 'mistral.mistral-large-2402-v1:0'}>
                        {aiConfig.bedrockModelId || 'mistral.mistral-large-2402-v1:0'}
                      </option>
                    )}
                    {!bedrockModelsLoading && bedrockModels.map((m) => (
                      <option key={m.modelId} value={m.modelId}>
                        {m.modelName ? `${m.modelName} (${m.modelId})` : m.modelId}
                      </option>
                    ))}
                    {!bedrockModelsLoading && bedrockModels.length > 0 && (() => {
                      const current = aiConfig.bedrockModelId || 'mistral.mistral-large-2402-v1:0';
                      const inList = bedrockModels.some((m) => m.modelId === current);
                      return !inList && current ? (
                        <option key="_current" value={current}>
                          {current} (current / not in list)
                        </option>
                      ) : null;
                    })()}
                  </select>
                  {bedrockModelsError && (
                    <small className="form-text text-warning">{bedrockModelsError}</small>
                  )}
                  {!bedrockModelsLoading && !bedrockModelsError && bedrockModels.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary mt-1"
                      onClick={() => fetchBedrockModels(aiConfig.awsRegion || 'us-east-1')}
                      disabled={isReadOnly}
                    >
                      Refresh models
                    </button>
                  )}
                </div>
              </>
            )}

            {/* Model Name - For Mistral API */}
            {aiConfig.provider !== 'aws-bedrock' && (
              <div className="form-group">
                <label>
                  Model Name *
                  <small>Model name for Mistral API (e.g., mistral-7b-instruct)</small>
                </label>
                {availableModels.length > 0 ? (
                  <select
                    className="form-control"
                    value={aiConfig.model}
                    onChange={handleModelChange}
                    disabled={isReadOnly}
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
                    placeholder="mistral-7b-instruct"
                    disabled={isReadOnly}
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
            )}

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
                disabled={isReadOnly}
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
                disabled={
                  testing ||
                  isReadOnly ||
                  (aiConfig.provider === 'aws-bedrock'
                    ? (!aiConfig.awsRegion || !(
                        (typeof aiConfig.awsAccessKeyId === 'string' && aiConfig.awsAccessKeyId.trim()) ||
                        (aiConfig.awsAccessKeyId?._pass)
                      ) || !(
                        (typeof aiConfig.awsSecretAccessKey === 'string' && aiConfig.awsSecretAccessKey.trim()) ||
                        (aiConfig.awsSecretAccessKey?._pass)
                      ))
                    : !aiConfig.url?.trim())
                }
              >
                {testing ? '⏳ Testing...' : '🔍 Test Connection'}
              </button>
              <button 
                className="btn-danger" 
                onClick={handleClear}
                disabled={
                  isReadOnly ||
                  (aiConfig.provider === 'aws-bedrock'
                    ? (!aiConfig.awsRegion && !(
                        (typeof aiConfig.awsAccessKeyId === 'string' && aiConfig.awsAccessKeyId.trim()) ||
                        aiConfig.awsAccessKeyId?._pass
                      ) && !(
                        (typeof aiConfig.awsSecretAccessKey === 'string' && aiConfig.awsSecretAccessKey.trim()) ||
                        aiConfig.awsSecretAccessKey?._pass
                      ))
                    : !aiConfig.url)
                }
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
              {aiConfig.provider === 'mistral-api' && (
                <>
                  <p>Configure Mistral AI API (cloud) to enable AI-powered control implementation suggestions.</p>
                  <ul>
                    <li>✅ Get your API key from <a href="https://console.mistral.ai" target="_blank" rel="noopener noreferrer">console.mistral.ai</a></li>
                    <li>✅ Enter the API endpoint URL (default is pre-filled)</li>
                    <li>✅ Enter your Mistral API key</li>
                    <li>✅ The application will use Mistral's cloud service for suggestions</li>
                    <li>⚠️ API usage charges may apply - check Mistral's pricing</li>
                  </ul>
                </>
              )}
              {aiConfig.provider === 'aws-bedrock' && (
                <>
                  <p>Configure AWS Bedrock to enable AI-powered control implementation suggestions using Mistral and other models.</p>
                  <ul>
                    <li>✅ AWS Bedrock provides managed access to Mistral, Claude, and Llama models</li>
                    <li>✅ Create IAM user with <code>bedrock:InvokeModel</code> permission</li>
                    <li>✅ Select the AWS region where Bedrock is available</li>
                    <li>✅ Enter AWS credentials (Access Key ID and Secret Access Key)</li>
                    <li>✅ Choose from available models (Mistral Large recommended)</li>
                    <li>📚 See <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-runtime_example_bedrock-runtime_Converse_Mistral_section.html" target="_blank" rel="noopener noreferrer">AWS Bedrock Documentation</a></li>
                    <li>⚠️ AWS charges apply based on model usage - check AWS Bedrock pricing</li>
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="ai-section">
          <div className="save-section">
            <button 
              className="btn-primary btn-large" 
              onClick={handleSave}
              disabled={saving || testing || isReadOnly}
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

