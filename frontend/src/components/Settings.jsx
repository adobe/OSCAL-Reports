/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import React, { useState, useEffect } from 'react';
import axios from '../utils/safeAxios.js';
import { useAuth } from '../contexts/AuthContext';
import './Settings.css';

function Settings() {
  const { canEditSettings, getAuthConfig, logout } = useAuth();
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
  const [isSaving, setIsSaving] = useState(false);
  const [isTestingGateway, setIsTestingGateway] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [saveMessage, setSaveMessage] = useState('');
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);
  
  const isReadOnly = !canEditSettings();

  // Load settings from server on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const settingsRes = await axios.get('/api/settings');
      const config = settingsRes.data;

      if (config.apiGateways) {
        setGateways(config.apiGateways);
      }

      if (config.lastModified) {
        setLastSaved(config.lastModified);
      }
      
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

      const config = {
        apiGateways: gateways,
      };
      
      console.log('💾 Saving settings - apiGateways only');
      console.log('💾 Full config being sent:', JSON.stringify(config, null, 2));
      
      const response = await axios.post('/api/settings', config, getAuthConfig());
      
      console.log('✅ Save response:', response.data);
      console.log('✅ Saved config from server:', response.data.config);
      
      if (response.data.success) {
        // Handle verification status
        const verification = response.data.verification;
        if (verification) {
          setVerificationStatus({
            verified: verification.verified,
            timestamp: verification.timestamp,
            configPath: verification.configPath,
            discrepancies: verification.discrepancies,
            warning: verification.warning
          });
          setLastSaved(verification.timestamp);
          
          if (verification.verified) {
            setSaveMessage('✅ Settings saved and verified on disk');
          } else {
            setSaveMessage('⚠️ Settings saved but verification found issues - please re-save');
            console.warn('Verification discrepancies:', verification.discrepancies);
          }
        } else {
          setSaveMessage('✅ Settings saved successfully on server!');
        }
        
        // Dispatch event to notify other components
        window.dispatchEvent(new Event('gatewaysUpdated'));
        
        // Reload settings from server to ensure UI is in sync
        await loadSettings();
        
        setTimeout(() => {
          setSaveMessage('');
          setVerificationStatus(null);
        }, 8000);
      } else {
        throw new Error(response.data.error || 'Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      if (error.response?.status === 401) {
        setSaveMessage('❌ Your session has expired or you are not logged in. Logging out…');
        logout();
      } else {
        setSaveMessage(`❌ Error: ${error.response?.data?.error || error.message}`);
      }
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

  const handleTestConnection = async (provider) => {
    const gateway = gateways[provider];
    const url = (gateway.url || '').trim();
    if (!url) {
      setSaveMessage(`⚠️ Enter an API Gateway URL to test (nothing is saved until you click Save Settings).`);
      setTimeout(() => setSaveMessage(''), 6000);
      return;
    }
    try {
      // eslint-disable-next-line no-new
      new URL(url);
    } catch {
      setSaveMessage(`❌ Invalid URL for ${provider.toUpperCase()} gateway`);
      setTimeout(() => setSaveMessage(''), 6000);
      return;
    }

    try {
      setIsTestingGateway(true);
      setSaveMessage(`🔄 Testing ${provider.toUpperCase()} connection using the URL in this form…`);
      const response = await fetch('/api/proxy-fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          method: 'GET'
        })
      });

      const result = await response.json();
      if (result.success) {
        setSaveMessage(
          gateway.enabled
            ? `✅ ${provider.toUpperCase()} connection successful. You can Save Settings to persist this URL.`
            : `✅ ${provider.toUpperCase()} connection successful. Enable the gateway and Save when you want to use it in production.`
        );
      } else {
        setSaveMessage(`❌ ${provider.toUpperCase()} connection failed: ${result.error}`);
      }
      setTimeout(() => setSaveMessage(''), 8000);
    } catch (error) {
      setSaveMessage(`❌ Error testing connection: ${error.message}`);
      setTimeout(() => setSaveMessage(''), 8000);
    } finally {
      setIsTestingGateway(false);
    }
  };

  if (isLoading) {
    return (
      <div className="settings-container">
        <div className="settings-header">
          <h2>🌐 API Gateways and Information Catalogue Store</h2>
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
        <h2>🌐 API Gateways and Information Catalogue Store</h2>
        <p className="settings-subtitle">Configure AWS and Azure API Gateway endpoints for automated control monitoring. Use <strong>Test Connection</strong> with the URL in the form (no save required); save when you want to persist settings.</p>
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

      {/* Config Verification Status */}
      {verificationStatus && (
        <div className={`verification-status ${verificationStatus.verified ? 'verified' : 'warning'}`}>
          <div className="verification-header">
            {verificationStatus.verified ? (
              <>
                <span className="verification-icon">✅</span>
                <strong>Disk Verification Passed</strong>
              </>
            ) : (
              <>
                <span className="verification-icon">⚠️</span>
                <strong>Disk Verification Warning</strong>
              </>
            )}
          </div>
          <div className="verification-details">
            <div>Saved at: {new Date(verificationStatus.timestamp).toLocaleString()}</div>
            <div>Location: {verificationStatus.configPath}</div>
            {verificationStatus.discrepancies && (
              <div className="verification-warning">
                Issues found: {verificationStatus.discrepancies.join(', ')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Last Saved Indicator */}
      {lastSaved && !verificationStatus && (
        <div className="last-saved-indicator">
          <span className="last-saved-icon">💾</span>
          <span>Last saved: {new Date(lastSaved).toLocaleString()}</span>
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
                disabled={isReadOnly}
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
                disabled={isReadOnly}
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
                disabled={!gateways.aws.url?.trim() || isReadOnly || isTestingGateway}
              >
                {isTestingGateway ? '⏳ Testing…' : '🔍 Test Connection'}
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
                disabled={isReadOnly}
              />
            </div>

            <div className="form-actions">
              <button 
                className="btn-primary" 
                onClick={() => handleTestConnection('azure')}
                disabled={!gateways.azure.url?.trim() || isReadOnly || isTestingGateway}
              >
                {isTestingGateway ? '⏳ Testing…' : '🔍 Test Connection'}
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

        {/* Save Button */}
        <div className="settings-section">
          <div className="save-section">
            <button 
              className="btn-primary btn-large" 
              onClick={handleSave}
              disabled={isSaving || isTestingGateway || isReadOnly}
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

            <h4>2. Enter and test your gateway URL</h4>
            <p>Enter the API Gateway base URL and use Test Connection (no save required). Toggle the provider on and save when you want production routing to use that gateway.</p>

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

