/**
 * Messaging Configuration Component
 * Configure Email and Slack for sending user credentials
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license GPL-3.0-or-later
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import './MessagingConfiguration.css';

function MessagingConfiguration({ embedded = false }) {
  const { canManageUsers, getAuthConfig } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messagingConfig, setMessagingConfig] = useState({
    enabled: false,
    channel: 'email',
    email: {
      enabled: false,
      smtpHost: '',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: '',
      smtpPassword: '',
      fromEmail: '',
      fromName: 'OSCAL Report Generator',
      loginUrl: ''
    },
    slack: {
      enabled: false,
      webhookUrl: '',
      channel: '#general'
    }
  });

  useEffect(() => {
    loadMessagingConfig();
  }, []);

  const loadMessagingConfig = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/settings', getAuthConfig());
      const config = response.data.messagingConfig || {
        enabled: false,
        channel: 'email',
        email: {
          enabled: false,
          smtpHost: '',
          smtpPort: 587,
          smtpSecure: false,
          smtpUser: '',
          smtpPassword: '',
          fromEmail: '',
          fromName: 'OSCAL Report Generator',
          loginUrl: ''
        },
        slack: {
          enabled: false,
          webhookUrl: '',
          channel: '#general'
        }
      };
      setMessagingConfig(config);
      setMessage('');
    } catch (error) {
      console.error('Failed to load messaging config:', error);
      setMessage('⚠️ Failed to load messaging configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!canManageUsers()) {
      setMessage('⚠️ You do not have permission to save messaging configuration');
      return;
    }

    try {
      setSaving(true);
      const response = await axios.get('/api/settings', getAuthConfig());
      const currentConfig = response.data;
      
      const updatedConfig = {
        ...currentConfig,
        messagingConfig: messagingConfig
      };

      await axios.post('/api/settings', updatedConfig, getAuthConfig());
      setMessage('✅ Messaging configuration saved successfully');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Failed to save messaging config:', error);
      setMessage('❌ Failed to save messaging configuration: ' + (error.response?.data?.error || error.message));
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    try {
      setSaving(true);
      const response = await axios.post('/api/messaging/test-email', 
        { emailConfig: messagingConfig.email },
        getAuthConfig()
      );
      if (response.data.success) {
        setMessage('✅ Email test successful');
      } else {
        setMessage('❌ Email test failed: ' + response.data.error);
      }
    } catch (error) {
      setMessage('❌ Email test failed: ' + (error.response?.data?.error || error.message));
    } finally {
      setSaving(false);
    }
  };

  const handleTestSlack = async () => {
    try {
      setSaving(true);
      const response = await axios.post('/api/messaging/test-slack',
        { slackConfig: messagingConfig.slack },
        getAuthConfig()
      );
      if (response.data.success) {
        setMessage('✅ Slack test successful - Check your Slack channel');
      } else {
        setMessage('❌ Slack test failed: ' + response.data.error);
      }
    } catch (error) {
      setMessage('❌ Slack test failed: ' + (error.response?.data?.error || error.message));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading messaging configuration...</div>;
  }

  const canEdit = canManageUsers();

  return (
    <div className={`messaging-config-container ${embedded ? 'embedded' : ''}`} style={{ display: 'block', visibility: 'visible', opacity: 1 }}>
      {!embedded && (
        <div className="messaging-config-header">
          <h2>📧 Messaging Configuration</h2>
          <p className="section-description">
            Configure Email or Slack to automatically send user credentials when new users are created.
          </p>
        </div>
      )}
      
      {embedded && (
        <div className="messaging-config-header" style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e0e0e0', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#1976d2' }}>📧 Messaging Configuration</h3>
          <p className="section-description" style={{ margin: 0, fontSize: '0.9rem' }}>
            Configure Email or Slack to automatically send user credentials when new users are created.
          </p>
        </div>
      )}

      {!canEdit && (
        <div className="read-only-banner">
          ⚠️ Read-only mode: You do not have permission to edit messaging configuration
        </div>
      )}

      {message && (
        <div className={`message ${message.includes('✅') ? 'success' : message.includes('⚠️') ? 'warning' : 'error'}`}>
          {message}
        </div>
      )}

      {/* Enable/Disable Messaging */}
      <div className="config-group">
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={messagingConfig.enabled}
              onChange={(e) => setMessagingConfig({
                ...messagingConfig,
                enabled: e.target.checked
              })}
              disabled={!canEdit}
            />
            Enable Messaging (Send credentials automatically when users are created)
          </label>
        </div>

        {messagingConfig.enabled && (
          <div className="form-group">
            <label>Messaging Channel</label>
            <select
              value={messagingConfig.channel}
              onChange={(e) => setMessagingConfig({
                ...messagingConfig,
                channel: e.target.value
              })}
              disabled={!canEdit}
            >
              <option value="email">Email</option>
              <option value="slack">Slack</option>
            </select>
          </div>
        )}
      </div>

      {/* Email Configuration */}
      {messagingConfig.enabled && messagingConfig.channel === 'email' && (
        <div className="config-group">
          <h3>📧 Email Configuration</h3>
          
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={messagingConfig.email.enabled}
                onChange={(e) => setMessagingConfig({
                  ...messagingConfig,
                  email: {
                    ...messagingConfig.email,
                    enabled: e.target.checked
                  }
                })}
                disabled={!canEdit}
              />
              Enable Email Notifications
            </label>
          </div>

          {messagingConfig.email.enabled && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label>SMTP Host *</label>
                  <input
                    type="text"
                    placeholder="smtp.gmail.com"
                    value={messagingConfig.email.smtpHost}
                    onChange={(e) => setMessagingConfig({
                      ...messagingConfig,
                      email: {
                        ...messagingConfig.email,
                        smtpHost: e.target.value
                      }
                    })}
                    disabled={!canEdit}
                  />
                </div>
                <div className="form-group">
                  <label>SMTP Port *</label>
                  <input
                    type="number"
                    placeholder="587"
                    value={messagingConfig.email.smtpPort}
                    onChange={(e) => setMessagingConfig({
                      ...messagingConfig,
                      email: {
                        ...messagingConfig.email,
                        smtpPort: parseInt(e.target.value) || 587
                      }
                    })}
                    disabled={!canEdit}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={messagingConfig.email.smtpSecure}
                    onChange={(e) => setMessagingConfig({
                      ...messagingConfig,
                      email: {
                        ...messagingConfig.email,
                        smtpSecure: e.target.checked
                      }
                    })}
                    disabled={!canEdit}
                  />
                  Use SSL/TLS (check for port 465)
                </label>
                <div style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#666' }}>
                  <strong>Port Configuration Guide:</strong><br/>
                  • Port 587 (STARTTLS): Uncheck SSL/TLS ✓<br/>
                  • Port 465 (SSL/TLS): Check SSL/TLS ✓<br/>
                  • Port 25 (Plain SMTP): Uncheck SSL/TLS
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>SMTP Username *</label>
                  <input
                    type="text"
                    placeholder="your-email@example.com"
                    value={messagingConfig.email.smtpUser}
                    onChange={(e) => setMessagingConfig({
                      ...messagingConfig,
                      email: {
                        ...messagingConfig.email,
                        smtpUser: e.target.value
                      }
                    })}
                    disabled={!canEdit}
                  />
                </div>
                <div className="form-group">
                  <label>SMTP Password *</label>
                  <input
                    type="password"
                    placeholder="Your email password or app password"
                    value={messagingConfig.email.smtpPassword}
                    onChange={(e) => setMessagingConfig({
                      ...messagingConfig,
                      email: {
                        ...messagingConfig.email,
                        smtpPassword: e.target.value
                      }
                    })}
                    disabled={!canEdit}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>From Email *</label>
                  <input
                    type="email"
                    placeholder="noreply@example.com"
                    value={messagingConfig.email.fromEmail}
                    onChange={(e) => setMessagingConfig({
                      ...messagingConfig,
                      email: {
                        ...messagingConfig.email,
                        fromEmail: e.target.value
                      }
                    })}
                    disabled={!canEdit}
                  />
                </div>
                <div className="form-group">
                  <label>From Name</label>
                  <input
                    type="text"
                    placeholder="OSCAL Report Generator"
                    value={messagingConfig.email.fromName}
                    onChange={(e) => setMessagingConfig({
                      ...messagingConfig,
                      email: {
                        ...messagingConfig.email,
                        fromName: e.target.value
                      }
                    })}
                    disabled={!canEdit}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Login URL</label>
                <input
                  type="url"
                  placeholder="https://your-platform-url"
                  value={messagingConfig.email.loginUrl}
                  onChange={(e) => setMessagingConfig({
                    ...messagingConfig,
                    email: {
                      ...messagingConfig.email,
                      loginUrl: e.target.value
                    }
                  })}
                  disabled={!canEdit}
                />
                <small>URL where users can log in (included in email)</small>
              </div>

              {canEdit && (
                <button
                  type="button"
                  className="btn-test"
                  onClick={handleTestEmail}
                  disabled={saving}
                >
                  🧪 Test Email Configuration
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Slack Configuration */}
      {messagingConfig.enabled && messagingConfig.channel === 'slack' && (
        <div className="config-group">
          <h3>💬 Slack Configuration</h3>
          
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={messagingConfig.slack.enabled}
                onChange={(e) => setMessagingConfig({
                  ...messagingConfig,
                  slack: {
                    ...messagingConfig.slack,
                    enabled: e.target.checked
                  }
                })}
                disabled={!canEdit}
              />
              Enable Slack Notifications
            </label>
          </div>

          {messagingConfig.slack.enabled && (
            <>
              <div className="form-group">
                <label>Slack Webhook URL *</label>
                <input
                  type="url"
                  placeholder="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
                  value={messagingConfig.slack.webhookUrl}
                  onChange={(e) => setMessagingConfig({
                    ...messagingConfig,
                    slack: {
                      ...messagingConfig.slack,
                      webhookUrl: e.target.value
                    }
                  })}
                  disabled={!canEdit}
                />
                <small>
                  Create a webhook at{' '}
                  <a href="https://api.slack.com/messaging/webhooks" target="_blank" rel="noopener noreferrer">
                    api.slack.com/messaging/webhooks
                  </a>
                </small>
              </div>

              <div className="form-group">
                <label>Slack Channel</label>
                <input
                  type="text"
                  placeholder="#general"
                  value={messagingConfig.slack.channel}
                  onChange={(e) => setMessagingConfig({
                    ...messagingConfig,
                    slack: {
                      ...messagingConfig.slack,
                      channel: e.target.value
                    }
                  })}
                  disabled={!canEdit}
                />
                <small>Channel name (e.g., #general) - optional, webhook determines channel</small>
              </div>

              {canEdit && (
                <button
                  type="button"
                  className="btn-test"
                  onClick={handleTestSlack}
                  disabled={saving}
                >
                  🧪 Test Slack Configuration
                </button>
              )}
            </>
          )}
        </div>
      )}

      {canEdit && (
        <div className="config-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? '💾 Saving...' : '💾 Save Configuration'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={loadMessagingConfig}
            disabled={saving}
          >
            🔄 Reset
          </button>
        </div>
      )}
    </div>
  );
}

export default MessagingConfiguration;

