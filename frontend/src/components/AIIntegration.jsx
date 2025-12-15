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
    provider: 'ollama', // 'ollama', 'mistral-api', or 'aws-bedrock'
    url: '',
    apiToken: '',
    model: 'mistral:7b',
    timeout: 120000,
    organizationName: '',
    // AWS Bedrock specific
    awsRegion: 'us-east-1',
    awsAccessKeyId: '',
    awsSecretAccessKey: '',
    bedrockModelId: 'mistral.mistral-large-2402-v1:0'
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
        provider: 'ollama',
        url: '',
        apiToken: '',
        model: 'mistral:7b',
        timeout: 120000,
        organizationName: '',
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
      
      // Default provider to ollama if not set
      if (!config.provider) {
        config.provider = 'ollama';
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

      // Validate based on provider
      if (aiConfig.enabled) {
        if (aiConfig.provider === 'aws-bedrock') {
          // AWS Bedrock validation
          if (!aiConfig.awsRegion || !aiConfig.awsRegion.trim()) {
            throw new Error('AWS region is required for AWS Bedrock');
          }
          if (!aiConfig.awsAccessKeyId || !aiConfig.awsAccessKeyId.trim()) {
            throw new Error('AWS Access Key ID is required for AWS Bedrock');
          }
          if (!aiConfig.awsSecretAccessKey || !aiConfig.awsSecretAccessKey.trim()) {
            throw new Error('AWS Secret Access Key is required for AWS Bedrock');
          }
          if (!aiConfig.bedrockModelId || !aiConfig.bedrockModelId.trim()) {
            throw new Error('Bedrock Model ID is required for AWS Bedrock');
          }
        } else {
          // Ollama or Mistral API validation
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
    if (!aiConfig.enabled) {
      setTestResult({
        success: false,
        message: 'Please enable AI integration before testing'
      });
      return;
    }

    // Validate based on provider
    if (aiConfig.provider === 'aws-bedrock') {
      if (!aiConfig.awsRegion || !aiConfig.awsAccessKeyId || !aiConfig.awsSecretAccessKey) {
        setTestResult({
          success: false,
          message: 'Please configure AWS region and credentials before testing'
        });
        return;
      }
    } else {
      if (!aiConfig.url) {
        setTestResult({
          success: false,
          message: 'Please configure AI Engine URL before testing'
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
        requestBody.awsAccessKeyId = aiConfig.awsAccessKeyId;
        requestBody.awsSecretAccessKey = aiConfig.awsSecretAccessKey;
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
        provider: 'ollama',
        url: '',
        apiToken: '',
        model: 'mistral:7b',
        timeout: 120000,
        organizationName: '',
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
                AI Provider *
                <small>Select your AI service provider</small>
              </label>
              <select
                className="form-control"
                value={aiConfig.provider}
                onChange={(e) => setAiConfig({ ...aiConfig, provider: e.target.value })}
                disabled={!aiConfig.enabled || isReadOnly}
              >
                <option value="ollama">Ollama (Local/Self-hosted)</option>
                <option value="mistral-api">Mistral API (Cloud)</option>
                <option value="aws-bedrock">AWS Bedrock</option>
              </select>
            </div>

            {/* Ollama Configuration */}
            {aiConfig.provider === 'ollama' && (
              <>
                <div className="form-group">
                  <label>
                    AI Engine URL *
                    <small>Full URL of your Ollama instance (e.g., http://192.168.1.200:11434)</small>
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
                    <small>API token for authentication (not needed for internal Ollama instances)</small>
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
              </>
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
                    disabled={!aiConfig.enabled || isReadOnly}
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
                    disabled={!aiConfig.enabled || isReadOnly}
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
                    disabled={!aiConfig.enabled || isReadOnly}
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
                    value={aiConfig.awsAccessKeyId || ''}
                    onChange={(e) => setAiConfig({ ...aiConfig, awsAccessKeyId: e.target.value })}
                    placeholder="AKIAIOSFODNN7EXAMPLE"
                    disabled={!aiConfig.enabled || isReadOnly}
                  />
                </div>
                <div className="form-group">
                  <label>
                    AWS Secret Access Key *
                    <small>Your AWS IAM secret key (stored securely)</small>
                  </label>
                  <input
                    type="password"
                    className="form-control"
                    value={aiConfig.awsSecretAccessKey || ''}
                    onChange={(e) => setAiConfig({ ...aiConfig, awsSecretAccessKey: e.target.value })}
                    placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
                    disabled={!aiConfig.enabled || isReadOnly}
                  />
                </div>
                <div className="form-group">
                  <label>
                    Bedrock Model ID *
                    <small>Model identifier from AWS Bedrock (see <a href="https://docs.aws.amazon.com/bedrock/" target="_blank" rel="noopener noreferrer">AWS Bedrock docs</a>)</small>
                  </label>
                  <select
                    className="form-control"
                    value={aiConfig.bedrockModelId || 'mistral.mistral-large-2402-v1:0'}
                    onChange={(e) => setAiConfig({ ...aiConfig, bedrockModelId: e.target.value })}
                    disabled={!aiConfig.enabled || isReadOnly}
                  >
                    <option value="mistral.mistral-large-2402-v1:0">Mistral Large (mistral.mistral-large-2402-v1:0)</option>
                    <option value="mistral.mistral-7b-instruct-v0:2">Mistral 7B Instruct (mistral.mistral-7b-instruct-v0:2)</option>
                    <option value="mistral.mixtral-8x7b-instruct-v0:1">Mixtral 8x7B (mistral.mixtral-8x7b-instruct-v0:1)</option>
                    <option value="anthropic.claude-3-sonnet-20240229-v1:0">Claude 3 Sonnet</option>
                    <option value="anthropic.claude-3-haiku-20240307-v1:0">Claude 3 Haiku</option>
                    <option value="meta.llama3-70b-instruct-v1:0">Llama 3 70B</option>
                  </select>
                </div>
              </>
            )}

            {/* Model Name - Only for Ollama and Mistral API */}
            {aiConfig.provider !== 'aws-bedrock' && (
              <div className="form-group">
                <label>
                  Model Name *
                  <small>
                    {aiConfig.provider === 'ollama' 
                      ? 'Select a model from available models (test connection first to see available models)' 
                      : 'Model name for Mistral API (e.g., mistral-7b-instruct)'}
                  </small>
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
                    placeholder={aiConfig.provider === 'ollama' ? 'mistral:7b (test connection to see available models)' : 'mistral-7b-instruct'}
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
                disabled={
                  !aiConfig.enabled || 
                  testing || 
                  isReadOnly ||
                  (aiConfig.provider === 'aws-bedrock' 
                    ? (!aiConfig.awsRegion || !aiConfig.awsAccessKeyId || !aiConfig.awsSecretAccessKey)
                    : !aiConfig.url)
                }
              >
                {testing ? '⏳ Testing...' : (aiConfig.provider === 'ollama' ? '🔍 Test Connection & Fetch Models' : '🔍 Test Connection')}
              </button>
              <button 
                className="btn-danger" 
                onClick={handleClear}
                disabled={
                  isReadOnly ||
                  (aiConfig.provider === 'aws-bedrock' 
                    ? (!aiConfig.awsRegion && !aiConfig.awsAccessKeyId && !aiConfig.awsSecretAccessKey)
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
              {aiConfig.provider === 'ollama' && (
                <>
                  <p>Configure your Ollama instance (local or self-hosted) to enable AI-powered control implementation suggestions.</p>
                  <ul>
                    <li>✅ Enter the full URL where your Ollama instance is running (include protocol and port)</li>
                    <li>✅ API token is optional for internal Ollama instances</li>
                    <li>✅ Click "Test Connection & Fetch Models" to see available models</li>
                    <li>✅ Mistral model will be automatically selected if available</li>
                    <li>✅ Ollama must be set up separately with <code>ollama pull mistral:7b</code></li>
                  </ul>
                </>
              )}
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

