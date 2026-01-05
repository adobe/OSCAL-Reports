/**
 * Settings Component - Configure API Gateway endpoints
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license GPL-3.0-or-later
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import './Settings.css';

function Settings() {
  const { canEditSettings, getAuthConfig } = useAuth();
  const [gateways, setGateways] = useState({
    aws: {
      enabled: false,
      url: '',
      region: 'ap-southeast-2'
    },
    azure: {
      enabled: false,
      url: ''
    }
  });
  const [publishedSoaUrl, setPublishedSoaUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationMessage, setVerificationMessage] = useState('');
  
  const isReadOnly = !canEditSettings();

  // Load settings from server on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const response = await axios.get('/api/settings');
      const config = response.data;
      
      if (config.apiGateways) {
        setGateways(config.apiGateways);
      }
      
      // Always set publishedSoaUrl, even if empty string
      setPublishedSoaUrl(config.publishedSoaUrl || '');
      
      console.log('✅ Settings loaded from server');
    } catch (error) {
      console.error('Error loading settings from server:', error);
      setSaveMessage('⚠️ Could not load settings from server. Using defaults.');
      setTimeout(() => setSaveMessage(''), 3000);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGatewayChange = (provider, field, value) => {
    setGateways(prev => ({
      ...prev,
      [provider]: {
        ...prev[provider],
        [field]: value
      }
    }));
  };

  const handleSave = async () => {
    if (isReadOnly) {
      setSaveMessage('⚠️ You do not have permission to edit settings. Only Platform Admins can make changes.');
      setTimeout(() => setSaveMessage(''), 4000);
      return;
    }
    
    setIsSaving(true);
    setSaveMessage('');

    try {
      // Validate URLs if enabled (client-side validation before sending)
      if (gateways.aws.enabled && gateways.aws.url) {
        try {
          new URL(gateways.aws.url);
        } catch (e) {
          throw new Error('Invalid AWS API Gateway URL');
        }
      }

      if (gateways.azure.enabled && gateways.azure.url) {
        try {
          new URL(gateways.azure.url);
        } catch (e) {
          throw new Error('Invalid Azure API Gateway URL');
        }
      }

      // Validate Published SOA/CCM URL
      if (publishedSoaUrl && publishedSoaUrl.trim() !== '') {
        try {
          new URL(publishedSoaUrl);
        } catch (e) {
          throw new Error('Invalid Published SOA/CCM URL');
        }
      }
      
      // Save to server
      // Always include publishedSoaUrl, even if empty string
      // Trim whitespace from URL
      const trimmedUrl = publishedSoaUrl ? publishedSoaUrl.trim() : '';
      
      const config = {
        apiGateways: gateways,
        publishedSoaUrl: trimmedUrl // Ensure it's always included (even if empty)
      };
      
      console.log('💾 Saving settings - publishedSoaUrl:', config.publishedSoaUrl);
      console.log('💾 Full config being sent:', JSON.stringify(config, null, 2));
      
      const response = await axios.post('/api/settings', config, getAuthConfig());
      
      console.log('✅ Save response:', response.data);
      console.log('✅ Saved config from server:', response.data.config);
      
      if (response.data.success) {
        // Dispatch event to notify other components
        window.dispatchEvent(new Event('gatewaysUpdated'));
        
        // Reload settings from server to ensure UI is in sync
        await loadSettings();
        
        setSaveMessage('✅ Settings saved successfully on server!');
        setTimeout(() => setSaveMessage(''), 3000);
      } else {
        throw new Error(response.data.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setSaveMessage(`❌ Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = (provider) => {
    if (confirm(`Clear ${provider.toUpperCase()} API Gateway configuration?`)) {
      setGateways(prev => ({
        ...prev,
        [provider]: provider === 'aws' 
          ? { enabled: false, url: '', region: 'ap-southeast-2' }
          : { enabled: false, url: '' }
      }));
    }
  };

  const handleVerifyPublishedUrl = async () => {
    if (!publishedSoaUrl || publishedSoaUrl.trim() === '') {
      setVerificationMessage('❌ Please enter a URL to verify');
      setTimeout(() => setVerificationMessage(''), 3000);
      return;
    }

    setIsVerifying(true);
    setVerificationMessage('🔄 Verifying URL...');

    try {
      // Validate URL format
      let urlToTest;
      try {
        urlToTest = new URL(publishedSoaUrl);
      } catch (e) {
        throw new Error('Invalid URL format');
      }

      // Use the proxy endpoint to fetch the URL
      const response = await axios.post('/api/proxy-fetch', {
        url: publishedSoaUrl
      });

      console.log('🔍 Proxy response:', response);
      console.log('🔍 Response data keys:', response.data ? Object.keys(response.data) : 'No data');

      if (response.data) {
        let data = response.data;
        
        // The proxy endpoint wraps the response: { success, status, statusText, data: actualContent, headers }
        // Check if this is a proxy wrapper by looking for these specific keys
        const hasProxyWrapper = data.success !== undefined && 
                                data.status !== undefined && 
                                data.data !== undefined;
        
        if (hasProxyWrapper) {
          console.log('🔍 Detected proxy wrapper, unwrapping nested data property');
          console.log('🔍 Proxy wrapper keys:', Object.keys(data));
          console.log('🔍 Nested data type:', typeof data.data);
          data = data.data;
        }
        
        console.log('🔍 Final data keys:', data ? Object.keys(data) : 'No data after unwrap');
        console.log('🔍 Final data type:', typeof data);
        console.log('🔍 Has system-security-plan:', data && !!data['system-security-plan']);
        
        // Check if it's a valid OSCAL SSP structure
        if (data && data['system-security-plan']) {
          const ssp = data['system-security-plan'];
          const metadata = ssp.metadata || {};
          const title = metadata.title || 'Untitled';
          const version = metadata.version || 'N/A';
          const oscalVersion = metadata['oscal-version'] || 'N/A';
          const systemName = ssp['system-characteristics']?.['system-name'] || 'N/A';
          
          console.log('✅ Valid OSCAL SSP found:', { title, version, oscalVersion, systemName });
          setVerificationMessage(`✅ Valid OSCAL report found!\nTitle: ${title}\nSystem: ${systemName}\nVersion: ${version}\nOSCAL: ${oscalVersion}`);
        } else {
          console.warn('⚠️ No system-security-plan found in data');
          console.log('Available keys:', data ? Object.keys(data) : 'No data');
          setVerificationMessage(`⚠️ URL is accessible but does not contain a valid OSCAL System Security Plan structure\n\nFound keys: ${data ? Object.keys(data).join(', ') : 'No data'}`);
        }
      } else {
        throw new Error('No data received from URL');
      }
    } catch (error) {
      console.error('URL verification failed:', error);
      let errorMessage = '❌ Verification failed: ';
      
      if (error.response) {
        errorMessage += error.response.data?.error || error.response.statusText || 'Server error';
      } else if (error.message) {
        errorMessage += error.message;
      } else {
        errorMessage += 'Unknown error';
      }
      
      setVerificationMessage(errorMessage);
    } finally {
      setIsVerifying(false);
      setTimeout(() => setVerificationMessage(''), 8000); // Clear message after 8 seconds
    }
  };

  const handleTestConnection = async (provider) => {
    const gateway = gateways[provider];
    if (!gateway.enabled || !gateway.url) {
      alert(`Please enable and configure ${provider.toUpperCase()} API Gateway first`);
      return;
    }

    try {
      setSaveMessage(`🔄 Testing ${provider.toUpperCase()} connection...`);
      const response = await fetch('/api/proxy-fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: gateway.url,
          method: 'GET'
        })
      });

      const result = await response.json();
      if (result.success) {
        setSaveMessage(`✅ ${provider.toUpperCase()} connection successful!`);
      } else {
        setSaveMessage(`❌ ${provider.toUpperCase()} connection failed: ${result.error}`);
      }
      setTimeout(() => setSaveMessage(''), 5000);
    } catch (error) {
      setSaveMessage(`❌ Error testing connection: ${error.message}`);
      setTimeout(() => setSaveMessage(''), 5000);
    }
  };

  if (isLoading) {
    return (
      <div className="settings-container">
        <div className="settings-header">
          <h2>⚙️ Platform Settings</h2>
          <p className="settings-subtitle">Loading settings from server...</p>
          <p className="settings-subtitle" style={{ fontSize: '0.85rem', color: '#d97706', marginTop: '0.5rem', fontWeight: '500' }}>
            🔒 <strong>Administrator Access Only:</strong> This page can only be modified by the platform Administrator
          </p>
        </div>
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <div className="spinner">⏳ Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-container">
      <div className="settings-header">
        <h2>⚙️ Platform Settings</h2>
        <p className="settings-subtitle">Configure AWS and Azure API Gateway endpoints for automated control monitoring</p>
        <p className="settings-subtitle" style={{ fontSize: '0.85rem', color: '#718096', marginTop: '0.5rem' }}>
          💾 <strong>Server-side storage:</strong> Settings are saved on the server and persist across deployments
        </p>
        <p className="settings-subtitle" style={{ fontSize: '0.85rem', color: '#d97706', marginTop: '0.5rem', fontWeight: '500' }}>
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

      {saveMessage && (
        <div className={`save-message ${saveMessage.includes('✅') ? 'success' : saveMessage.includes('🔄') ? 'info' : 'error'}`}>
          {saveMessage}
        </div>
      )}

      <div className="settings-content">
        {/* AWS API Gateway */}
        <div className="settings-section">
          <div className="section-header">
            <div className="section-title">
              <h3>☁️ AWS API Gateway</h3>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={gateways.aws.enabled}
                  onChange={(e) => handleGatewayChange('aws', 'enabled', e.target.checked)}
                  disabled={isReadOnly}
                />
                <span className="toggle-slider"></span>
                <span className="toggle-label">{gateways.aws.enabled ? 'Enabled' : 'Disabled'}</span>
              </label>
            </div>
          </div>

          <div className="gateway-form">
            <div className="form-group">
              <label>
                API Gateway URL *
                <small>The base URL of your AWS API Gateway</small>
              </label>
              <input
                type="url"
                className="form-control"
                value={gateways.aws.url}
                onChange={(e) => handleGatewayChange('aws', 'url', e.target.value)}
                placeholder="https://api.execute-api.ap-southeast-2.amazonaws.com/prod"
                disabled={!gateways.aws.enabled || isReadOnly}
              />
            </div>

            <div className="form-group">
              <label>
                AWS Region
                <small>Select your AWS region</small>
              </label>
              <select
                className="form-control"
                value={gateways.aws.region}
                onChange={(e) => handleGatewayChange('aws', 'region', e.target.value)}
                disabled={!gateways.aws.enabled || isReadOnly}
              >
                <option value="us-east-1">US East (N. Virginia)</option>
                <option value="us-west-2">US West (Oregon)</option>
                <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
                <option value="ap-southeast-2">Asia Pacific (Sydney)</option>
                <option value="eu-west-1">Europe (Ireland)</option>
                <option value="eu-central-1">Europe (Frankfurt)</option>
              </select>
            </div>

            <div className="form-actions">
              <button 
                className="btn-primary" 
                onClick={() => handleTestConnection('aws')}
                disabled={!gateways.aws.enabled || !gateways.aws.url || isReadOnly}
              >
                🔍 Test Connection
              </button>
              <button 
                className="btn-danger" 
                onClick={() => handleClear('aws')}
                disabled={!gateways.aws.url || isReadOnly}
              >
                🗑️ Clear
              </button>
            </div>

            <div className="info-box">
              <strong>ℹ️ How it works:</strong>
              <p>When you configure an AWS API Gateway here, the application will route API calls through your gateway. Authentication is handled by the gateway using IAM, Cognito, or API keys configured on AWS.</p>
              <p><strong>No credentials are stored in this application.</strong></p>
            </div>
          </div>
        </div>

        {/* Azure API Gateway */}
        <div className="settings-section">
          <div className="section-header">
            <div className="section-title">
              <h3>🔷 Azure API Gateway</h3>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={gateways.azure.enabled}
                  onChange={(e) => handleGatewayChange('azure', 'enabled', e.target.checked)}
                  disabled={isReadOnly}
                />
                <span className="toggle-slider"></span>
                <span className="toggle-label">{gateways.azure.enabled ? 'Enabled' : 'Disabled'}</span>
              </label>
            </div>
          </div>

          <div className="gateway-form">
            <div className="form-group">
              <label>
                API Gateway URL *
                <small>The base URL of your Azure API Management Gateway</small>
              </label>
              <input
                type="url"
                className="form-control"
                value={gateways.azure.url}
                onChange={(e) => handleGatewayChange('azure', 'url', e.target.value)}
                placeholder="https://your-api.azure-api.net"
                disabled={!gateways.azure.enabled || isReadOnly}
              />
            </div>

            <div className="form-actions">
              <button 
                className="btn-primary" 
                onClick={() => handleTestConnection('azure')}
                disabled={!gateways.azure.enabled || !gateways.azure.url || isReadOnly}
              >
                🔍 Test Connection
              </button>
              <button 
                className="btn-danger" 
                onClick={() => handleClear('azure')}
                disabled={!gateways.azure.url || isReadOnly}
              >
                🗑️ Clear
              </button>
            </div>

            <div className="info-box">
              <strong>ℹ️ How it works:</strong>
              <p>When you configure an Azure API Gateway here, the application will route API calls through your gateway. Authentication is handled by the gateway using Azure AD, subscription keys, or OAuth2 configured on Azure.</p>
              <p><strong>No credentials are stored in this application.</strong></p>
            </div>
          </div>
        </div>

        {/* Published SOA/CCM URL */}
        <div className="settings-section">
          <div className="section-header">
            <div className="section-title">
              <h3>📄 Published SOA/CCM URL</h3>
              <small>URL to existing published SOA/CCM report for comparison</small>
            </div>
          </div>

          <div className="gateway-form">
            <div className="form-group">
              <label>
                Published Report URL (Optional)
                <small>URL to JSON file of existing published SOA/CCM for multi-report comparison</small>
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <input
                  type="url"
                  className="form-control"
                  value={publishedSoaUrl}
                  onChange={(e) => setPublishedSoaUrl(e.target.value)}
                  placeholder="https://example.com/published-soa-ccm.json"
                  style={{ flex: 1 }}
                  disabled={isReadOnly}
                />
                <button
                  type="button"
                  className="btn-verify"
                  onClick={handleVerifyPublishedUrl}
                  disabled={isVerifying || !publishedSoaUrl || isReadOnly}
                  title="Verify URL accessibility and validate OSCAL structure"
                >
                  {isVerifying ? '⏳ Verifying...' : '🔍 Verify URL'}
                </button>
              </div>
              {verificationMessage && (
                <div className={`verification-message ${verificationMessage.includes('✅') ? 'success' : verificationMessage.includes('⚠️') ? 'warning' : verificationMessage.includes('🔄') ? 'info' : 'error'}`}>
                  {verificationMessage.split('\n').map((line, idx) => (
                    <div key={idx}>{line}</div>
                  ))}
                </div>
              )}
            </div>

            <div className="info-box">
              <strong>ℹ️ How it works:</strong>
              <p>This URL points to your organization's published SOA/CCM OSCAL JSON file. When using the Multi-Report Comparison feature, the application can automatically fetch this report as the baseline for comparison with Cloud Service Provider (CSP) reports.</p>
              <ul>
                <li>✅ Compare your report with IaaS, PaaS, or SaaS provider reports</li>
                <li>✅ Identify control differences across platforms</li>
                <li>✅ Track catalog version changes</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="settings-section">
          <div className="save-section">
            <button 
              className="btn-primary btn-large" 
              onClick={handleSave}
              disabled={isSaving || isReadOnly}
            >
              {isSaving ? '⏳ Saving...' : (isReadOnly ? '🔒 Read-Only (Admin Access Required)' : '💾 Save Settings')}
            </button>
          </div>
        </div>

        {/* Instructions */}
        <div className="settings-section">
          <h3>📖 How to Use API Gateway</h3>
          <div className="info-box">
            <h4>1. Configure Your API Gateway</h4>
            <p>Set up AWS API Gateway or Azure API Management with appropriate authentication (IAM, Cognito, Azure AD, API keys, etc.)</p>

            <h4>2. Enable and Enter Gateway URL</h4>
            <p>Toggle on the provider you want to use and enter your API Gateway base URL above</p>

            <h4>3. Use in Controls</h4>
            <p>When adding API URLs to controls, the system will automatically route requests through your configured gateway</p>

            <h4>Benefits:</h4>
            <ul>
              <li>✅ No credentials stored in the application</li>
              <li>✅ Authentication managed by cloud provider</li>
              <li>✅ Centralized access control and logging</li>
              <li>✅ Supports IAM roles, OAuth2, API keys</li>
              <li>✅ Automatic credential rotation</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;

