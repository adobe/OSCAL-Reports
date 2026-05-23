/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import React, { useState, useEffect, useRef } from 'react';
import axios from '../utils/safeAxios.js';
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
    try {
      if (typeof canManageUsers === 'function') console.log('SSOIntegration: canManageUsers:', canManageUsers());
    } catch (e) {
      console.warn('SSOIntegration: canManageUsers check failed', e);
    }
    
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
      
      const authConfig = typeof getAuthConfig === 'function' ? getAuthConfig() : {};
      const response = await Promise.race([
        axios.get('/api/sso/config', authConfig),
        timeoutPromise
      ]);
      
      const data = response?.data;
      if (data == null || typeof data !== 'object') {
        setLoading(false);
        return;
      }
      
      console.log('SSOIntegration: API response received', data);
      
      if (data.saml && typeof data.saml === 'object') {
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
          ...data.saml,
          attributeMapping: {
            email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
            firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
            lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
            role: 'http://schemas.microsoft.com/ws/2008/06/identity/claims/role',
            ...(data.saml.attributeMapping && typeof data.saml.attributeMapping === 'object' ? data.saml.attributeMapping : {})
          },
          roleMapping: {
            'Platform Admin': 'admin,platform-admin,administrator',
            'User': 'user,member',
            'Assessor': 'assessor,auditor,compliance',
            ...(data.saml.roleMapping && typeof data.saml.roleMapping === 'object' && !Array.isArray(data.saml.roleMapping) ? data.saml.roleMapping : {})
          }
        });
      }
      const oauth = data.oauth && typeof data.oauth === 'object' ? data.oauth : null;
      const providers = oauth?.providers && typeof oauth.providers === 'object' && !Array.isArray(oauth.providers) ? oauth.providers : {};
      if (oauth) {
        // Merge with defaults to ensure all required fields exist
        setOauthConfig({
          enabled: false,
          ...oauth,
          providers: {
            azure: {
              enabled: false,
              clientId: '',
              clientSecret: '',
              tenantId: '',
              redirectUri: `${window.location.origin}/auth/azure/callback`,
              scope: 'openid profile email',
              ...(providers.azure && typeof providers.azure === 'object' ? providers.azure : {})
            },
            google: {
              enabled: false,
              clientId: '',
              clientSecret: '',
              redirectUri: `${window.location.origin}/auth/google/callback`,
              scope: 'openid profile email',
              ...(providers.google && typeof providers.google === 'object' ? providers.google : {})
            },
            okta: {
              enabled: false,
              domain: '',
              authServerId: '',
              clientId: '',
              clientSecret: '',
              redirectUri: `${window.location.origin}/auth/okta/callback`,
              scope: 'openid profile email',
              ...(providers.okta && typeof providers.okta === 'object' ? providers.okta : {})
            },
            github: {
              enabled: false,
              clientId: '',
              clientSecret: '',
              redirectUri: `${window.location.origin}/auth/github/callback`,
              scope: 'user:email',
              ...(providers.github && typeof providers.github === 'object' ? providers.github : {})
            }
          },
          roleMapping: {
            'Platform Admin': 'admin,administrator',
            'User': 'user,member',
            'Assessor': 'assessor,auditor',
            ...(oauth.roleMapping && typeof oauth.roleMapping === 'object' && !Array.isArray(oauth.roleMapping) ? oauth.roleMapping : {})
          },
          jitProvisioning: oauth.jitProvisioning === true,
          jitDefaultRole: oauth.jitDefaultRole || 'User',
          groupToRoleMapping: oauth.groupToRoleMapping && typeof oauth.groupToRoleMapping === 'object' && !Array.isArray(oauth.groupToRoleMapping) ? oauth.groupToRoleMapping : {},
          syncRoleFromGroups: oauth.syncRoleFromGroups !== false
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

    if (activeTab === 'saml' && provider === 'SAML') {
      const idpEntity = typeof samlConfig.idpEntityId === 'string' ? samlConfig.idpEntityId.trim() : '';
      const idpSso = typeof samlConfig.idpSsoUrl === 'string' ? samlConfig.idpSsoUrl.trim() : '';
      const spEntity = typeof samlConfig.spEntityId === 'string' ? samlConfig.spEntityId.trim() : '';
      if (!idpEntity || !idpSso || !spEntity) {
        setMessage('⚠️ Enter IdP Entity ID, IdP SSO URL, and SP Entity ID to test SAML (nothing is saved until you click Save).');
        scrollMessageIntoView();
        setTimeout(() => setMessage(''), 6000);
        return;
      }
    }

    // OAuth: validate current form fields (enable toggles are not required to run a test)
    if (activeTab === 'oauth') {
      const providerSlug = provider.toLowerCase().replace(/\s+/g, '');
      const oauthKey = providerSlug === 'azuread' ? 'azure' : providerSlug;
      const providerConfig = oauthConfig.providers?.[oauthKey];
      if (oauthKey === 'okta') {
        const hasDomain = !!safeStr(providerConfig?.domain);
        const hasClientId = !!safeStr(providerConfig?.clientId);
        const hasClientSecret = hasOidcClientSecret(providerConfig?.clientSecret);
        if (!hasDomain || !hasClientId || !hasClientSecret) {
          setMessage('⚠️ Enter Okta Domain, Client ID, and Client Secret (or Pass vault entry) to test the connection.');
          scrollMessageIntoView();
          setTimeout(() => setMessage(''), 6000);
          return;
        }
      } else if (!safeStr(providerConfig?.clientId)) {
        setMessage(`⚠️ Enter Client ID for ${provider} to test (secret optional for this check).`);
        scrollMessageIntoView();
        setTimeout(() => setMessage(''), 6000);
        return;
      }
    }

    let dismissAfterMs = 5000;
    try {
      setTesting(true);
      setMessage(`🔄 Testing ${provider} connection...`);
      scrollMessageIntoView();

      const response = await axios.post(
        '/api/sso/test',
        { provider, config: activeTab === 'saml' ? samlConfig : oauthConfig },
        getAuthConfig()
      );

      const slug = provider.toLowerCase().replace(/\s+/g, '');
      const isOkta = slug === 'okta';
      const checks = response.data.checks;
      if (isOkta && Array.isArray(checks) && checks.length > 0) {
        dismissAfterMs = 16000;
        const header = response.data.success
          ? '✅ Okta test — all steps passed'
          : '❌ Okta test — one or more steps failed';
        const lines = checks.map((c) => `${c.passed ? '✅' : '❌'} ${c.label}\n   ${c.detail || (c.passed ? 'OK' : 'Failed')}`);
        const footer = response.data.error ? `\n${response.data.error}` : '';
        const successNote = response.data.success && response.data.message ? `\n${response.data.message}` : '';
        setMessage(`${header}\n\n${lines.join('\n\n')}${successNote}${footer}`);
      } else if (response.data.success) {
        setMessage(response.data.message ? `✅ ${response.data.message}` : `✅ ${provider} connection test successful!`);
      } else {
        setMessage(`❌ ${provider} connection test failed: ${response.data.error || 'Unknown error'}`);
      }
    } catch (err) {
      setMessage(`❌ Test failed: ${err.response?.data?.error || err.response?.data?.message || err.message}`);
    } finally {
      setTesting(false);
      setTimeout(() => setMessage(''), dismissAfterMs);
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
  let canEdit = false;
  try {
    canEdit = typeof canManageUsers === 'function' ? canManageUsers() : false;
  } catch (_) {
    canEdit = false;
  }

  // Safe string trim (clientSecret etc. may be object e.g. Pass pointer from API)
  const safeStr = (v) => (typeof v === 'string' ? v.trim() : '');
  // Client secret may be a Pass vault pointer { _pass: "entry/path" } — treat as configured for UI/test gating
  const hasOidcClientSecret = (v) => {
    if (safeStr(v)) return true;
    if (v && typeof v === 'object' && !Array.isArray(v) && safeStr(v._pass)) return true;
    return false;
  };

  // Defensive: ensure Okta provider config exists so we never read .domain etc of undefined
  const oktaProvider = (oauthConfig?.providers?.okta != null && typeof oauthConfig.providers.okta === 'object')
    ? oauthConfig.providers.okta
    : {
        enabled: false,
        domain: '',
        authServerId: '',
        clientId: '',
        clientSecret: '',
        redirectUri: (typeof window !== 'undefined' && window.location?.origin) ? `${window.location.origin}/auth/okta/callback` : '',
        scope: 'openid profile email'
      };

  // Defensive: ensure other OAuth providers and SAML config never cause "read of undefined"
  const origin = (typeof window !== 'undefined' && window.location?.origin) ? window.location.origin : '';
  const defaultProvider = (basePath) => ({ enabled: false, clientId: '', clientSecret: '', redirectUri: `${origin}${basePath}`, scope: 'openid profile email' });
  const azureProvider = (oauthConfig?.providers?.azure != null && typeof oauthConfig.providers.azure === 'object')
    ? oauthConfig.providers.azure
    : { ...defaultProvider('/auth/azure/callback'), tenantId: '' };
  const googleProvider = (oauthConfig?.providers?.google != null && typeof oauthConfig.providers.google === 'object')
    ? oauthConfig.providers.google
    : defaultProvider('/auth/google/callback');
  const githubProvider = (oauthConfig?.providers?.github != null && typeof oauthConfig.providers.github === 'object')
    ? oauthConfig.providers.github
    : { ...defaultProvider('/auth/github/callback'), scope: 'user:email' };
  const safeSamlRoleMapping = (samlConfig?.roleMapping != null && typeof samlConfig.roleMapping === 'object' && !Array.isArray(samlConfig.roleMapping))
    ? samlConfig.roleMapping
    : { 'Platform Admin': '', 'User': '', 'Assessor': '' };
  const safeGroupToRoleMapping = (oauthConfig?.groupToRoleMapping != null && typeof oauthConfig.groupToRoleMapping === 'object' && !Array.isArray(oauthConfig.groupToRoleMapping))
    ? oauthConfig.groupToRoleMapping
    : {};

  return (
    <div className="sso-integration-container" style={{ minHeight: '400px', background: 'white', display: 'flex', flexDirection: 'column', width: '100%', position: 'relative', zIndex: 1 }}>
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
          <div
            className={`sso-message ${message.startsWith('🔄') ? 'info' : message.startsWith('✅') ? 'success' : 'error'} ${message.includes('\n\n') ? 'preformatted' : ''}`}
          >
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
                      disabled={!canEdit}
                    />
                    <button
                      className="btn-secondary"
                      onClick={handleFetchMetadata}
                      disabled={!canEdit || !(samlConfig.idpMetadataUrl || '').trim()}
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
                      disabled={!canEdit}
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
                      disabled={!canEdit}
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
                    disabled={!canEdit}
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
                    disabled={!canEdit}
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
                      disabled={!canEdit}
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
                      disabled={!canEdit}
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
                      disabled={!canEdit}
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
                      disabled={!canEdit}
                    />
                  </div>
                </div>
              </div>

              {/* Role Mapping */}
              <div className="config-group">
                <h4>👥 Role Mapping</h4>
                <p className="section-description">Map IdP roles/groups to application roles (comma-separated)</p>

                {Object.keys(safeSamlRoleMapping).map(appRole => (
                  <div className="form-group" key={appRole}>
                    <label>{appRole}</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g., admin,administrator,platform-admin"
                      value={safeSamlRoleMapping[appRole] || ''}
                      onChange={(e) => canEdit && setSamlConfig({
                        ...samlConfig,
                        roleMapping: { ...safeSamlRoleMapping, [appRole]: e.target.value }
                      })}
                      disabled={!canEdit}
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
                      disabled={!canEdit}
                    />
                    <span>Sign SAML requests</span>
                  </label>

                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={samlConfig.wantAssertionsSigned}
                      onChange={(e) => canEdit && setSamlConfig({ ...samlConfig, wantAssertionsSigned: e.target.checked })}
                      disabled={!canEdit}
                    />
                    <span>Require signed SAML assertions</span>
                  </label>

                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={!samlConfig.allowUnencryptedAssertions}
                      onChange={(e) => canEdit && setSamlConfig({ ...samlConfig, allowUnencryptedAssertions: !e.target.checked })}
                      disabled={!canEdit}
                    />
                    <span>Require encrypted assertions</span>
                  </label>
                </div>
              </div>

              <div className="action-buttons">
                <button
                  className="btn-primary"
                  onClick={() => handleTestConnection('SAML')}
                  disabled={!canEdit || testing}
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
                      checked={oktaProvider.enabled}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          okta: { ...oktaProvider, enabled: e.target.checked }
                        }
                      })}
                      disabled={!canEdit}
                    />
                    <span className="toggle-slider"></span>
                    <span className="toggle-label">{oktaProvider.enabled ? 'Enabled' : 'Disabled'}</span>
                  </label>
                </div>

                {/* Okta fields: Domain, Redirect URI, Auth Server ID, Client ID, Client Secret, OIDC scope */}
                <div className="form-row-2">
                  <div className="form-group">
                    <label>Okta Domain</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="your-domain.okta.com or your-domain.oktapreview.com"
                      value={oktaProvider.domain || ''}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          okta: { ...oktaProvider, domain: e.target.value }
                        }
                      })}
                      disabled={!canEdit}
                    />
                  </div>
                  <div className="form-group">
                    <label>Redirect URI (callback URL)</label>
                    <input
                      type="url"
                      className="form-control"
                      placeholder="https://your-app-domain/auth/okta/callback"
                      value={oktaProvider.redirectUri || ''}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          okta: { ...oktaProvider, redirectUri: e.target.value.trim() }
                        }
                      })}
                      disabled={!canEdit}
                    />
                    <small style={{ display: 'block', marginTop: '0.25rem', color: '#666' }}>
                      Must match the Sign-in redirect URI in your Okta app and the URL where users access this app (e.g. https://oscal.amsgovcloud.com.au/auth/okta/callback). Leave blank to use current browser origin.
                    </small>
                  </div>
                </div>
                <div className="form-row-2" style={{ marginTop: '0.5rem' }}>
                  <div className="form-group">
                    <label>Authorization Server ID</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="default (leave blank for org server)"
                      value={oktaProvider.authServerId || ''}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          okta: { ...oktaProvider, authServerId: e.target.value.trim() }
                        }
                      })}
                      disabled={!canEdit}
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
                      value={oktaProvider.clientId || ''}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          okta: { ...oktaProvider, clientId: e.target.value }
                        }
                      })}
                      disabled={!canEdit}
                    />
                  </div>
                </div>
                <div className="form-group" style={{ marginTop: '0.5rem' }}>
                  <label>Client Secret</label>
                  <input
                    type="password"
                    className="form-control"
                    placeholder="client-secret"
                    value={typeof oktaProvider.clientSecret === 'string' ? oktaProvider.clientSecret : ''}
                    onChange={(e) => canEdit && setOauthConfig({
                      ...oauthConfig,
                      providers: {
                        ...oauthConfig.providers,
                        okta: { ...oktaProvider, clientSecret: e.target.value }
                      }
                    })}
                    disabled={!canEdit}
                  />
                </div>
                <div className="form-group" style={{ marginTop: '0.5rem' }}>
                  <label>OIDC scope (space-separated)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="openid profile email"
                    value={typeof oktaProvider.scope === 'string' ? oktaProvider.scope : 'openid profile email'}
                    onChange={(e) => canEdit && setOauthConfig({
                      ...oauthConfig,
                      providers: {
                        ...oauthConfig.providers,
                        okta: { ...oktaProvider, scope: e.target.value }
                      }
                    })}
                    disabled={!canEdit}
                  />
                  <small style={{ display: 'block', marginTop: '0.25rem', color: '#666' }}>
                    Sent to Okta on sign-in (<code>/authorize</code>). Default is <code>openid profile email</code> (works on most org servers). Add <strong>groups</strong> only after that scope exists on <strong>your</strong> Authorization Server and is allowed for this app — otherwise Okta returns &quot;One or more scopes are not configured for the authorization server resource.&quot; If you use token <strong>claims</strong> for groups without a <code>groups</code> scope, leave scopes as shown and configure claims in Okta Admin.
                  </small>
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
                        disabled={!canEdit}
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
                        disabled={!canEdit}
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
                          disabled={!canEdit}
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
                    {Object.entries(safeGroupToRoleMapping).filter(([k]) => k && !k.startsWith('__')).map(([groupName, appRole]) => (
                      <div key={groupName} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Okta group name"
                          value={groupName}
                          onChange={(e) => {
                            const v = e.target.value.trim();
                            if (!canEdit) return;
                            const next = { ...safeGroupToRoleMapping };
                            delete next[groupName];
                            if (v) next[v] = appRole;
                            setOauthConfig({ ...oauthConfig, groupToRoleMapping: next });
                          }}
                          disabled={!canEdit}
                          style={{ flex: 1 }}
                        />
                        <select
                          className="form-control"
                          value={appRole || 'User'}
                          onChange={(e) => canEdit && setOauthConfig({
                            ...oauthConfig,
                            groupToRoleMapping: { ...safeGroupToRoleMapping, [groupName]: e.target.value }
                          })}
                          disabled={!canEdit}
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
                            groupToRoleMapping: Object.fromEntries(Object.entries(safeGroupToRoleMapping).filter(([k]) => k !== groupName))
                          })}
                          disabled={!canEdit}
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
                              groupToRoleMapping: { ...safeGroupToRoleMapping, [v]: oauthConfig.jitDefaultRole || 'User' }
                            });
                              if (input) input.value = '';
                            }
                          }
                        }}
                        disabled={!canEdit}
                      />
                      <select
                        className="form-control"
                        id="new-group-role"
                        defaultValue="User"
                        style={{ width: '140px' }}
                        disabled={!canEdit}
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
                              groupToRoleMapping: { ...safeGroupToRoleMapping, [v]: role }
                            });
                            if (input) input.value = '';
                          }
                        }}
                        disabled={!canEdit}
                      >
                        Add mapping
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  className="btn-test"
                  onClick={() => handleTestConnection('Okta')}
                  disabled={!canEdit || testing}
                  title={
                    (!safeStr(oktaProvider.domain) || !safeStr(oktaProvider.clientId) || !hasOidcClientSecret(oktaProvider.clientSecret))
                      ? 'Enter Okta Domain, Client ID, and Client Secret (or Pass vault entry) to test'
                      : 'Test using values in this form; Save SSO configuration when you want to persist'
                  }
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
                      checked={azureProvider.enabled}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          azure: { ...azureProvider, enabled: e.target.checked }
                        }
                      })}
                      disabled={!canEdit}
                    />
                    <span className="toggle-slider"></span>
                    <span className="toggle-label">{azureProvider.enabled ? 'Enabled' : 'Disabled'}</span>
                  </label>
                </div>

                <div className="form-row-3">
                  <div className="form-group">
                    <label>Tenant ID</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="your-tenant-id"
                      value={azureProvider.tenantId || ''}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          azure: { ...azureProvider, tenantId: e.target.value }
                        }
                      })}
                      disabled={!canEdit}
                    />
                  </div>

                  <div className="form-group">
                    <label>Client ID</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="application-client-id"
                      value={azureProvider.clientId || ''}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          azure: { ...azureProvider, clientId: e.target.value }
                        }
                      })}
                      disabled={!canEdit}
                    />
                  </div>

                  <div className="form-group">
                    <label>Client Secret</label>
                    <input
                      type="password"
                      className="form-control"
                      placeholder="client-secret"
                      value={typeof azureProvider.clientSecret === 'string' ? azureProvider.clientSecret : ''}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          azure: { ...azureProvider, clientSecret: e.target.value }
                        }
                      })}
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Redirect URI</label>
                  <input
                    type="url"
                    className="form-control"
                    value={azureProvider.redirectUri || ''}
                    disabled
                    style={{ background: '#f0f0f0' }}
                  />
                  <small>Configure this URL in your Azure App Registration</small>
                </div>

                <button
                  className="btn-test"
                  onClick={() => handleTestConnection('Azure AD')}
                  disabled={!canEdit || testing}
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
                      checked={googleProvider.enabled}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          google: { ...googleProvider, enabled: e.target.checked }
                        }
                      })}
                      disabled={!canEdit}
                    />
                    <span className="toggle-slider"></span>
                    <span className="toggle-label">{googleProvider.enabled ? 'Enabled' : 'Disabled'}</span>
                  </label>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>Client ID</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="your-app.apps.googleusercontent.com"
                      value={googleProvider.clientId || ''}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          google: { ...googleProvider, clientId: e.target.value }
                        }
                      })}
                      disabled={!canEdit}
                    />
                  </div>

                  <div className="form-group">
                    <label>Client Secret</label>
                    <input
                      type="password"
                      className="form-control"
                      placeholder="client-secret"
                      value={typeof googleProvider.clientSecret === 'string' ? googleProvider.clientSecret : ''}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          google: { ...googleProvider, clientSecret: e.target.value }
                        }
                      })}
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Redirect URI</label>
                  <input
                    type="url"
                    className="form-control"
                    value={googleProvider.redirectUri || ''}
                    disabled
                    style={{ background: '#f0f0f0' }}
                  />
                  <small>Configure this URL in Google Cloud Console</small>
                </div>

                <button
                  className="btn-test"
                  onClick={() => handleTestConnection('Google')}
                  disabled={!canEdit || testing}
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
                      checked={githubProvider.enabled}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          github: { ...githubProvider, enabled: e.target.checked }
                        }
                      })}
                      disabled={!canEdit}
                    />
                    <span className="toggle-slider"></span>
                    <span className="toggle-label">{githubProvider.enabled ? 'Enabled' : 'Disabled'}</span>
                  </label>
                </div>

                <div className="form-row-2">
                  <div className="form-group">
                    <label>Client ID</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="github-client-id"
                      value={githubProvider.clientId || ''}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          github: { ...githubProvider, clientId: e.target.value }
                        }
                      })}
                      disabled={!canEdit}
                    />
                  </div>

                  <div className="form-group">
                    <label>Client Secret</label>
                    <input
                      type="password"
                      className="form-control"
                      placeholder="client-secret"
                      value={typeof githubProvider.clientSecret === 'string' ? githubProvider.clientSecret : ''}
                      onChange={(e) => canEdit && setOauthConfig({
                        ...oauthConfig,
                        providers: {
                          ...oauthConfig.providers,
                          github: { ...githubProvider, clientSecret: e.target.value }
                        }
                      })}
                      disabled={!canEdit}
                    />
                  </div>
                </div>

                <button
                  className="btn-test"
                  onClick={() => handleTestConnection('GitHub')}
                  disabled={!canEdit || testing}
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
            disabled={saving || testing}
          >
            {saving ? '⏳ Saving...' : '💾 Save SSO Configuration'}
          </button>
        </div>
      )}
    </div>
  );
}

export default SSOIntegration;

