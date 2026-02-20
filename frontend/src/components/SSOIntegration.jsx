/**
 * SSO Integration Component - Configure SAML and OAuth providers
 * Platform Admin only
 */

import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import './SSOIntegration.css';

// Use relative URLs for production compatibility

function SSOIntegration({ onClose, embedded = false }) {
  const { canManageUsers, getAuthConfig } = useAuth();
  const [activeTab, setActiveTab] = useState('oauth');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [testing, setTesting] = useState(false);
  const messageContainerRef = useRef(null);

  // SAML Configuration
  const [samlConfig, setSamlConfig] = useState({
    enabled: false,
    idpMetadataUrl: '',
    idpEntityId: '',
    idpSsoUrl: '',
    idpLogoutUrl: '',
    idpCertificate: '',
    spEntityId: '',
    spAcsUrl: '',
    spSloUrl: '',
    attributeMapping: {
      email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
      firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
      lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
      role: 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role'
    },
    roleMapping: {
      'Platform Admin': 'admin,platform-admin,administrator',
      'User': 'user,member',
      'Assessor': 'assessor,auditor,compliance'
    },
    signRequests: true,
    wantAssertionsSigned: true,
    allowUnencryptedAssertions: false
  });

  // OAuth Configuration
  const [oauthConfig, setOauthConfig] = useState({
    enabled: false,
    providers: {
      azure: {
        enabled: false,
        clientId: '',
        clientSecret: '',
        tenantId: '',
        redirectUri: `${window.location.origin}/auth/azure/callback`,
        scope: 'openid profile email'
      },
      google: {
        enabled: false,
        clientId: '',
        clientSecret: '',
        redirectUri: `${window.location.origin}/auth/google/callback`,
        scope: 'openid profile email'
      },
      okta: {
        enabled: false,
        domain: '',
        authServerId: '', // e.g. "default" for Custom Auth Server; leave blank for org server
        clientId: '',
        clientSecret: '',
        redirectUri: `${window.location.origin}/auth/okta/callback`,
        scope: 'openid profile email'
      },
      github: {
        enabled: false,
        clientId: '',
        clientSecret: '',
        redirectUri: `${window.location.origin}/auth/github/callback`,
        scope: 'user:email'
      }
    },
    roleMapping: {
      'Platform Admin': 'admin,administrator',
      'User': 'user,member',
      'Assessor': 'assessor,auditor'
    },
    jitProvisioning: false,
    jitDefaultRole: 'User',
    groupToRoleMapping: {},
    syncRoleFromGroups: true
  });

  useEffect(() => {
    console.log('SSOIntegration: Component mounted, embedded:', embedded);
    console.log('SSOIntegration: canManageUsers:', canManageUsers());
    
    // Set a timeout to ensure loading doesn't hang forever
    const timeoutId = setTimeout(() => {
      console.log('SSOIntegration: Loading timeout, forcing loading to false');
      setLoading(false);
    }, 3000);
    
    loadConfiguration().finally(() => {
      clearTimeout(timeoutId);
    });
    
    return () => clearTimeout(timeoutId);
  }, []);

  const loadConfiguration = async () => {
    console.log('SSOIntegration: loadConfiguration called');
    
    // Allow all authenticated users to view SSO configuration
    // Only Platform Admins can edit/save

    try {
      setLoading(true);
      console.log('SSOIntegration: Fetching SSO config from API...');
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 3000)
      );
      
      const response = await Promise.race([
        axios.get('/api/sso/config', getAuthConfig()),
        timeoutPromise
      ]);
      
      console.log('SSOIntegration: API response received', response.data);
      
      if (response.data.saml) {
        // Merge with defaults to ensure all required fields exist
        setSamlConfig({
          enabled: false,
          idpMetadataUrl: '',
          idpEntityId: '',
          idpSsoUrl: '',
          idpLogoutUrl: '',
          idpCertificate: '',
          spEntityId: '',
          spAcsUrl: '',
          spSloUrl: '',
          signRequests: true,
          wantAssertionsSigned: true,
          allowUnencryptedAssertions: false,
          ...response.data.saml,
          attributeMapping: {
            email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
            firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
            lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
            role: 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role',
            ...(response.data.saml.attributeMapping || {})
          },
          roleMapping: {
            'Platform Admin': 'admin,platform-admin,administrator',
            'User': 'user,member',
            'Assessor': 'assessor,auditor,compliance',
            ...(response.data.saml.roleMapping || {})
          }
        });
      }
      if (response.data.oauth) {
        // Merge with defaults to ensure all required fields exist
        setOauthConfig({
          enabled: false,
          ...response.data.oauth,
          providers: {
            azure: {
              enabled: false,
              clientId: '',
              clientSecret: '',
              tenantId: '',
              redirectUri: `${window.location.origin}/auth/azure/callback`,
              scope: 'openid profile email',
              ...(response.data.oauth.providers?.azure || {})
            },
            google: {
              enabled: false,
              clientId: '',
              clientSecret: '',
              redirectUri: `${window.location.origin}/auth/google/callback`,
              scope: 'openid profile email',
              ...(response.data.oauth.providers?.google || {})
            },
            okta: {
              enabled: false,
              domain: '',
              authServerId: '',
              clientId: '',
              clientSecret: '',
              redirectUri: `${window.location.origin}/auth/okta/callback`,
              scope: 'openid profile email',
              ...(response.data.oauth.providers?.okta || {})
            },
            github: {
              enabled: false,
              clientId: '',
              clientSecret: '',
              redirectUri: `${window.location.origin}/auth/github/callback`,
              scope: 'user:email',
              ...(response.data.oauth.providers?.github || {})
            }
          },
          roleMapping: {
            'Platform Admin': 'admin,administrator',
            'User': 'user,member',
            'Assessor': 'assessor,auditor',
            ...(response.data.oauth.roleMapping || {})
          },
          jitProvisioning: response.data.oauth.jitProvisioning === true,
          jitDefaultRole: response.data.oauth.jitDefaultRole || 'User',
          groupToRoleMapping: response.data.oauth.groupToRoleMapping && typeof response.data.oauth.groupToRoleMapping === 'object' ? response.data.oauth.groupToRoleMapping : {},
          syncRoleFromGroups: response.data.oauth.syncRoleFromGroups !== false
        });
      }
      
      setMessage('');
    } catch (err) {
      console.log('SSOIntegration: No existing SSO config found, using defaults', err);
      // Don't block rendering if API fails - use defaults
      setMessage('');
    } finally {
      console.log('SSOIntegration: Setting loading to false');
      setLoading(false);
    }
  };

  const handleSaveConfiguration = async () => {
    if (!canManageUsers()) {
      setMessage('⚠️ You do not have permission to save SSO configuration');
      return;
    }

    try {
      setSaving(true);
      const config = {
        saml: samlConfig,
        oauth: oauthConfig
      };

      await axios.post('/api/sso/config', config, getAuthConfig());
      setMessage('✅ SSO configuration saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setMessage('❌ ' + (err.response?.data?.message || 'Failed to save configuration'));
    } finally {
      setSaving(false);
    }
  };

  const scrollMessageIntoView = () => {
    requestAnimationFrame(() => {
      messageContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  const handleTestConnection = async (provider) => {
    // Require Platform Admin to run test
    if (!canManageUsers()) {
      setMessage('❌ Only Platform Admins can test SSO connections.');
      scrollMessageIntoView();
      setTimeout(() => setMessage(''), 5000);
      return;
    }

    // For OAuth/Okta: require OAuth enabled, provider enabled, and minimal config
    if (activeTab === 'oauth') {
      const providerKey = provider.toLowerCase().replace(' ', '');
      const providerConfig = oauthConfig.providers?.[providerKey];
      if (!oauthConfig.enabled || !providerConfig?.enabled) {
        setMessage(`⚠️ Please enable "OAuth / OIDC" above and enable "${provider}" first.`);
        scrollMessageIntoView();
        setTimeout(() => setMessage(''), 6000);
        return;
      }
      if (providerKey === 'okta' && (!providerConfig.domain?.trim() || !providerConfig.clientId?.trim())) {
        setMessage('⚠️ Please enter Okta Domain and Client ID to test the connection.');
        scrollMessageIntoView();
        setTimeout(() => setMessage(''), 6000);
        return;
      }
    }

    try {
      setTesting(true);
      setMessage(`🔄 Testing ${provider} connection...`);
      scrollMessageIntoView();

      const response = await axios.post(
        '/api/sso/test',
        { provider, config: activeTab === 'saml' ? samlConfig : oauthConfig },
        getAuthConfig()
      );

      if (response.data.success) {
        setMessage(`✅ ${provider} connection test successful!`);
      } else {
        setMessage(`❌ ${provider} connection test failed: ${response.data.error}`);
      }
    } catch (err) {
      setMessage(`❌ Test failed: ${err.response?.data?.message || err.message}`);
    } finally {
      setTesting(false);
      setTimeout(() => setMessage(''), 5000);
    }
    scrollMessageIntoView();
  };

  const handleFetchMetadata = async () => {
    if (!samlConfig.idpMetadataUrl) {
      setMessage('⚠️ Please enter IdP Metadata URL first');
      return;
    }

    try {
      setMessage('🔄 Fetching SAML metadata...');
      const response = await axios.post(
        '/api/sso/saml/fetch-metadata',
        { metadataUrl: samlConfig.idpMetadataUrl },
        getAuthConfig()
      );

      if (response.data.success) {
        setSamlConfig({
          ...samlConfig,
          idpEntityId: response.data.entityId || samlConfig.idpEntityId,
          idpSsoUrl: response.data.ssoUrl || samlConfig.idpSsoUrl,
          idpLogoutUrl: response.data.logoutUrl || samlConfig.idpLogoutUrl,
          idpCertificate: response.data.certificate || samlConfig.idpCertificate
        });
        setMessage('✅ SAML metadata fetched successfully!');
      } else {
        setMessage('❌ Failed to fetch metadata: ' + response.data.error);
      }
    } catch (err) {
      setMessage('❌ ' + (err.response?.data?.message || 'Failed to fetch metadata'));
    }
  };

  if (loading) {
    console.log('SSOIntegration: Rendering loading state');
    return (
      <div className="sso-integration-container" style={{ minHeight: '400px', background: 'white' }}>
        {!embedded && (
          <div className="sso-header">
            <h2>🔐 SSO Integration</h2>
            {onClose && <button className="close-btn" onClick={onClose}>✖</button>}
          </div>
        )}
        <div style={{ padding: '2rem', textAlign: 'center', color: '#333', fontSize: '1rem', flex: 1 }}>
          <div>Loading SSO Configuration...</div>
          <div style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#666' }}>
            If this message persists, there may be an API connection issue.
          </div>
        </div>
      </div>
    );
  }

  // Check if user can edit (Platform Admin) or only view (User/Assessor)
  const canEdit = canManageUsers();

  console.log('SSOIntegration: Rendering main content, activeTab:', activeTab, 'canEdit:', canEdit);

  return (
    <div className="sso-integration-container" style={{ minHeight: '400px', background: 'white', display: 'flex', flexDirection: 'column', width: '100%', position: 'relative', zIndex: 1 }}>
      {/* Debug: Remove this after testing */}
      <div style={{ background: '#ffeb3b', padding: '0.5rem', fontSize: '0.8rem', color: '#000', display: embedded ? 'none' : 'block' }}>
        DEBUG: SSO Component Rendered | Loading: {loading.toString()} | CanManage: {canManageUsers().toString()} | ActiveTab: {activeTab}
      </div>
      {!embedded && (
        <div className="sso-header">
          <h2>🔐 SSO Integration</h2>
          {onClose && <button className="close-btn" onClick={onClose}>✖</button>}
        </div>
      )}

      <div className="sso-subtitle" style={{ display: 'block', visibility: 'visible' }}>
        {canEdit 
          ? 'Configure SAML 2.0 and OAuth 2.0 / OpenID Connect providers for enterprise single sign-on'
          : 'View SAML 2.0 and OAuth 2.0 / OpenID Connect configuration (Read-Only Mode)'}
      </div>
      <div style={{ padding: '0 2rem', fontSize: '0.8rem', color: '#666', marginTop: '0.25rem' }}>
        Client ID and secrets are stored in <strong>config/app/config.json</strong> (or CONFIG_PATH / Docker <strong>/data/config.json</strong>) under <code>ssoConfig.oauth.providers</code>.
      </div>
      
      {!canEdit && (
        <div style={{ 
          padding: '1rem 2rem', 
          background: '#fff3cd', 
          borderLeft: '4px solid #ffc107',
          margin: '0 2rem',
          borderRadius: '4px',
          color: '#856404',
          fontSize: '0.9rem'
        }}>
          <strong>📖 Read-Only Mode:</strong> You can view the SSO configuration but cannot make changes. Only Platform Admins can edit SSO settings.
        </div>
      )}

      <div ref={messageContainerRef} style={{ minHeight: message ? undefined : 0 }}>
        {message && (
          <div className={`sso-message ${message.includes('✅') ? 'success' : message.includes('🔄') ? 'info' : 'error'}`}>
            {message}
          </div>
        )}
      </div>

      <div className="sso-tabs" style={{ display: 'flex', visibility: 'visible', borderBottom: '2px solid #e0e0e0', padding: '0 2rem', background: '#f8f9fa' }}>
        <button
          className={`sso-tab ${activeTab === 'oauth' ? 'active' : ''}`}
          onClick={() => setActiveTab('oauth')}
          style={{ display: 'block', visibility: 'visible' }}
        >
          🌐 OAuth / OIDC
        </button>
        <button
          className={`sso-tab ${activeTab === 'saml' ? 'active' : ''}`}
          onClick={() => setActiveTab('saml')}
          style={{ display: 'block', visibility: 'visible' }}
        >
          🔒 SAML 2.0
        </button>
      </div>

      <div className="sso-content" style={{ display: 'block', visibility: 'visible', opacity: 1, flex: 1, overflowY: 'auto', padding: '2rem', minHeight: '300px', background: 'white' }}>
        {activeTab === 'saml' && (
          <div className="saml-config">
            <div className="config-section">
              <div className="section-header-row">
                <h3>SAML 2.0 Configuration</h3>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={samlConfig.enabled}
                    onChange={(e) => canEdit && setSamlConfig({ ...samlConfig, enabled: e.target.checked })}
                  />
                  <span className="toggle-slider"></span>
                  <span className="toggle-label">{samlConfig.enabled ? 'Enabled' : 'Disabled'}</span>
                </label>
              </div>

              <div className="info-banner">
                <strong>ℹ️ SAML 2.0 Single Sign-On</strong>
                <p>Integrate with enterprise identity providers like Okta, Azure AD, PingFederate, OneLogin, and more.</p>
              </div>

              {/* Identity Provider Configuration */}
              <div className="config-group">
                <h4>🏢 Identity Provider (IdP) Configuration</h4>
                
                <div className="form-group">
                  <label>IdP Metadata URL</label>
                  <div className="input-with-button">
                    <input
                      type="url"
                      className="form-control"
                      placeholder="https://your-idp.com/metadata.xml"
                      value={samlConfig.idpMetadataUrl}
                      onChange={(e) => canEdit && setSamlConfig({ ...samlConfig, idpMetadataUrl: e.target.value })}
                      disabled={!canEdit || !samlConfig.enabled}
                    />
                    <button
                      className="btn-secondary"
                      onClick={handleFetchMetadata}
                      disabled={!canEdit || !samlConfig.enabled || !samlConfig.idpMetadataUrl}
                    >
                      📥 Fetch Metadata
                    </button>
                  </div>
                  <small>URL to your Identity Provider's SAML metadata XML</small>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>IdP Entity ID</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="https://your-idp.com/entityid"
                      value={samlConfig.idpEntityId}
                      onChange={(e) => canEdit && setSamlConfig({ ...samlConfig, idpEntityId: e.target.value })}
                      disabled={!canEdit || !samlConfig.enabled}
                    />
                  </div>

                  <div className="form-group">
                    <label>IdP SSO URL</label>
                    <input
                      type="url"
                      className="form-control"
                      placeholder="https://your-idp.com/sso"
                      value={samlConfig.idpSsoUrl}
                      onChange={(e) => canEdit && setSamlConfig({ ...samlConfig, idpSsoUrl: e.target.value })}
                      disabled={!canEdit || !samlConfig.enabled}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>IdP X.509 Certificate</label>
                  <textarea
                    className="form-control"
                    rows="4"
                    placeholder="-----BEGIN CERTIFICATE-----&#10;MIIDdTCCAl2gAwIBAgILBAAAAAABFUtaw5QwDQYJKoZIhvcNAQEFBQAwVzELMAkG...&#10;-----END CERTIFICATE-----"
                    value={samlConfig.idpCertificate}
                    onChange={(e) => canEdit && setSamlConfig({ ...samlConfig, idpCertificate: e.target.value })}
                    disabled={!canEdit || !samlConfig.enabled}
                  />
                  <small>Public certificate from your IdP for signature verification</small>
                </div>
              </div>

              {/* Service Provider Configuration */}
              <div className="config-group">
                <h4>🖥️ Service Provider (SP) Configuration</h4>
                
                <div className="form-group">
                  <label>SP Entity ID</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="https://your-app.com/saml/metadata"
                    value={samlConfig.spEntityId}
                    onChange={(e) => canEdit && setSamlConfig({ ...samlConfig, spEntityId: e.target.value })}
                    disabled={!canEdit || !samlConfig.enabled}
                  />
                  <small>Unique identifier for this application (your app URL)</small>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>Assertion Consumer Service (ACS) URL</label>
                    <input
                      type="url"
                      className="form-control"
                      placeholder="https://your-app.com/auth/saml/acs"
                      value={samlConfig.spAcsUrl}
                      onChange={(e) => canEdit && setSamlConfig({ ...samlConfig, spAcsUrl: e.target.value })}
                      disabled={!canEdit || !samlConfig.enabled}
                    />
                  </div>

                  <div className="form-group">
                    <label>Single Logout (SLO) URL</label>
                    <input
                      type="url"
                      className="form-control"
                      placeholder="https://your-app.com/auth/saml/slo"
                      value={samlConfig.spSloUrl}
                      onChange={(e) => canEdit && setSamlConfig({ ...samlConfig, spSloUrl: e.target.value })}
                      disabled={!canEdit || !samlConfig.enabled}
                    />
                  </div>
                </div>
              </div>

              {/* Attribute Mapping */}
              <div className="config-group">
                <h4>🔗 SAML Attribute Mapping</h4>
                <p className="section-description">Map SAML attributes to user profile fields</p>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>Email Attribute</label>
                    <input
                      type="text"
                      className="form-control"
                      value={samlConfig.attributeMapping?.email || ''}
                      onChange={(e) => canEdit && setSamlConfig({ 
                        ...samlConfig, 
                        attributeMapping: { 
                          ...(samlConfig.attributeMapping || {
                            email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
                            firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
                            lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
                            role: 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role'
                          }),
                          email: e.target.value
                        }
                      })}
                      disabled={!canEdit || !samlConfig.enabled}
                    />
                  </div>

                  <div className="form-group">
                    <label>Role Attribute</label>
                    <input
                      type="text"
                      className="form-control"
                      value={samlConfig.attributeMapping?.role || ''}
                      onChange={(e) => canEdit && setSamlConfig({ 
                        ...samlConfig, 
                        attributeMapping: { 
                          ...(samlConfig.attributeMapping || {
                            email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
                            firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
                            lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
                            role: 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role'
                          }),
                          role: e.target.value
                        }
                      })}
                      disabled={!canEdit || !samlConfig.enabled}
                    />
                  </div>
                </div>
              </div>

              {/* Role Mapping */}
              <div className="config-group">
                <h4>👥 Role Mapping</h4>
                <p className="section-description">Map IdP roles/groups to application roles (comma-separated)</p>

                {Object.keys(samlConfig.roleMapping).map(appRole => (
                  <div className="form-group" key={appRole}>
                    <label>{appRole}</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g., admin,administrator,platform-admin"
                      value={samlConfig.roleMapping[appRole]}
                      onChange={(e) => canEdit && setSamlConfig({
                        ...samlConfig,
                        roleMapping: { ...samlConfig.roleMapping, [appRole]: e.target.value }
                      })}
                      disabled={!canEdit || !samlConfig.enabled}
                    />
                  </div>
                ))}
              </div>

              {/* Security Settings */}
              <div className="config-group">
                <h4>🔒 Security Settings</h4>
                
                <div className="checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={samlConfig.signRequests}
                      onChange={(e) => canEdit && setSamlConfig({ ...samlConfig, signRequests: e.target.checked })}
                      disabled={!canEdit || !samlConfig.enabled}
                    />
                    <span>Sign SAML requests</span>
                  </label>

                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={samlConfig.wantAssertionsSigned}
                      onChange={(e) => canEdit && setSamlConfig({ ...samlConfig, wantAssertionsSigned: e.target.checked })}
                      disabled={!canEdit || !samlConfig.enabled}
                    />
                    <span>Require signed SAML assertions</span>
                  </label>

                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={!samlConfig.allowUnencryptedAssertions}
                      onChange={(e) => canEdit && setSamlConfig({ ...samlConfig, allowUnencryptedAssertions: !e.target.checked })}
                      disabled={!canEdit || !samlConfig.enabled}
                    />
                    <span>Require encrypted assertions</span>
                  </label>
                </div>
              </div>

              <div className="action-buttons">
                <button
                  className="btn-primary"
                  onClick={() => handleTestConnection('SAML')}
                  disabled={!canEdit || !samlConfig.enabled || testing}
                >
                  🔍 Test SAML Connection
                </button>
              </div>
            </div>
          </div>
        )}

        {(activeTab === 'oauth' || !activeTab) && (
          <div className="oauth-config">
            <div className="config-section">
              <div className="section-header-row">
                <h3>OAuth 2.0 / OpenID Connect Configuration</h3>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={oauthConfig.enabled}
                    onChange={(e) => canEdit && setOauthConfig({ ...oauthConfig, enabled: e.target.checked })}
                  />
                  <span className="toggle-slider"></span>
                  <span className="toggle-label">{oauthConfig.enabled ? 'Enabled' : 'Disabled'}</span>
                </label>
              </div>

              <div className="info-banner">
                <strong>ℹ️ OAuth 2.0 / OpenID Connect</strong>
                <p>Integrate with popular OAuth providers like Azure AD, Google, Okta, GitHub, and more.</p>
              </div>

              {/* Okta OAuth 2.0 - First / default provider */}
              <div className="provider-config">
                <div className="provider-header">
                  <div className="provider-title">
                    <span className="provider-icon">🔷</span>
                    <h4>Okta OAuth 2.0</h4>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={oauthConfig.providers.okta.enabled}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          okta: { ...oauthConfig.providers.okta, enabled: e.target.checked }
                        }
                      })}
                      disabled={!canEdit || !oauthConfig.enabled}
                    />
                    <span className="toggle-slider"></span>
                    <span className="toggle-label">{oauthConfig.providers.okta.enabled ? 'Enabled' : 'Disabled'}</span>
                  </label>
                </div>

                <div className="form-row-3">
                  <div className="form-group">
                    <label>Okta Domain</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="your-domain.okta.com or your-domain.oktapreview.com"
                      value={oauthConfig.providers.okta.domain}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          okta: { ...oauthConfig.providers.okta, domain: e.target.value }
                        }
                      })}
                      disabled={!canEdit || !oauthConfig.enabled || !oauthConfig.providers.okta.enabled}
                    />
                  </div>
                  <div className="form-group">
                    <label>Authorization Server ID</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="default (leave blank for org server)"
                      value={oauthConfig.providers.okta.authServerId || ''}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          okta: { ...oauthConfig.providers.okta, authServerId: e.target.value.trim() }
                        }
                      })}
                      disabled={!canEdit || !oauthConfig.enabled || !oauthConfig.providers.okta.enabled}
                    />
                    <small style={{ display: 'block', marginTop: '0.25rem', color: '#666' }}>
                      Use <strong>default</strong> if your Okta app uses a Custom Authorization Server. Leave blank for the legacy org server.
                    </small>
                  </div>
                  <div className="form-group">
                    <label>Client ID</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="client-id"
                      value={oauthConfig.providers.okta.clientId}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          okta: { ...oauthConfig.providers.okta, clientId: e.target.value }
                        }
                      })}
                      disabled={!canEdit || !oauthConfig.enabled || !oauthConfig.providers.okta.enabled}
                    />
                  </div>
                </div>
                <div className="form-row-2" style={{ marginTop: '0.5rem' }}>
                  <div className="form-group">
                    <label>Client Secret</label>
                    <input
                      type="password"
                      className="form-control"
                      placeholder="client-secret"
                      value={oauthConfig.providers.okta.clientSecret}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          okta: { ...oauthConfig.providers.okta, clientSecret: e.target.value }
                        }
                      })}
                      disabled={!canEdit || !oauthConfig.enabled || !oauthConfig.providers.okta.enabled}
                    />
                  </div>
                  <div className="form-group">
                    <label>Redirect URI (callback URL)</label>
                    <input
                      type="url"
                      className="form-control"
                      placeholder="https://your-app-domain/auth/okta/callback"
                      value={oauthConfig.providers.okta.redirectUri || ''}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          okta: { ...oauthConfig.providers.okta, redirectUri: e.target.value.trim() }
                        }
                      })}
                      disabled={!canEdit || !oauthConfig.enabled || !oauthConfig.providers.okta.enabled}
                    />
                    <small style={{ display: 'block', marginTop: '0.25rem', color: '#666' }}>
                      Must match the Sign-in redirect URI in your Okta app and the URL where users access this app (e.g. https://oscal.amsgovcloud.com.au/auth/okta/callback). Leave blank to use current browser origin.
                    </small>
                  </div>
                </div>

                <div className="config-group" style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e0e0e0' }}>
                  <h4>👤 JIT provisioning & role from Okta groups</h4>
                  <p className="section-description">Create user on first sign-in if missing, reactivate if deactivated, assign role from Okta group membership.</p>
                  <div className="form-group">
                    <label className="toggle-switch" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="checkbox"
                        checked={oauthConfig.jitProvisioning === true}
                        onChange={(e) => canEdit && setOauthConfig({ ...oauthConfig, jitProvisioning: e.target.checked })}
                        disabled={!canEdit || !oauthConfig.enabled}
                      />
                      <span className="toggle-slider"></span>
                      <span>Enable JIT provisioning (create user if not in users.json)</span>
                    </label>
                  </div>
                  <div className="form-row-2" style={{ marginTop: '0.5rem' }}>
                    <div className="form-group">
                      <label>Default role for new users</label>
                      <select
                        className="form-control"
                        value={oauthConfig.jitDefaultRole || 'User'}
                        onChange={(e) => canEdit && setOauthConfig({ ...oauthConfig, jitDefaultRole: e.target.value })}
                        disabled={!canEdit || !oauthConfig.enabled}
                      >
                        <option value="User">User</option>
                        <option value="Assessor">Assessor</option>
                        <option value="Platform Admin">Platform Admin</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label className="toggle-switch" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
                        <input
                          type="checkbox"
                          checked={oauthConfig.syncRoleFromGroups !== false}
                          onChange={(e) => canEdit && setOauthConfig({ ...oauthConfig, syncRoleFromGroups: e.target.checked })}
                          disabled={!canEdit || !oauthConfig.enabled}
                        />
                        <span className="toggle-slider"></span>
                        <span>Sync role from Okta groups on every login</span>
                      </label>
                    </div>
                  </div>
                  <div className="form-group" style={{ marginTop: '1rem' }}>
                    <label>Okta group → app role mapping</label>
                    <small style={{ display: 'block', marginBottom: '0.5rem', color: '#666' }}>
                      Add Okta group names and app role. Ensure your Okta Authorization Server returns a <strong>groups</strong> claim.
                    </small>
                    {Object.entries(oauthConfig.groupToRoleMapping || {}).filter(([k]) => k && !k.startsWith('__')).map(([groupName, appRole]) => (
                      <div key={groupName} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Okta group name"
                          value={groupName}
                          onChange={(e) => {
                            const v = e.target.value.trim();
                            if (!canEdit) return;
                            const next = { ...(oauthConfig.groupToRoleMapping || {}) };
                            delete next[groupName];
                            if (v) next[v] = appRole;
                            setOauthConfig({ ...oauthConfig, groupToRoleMapping: next });
                          }}
                          disabled={!canEdit || !oauthConfig.enabled}
                          style={{ flex: 1 }}
                        />
                        <select
                          className="form-control"
                          value={appRole}
                          onChange={(e) => canEdit && setOauthConfig({
                            ...oauthConfig,
                            groupToRoleMapping: { ...(oauthConfig.groupToRoleMapping || {}), [groupName]: e.target.value }
                          })}
                          disabled={!canEdit || !oauthConfig.enabled}
                          style={{ width: '160px' }}
                        >
                          <option value="User">User</option>
                          <option value="Assessor">Assessor</option>
                          <option value="Platform Admin">Platform Admin</option>
                        </select>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => canEdit && setOauthConfig({
                            ...oauthConfig,
                            groupToRoleMapping: Object.fromEntries(Object.entries(oauthConfig.groupToRoleMapping || {}).filter(([k]) => k !== groupName))
                          })}
                          disabled={!canEdit || !oauthConfig.enabled}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g. OSCAL-Admins"
                        id="new-group-name"
                        style={{ flex: 1, maxWidth: '240px' }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const input = document.getElementById('new-group-name');
                            const v = (input?.value || '').trim();
                            if (v && canEdit) {
                              setOauthConfig({
                                ...oauthConfig,
                                groupToRoleMapping: { ...(oauthConfig.groupToRoleMapping || {}), [v]: oauthConfig.jitDefaultRole || 'User' }
                              });
                              if (input) input.value = '';
                            }
                          }
                        }}
                        disabled={!canEdit || !oauthConfig.enabled}
                      />
                      <select
                        className="form-control"
                        id="new-group-role"
                        defaultValue="User"
                        style={{ width: '140px' }}
                        disabled={!canEdit || !oauthConfig.enabled}
                      >
                        <option value="User">User</option>
                        <option value="Assessor">Assessor</option>
                        <option value="Platform Admin">Platform Admin</option>
                      </select>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          const input = document.getElementById('new-group-name');
                          const roleSelect = document.getElementById('new-group-role');
                          const v = (input?.value || '').trim();
                          const role = (roleSelect?.value || 'User');
                          if (v && canEdit) {
                            setOauthConfig({
                              ...oauthConfig,
                              groupToRoleMapping: { ...(oauthConfig.groupToRoleMapping || {}), [v]: role }
                            });
                            if (input) input.value = '';
                          }
                        }}
                        disabled={!canEdit || !oauthConfig.enabled}
                      >
                        Add mapping
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  className="btn-test"
                  onClick={() => handleTestConnection('Okta')}
                  disabled={testing}
                  title={!oauthConfig.enabled || !oauthConfig.providers.okta.enabled ? 'Enable OAuth and Okta above first' : (!oauthConfig.providers.okta.domain?.trim() || !oauthConfig.providers.okta.clientId?.trim()) ? 'Enter Okta Domain and Client ID to test' : 'Test connection to Okta'}
                >
                  {testing ? '⏳ Testing...' : '🔍 Test Okta Connection'}
                </button>
              </div>

              {/* Azure AD */}
              <div className="provider-config">
                <div className="provider-header">
                  <div className="provider-title">
                    <span className="provider-icon">☁️</span>
                    <h4>Microsoft Azure AD / Entra ID</h4>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={oauthConfig.providers.azure.enabled}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          azure: { ...oauthConfig.providers.azure, enabled: e.target.checked }
                        }
                      })}
                      disabled={!canEdit || !oauthConfig.enabled}
                    />
                    <span className="toggle-slider"></span>
                    <span className="toggle-label">{oauthConfig.providers.azure.enabled ? 'Enabled' : 'Disabled'}</span>
                  </label>
                </div>

                <div className="form-row-3">
                  <div className="form-group">
                    <label>Tenant ID</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="your-tenant-id"
                      value={oauthConfig.providers.azure.tenantId}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          azure: { ...oauthConfig.providers.azure, tenantId: e.target.value }
                        }
                      })}
                      disabled={!canEdit || !oauthConfig.enabled || !oauthConfig.providers.azure.enabled}
                    />
                  </div>

                  <div className="form-group">
                    <label>Client ID</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="application-client-id"
                      value={oauthConfig.providers.azure.clientId}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          azure: { ...oauthConfig.providers.azure, clientId: e.target.value }
                        }
                      })}
                      disabled={!canEdit || !oauthConfig.enabled || !oauthConfig.providers.azure.enabled}
                    />
                  </div>

                  <div className="form-group">
                    <label>Client Secret</label>
                    <input
                      type="password"
                      className="form-control"
                      placeholder="client-secret"
                      value={oauthConfig.providers.azure.clientSecret}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          azure: { ...oauthConfig.providers.azure, clientSecret: e.target.value }
                        }
                      })}
                      disabled={!canEdit || !oauthConfig.enabled || !oauthConfig.providers.azure.enabled}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Redirect URI</label>
                  <input
                    type="url"
                    className="form-control"
                    value={oauthConfig.providers.azure.redirectUri}
                    disabled
                    style={{ background: '#f0f0f0' }}
                  />
                  <small>Configure this URL in your Azure App Registration</small>
                </div>

                <button
                  className="btn-test"
                  onClick={() => handleTestConnection('Azure AD')}
                  disabled={!canEdit || !oauthConfig.enabled || !oauthConfig.providers.azure.enabled || testing}
                >
                  🔍 Test Azure AD Connection
                </button>
              </div>

              {/* Google */}
              <div className="provider-config">
                <div className="provider-header">
                  <div className="provider-title">
                    <span className="provider-icon">🔵</span>
                    <h4>Google OAuth 2.0</h4>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={oauthConfig.providers.google.enabled}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          google: { ...oauthConfig.providers.google, enabled: e.target.checked }
                        }
                      })}
                      disabled={!canEdit || !oauthConfig.enabled}
                    />
                    <span className="toggle-slider"></span>
                    <span className="toggle-label">{oauthConfig.providers.google.enabled ? 'Enabled' : 'Disabled'}</span>
                  </label>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>Client ID</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="your-app.apps.googleusercontent.com"
                      value={oauthConfig.providers.google.clientId}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          google: { ...oauthConfig.providers.google, clientId: e.target.value }
                        }
                      })}
                      disabled={!canEdit || !oauthConfig.enabled || !oauthConfig.providers.google.enabled}
                    />
                  </div>

                  <div className="form-group">
                    <label>Client Secret</label>
                    <input
                      type="password"
                      className="form-control"
                      placeholder="client-secret"
                      value={oauthConfig.providers.google.clientSecret}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          google: { ...oauthConfig.providers.google, clientSecret: e.target.value }
                        }
                      })}
                      disabled={!canEdit || !oauthConfig.enabled || !oauthConfig.providers.google.enabled}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Redirect URI</label>
                  <input
                    type="url"
                    className="form-control"
                    value={oauthConfig.providers.google.redirectUri}
                    disabled
                    style={{ background: '#f0f0f0' }}
                  />
                  <small>Configure this URL in Google Cloud Console</small>
                </div>

                <button
                  className="btn-test"
                  onClick={() => handleTestConnection('Google')}
                  disabled={!canEdit || !oauthConfig.enabled || !oauthConfig.providers.google.enabled || testing}
                >
                  🔍 Test Google Connection
                </button>
              </div>

              {/* GitHub */}
              <div className="provider-config">
                <div className="provider-header">
                  <div className="provider-title">
                    <span className="provider-icon">⚫</span>
                    <h4>GitHub OAuth 2.0</h4>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={oauthConfig.providers.github.enabled}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          github: { ...oauthConfig.providers.github, enabled: e.target.checked }
                        }
                      })}
                      disabled={!canEdit || !oauthConfig.enabled}
                    />
                    <span className="toggle-slider"></span>
                    <span className="toggle-label">{oauthConfig.providers.github.enabled ? 'Enabled' : 'Disabled'}</span>
                  </label>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>Client ID</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="github-client-id"
                      value={oauthConfig.providers.github.clientId}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          github: { ...oauthConfig.providers.github, clientId: e.target.value }
                        }
                      })}
                      disabled={!canEdit || !oauthConfig.enabled || !oauthConfig.providers.github.enabled}
                    />
                  </div>

                  <div className="form-group">
                    <label>Client Secret</label>
                    <input
                      type="password"
                      className="form-control"
                      placeholder="client-secret"
                      value={oauthConfig.providers.github.clientSecret}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          github: { ...oauthConfig.providers.github, clientSecret: e.target.value }
                        }
                      })}
                      disabled={!canEdit || !oauthConfig.enabled || !oauthConfig.providers.github.enabled}
                    />
                  </div>
                </div>

                <button
                  className="btn-test"
                  onClick={() => handleTestConnection('GitHub')}
                  disabled={!canEdit || !oauthConfig.enabled || !oauthConfig.providers.github.enabled || testing}
                >
                  🔍 Test GitHub Connection
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {canEdit && (
        <div className="sso-footer">
          <button
            className="btn-primary btn-large"
            onClick={handleSaveConfiguration}
            disabled={saving}
          >
            {saving ? '⏳ Saving...' : '💾 Save SSO Configuration'}
          </button>
        </div>
      )}
    </div>
  );
}

export default SSOIntegration;

