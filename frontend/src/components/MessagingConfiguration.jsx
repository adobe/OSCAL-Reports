/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import React, { useState, useEffect } from 'react';
import axios from '../utils/safeAxios.js';
import { useAuth } from '../contexts/AuthContext';
import './MessagingConfiguration.css';

const MASK = '********';

function normalizeSecretField(value) {
  if (value == null) return '';
  if (typeof value === 'string') {
    return value === MASK || value === '********' ? '' : value;
  }
  if (typeof value === 'object') return '';
  return value;
}

function MessagingConfiguration({ embedded = false }) {
  const { canManageUsers, getAuthConfig } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);
  const [messagingConfig, setMessagingConfig] = useState({
    enabled: false,
    channel: 'slack',
    slack: {
      enabled: false,
      webhookUrl: '',
      channel: '#general',
    },
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
        channel: 'slack',
        slack: {
          enabled: false,
          webhookUrl: '',
          channel: '#general',
        },
      };
      setMessagingConfig({
        enabled: !!config.enabled,
        channel: 'slack',
        slack: {
          enabled: !!config.slack?.enabled,
          webhookUrl: config.slack?.webhookUrl || '',
          channel: config.slack?.channel || '#general',
        },
      });

      if (response.data.lastModified) {
        setLastSaved(response.data.lastModified);
      }

      setMessage('');
      setVerificationStatus(null);
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
      setVerificationStatus(null);

      const response = await axios.get('/api/settings', getAuthConfig());
      const currentConfig = response.data;

      const updatedConfig = {
        ...currentConfig,
        messagingConfig: {
          enabled: messagingConfig.enabled,
          channel: 'slack',
          slack: messagingConfig.slack,
        },
      };

      const saveResponse = await axios.post('/api/settings', updatedConfig, getAuthConfig());

      const verification = saveResponse.data.verification;
      if (verification) {
        setVerificationStatus({
          verified: verification.verified,
          timestamp: verification.timestamp,
          discrepancies: verification.discrepancies,
          warning: verification.warning,
        });
        setLastSaved(verification.timestamp);

        if (verification.verified) {
          setMessage('✅ Configuration saved and verified on disk');
        } else {
          setMessage('⚠️ Configuration saved but verification found issues - please check and re-save');
          console.warn('Verification discrepancies:', verification.discrepancies);
        }
      } else {
        setMessage('✅ Slack messaging configuration saved successfully');
      }

      await loadMessagingConfig();

      setTimeout(() => {
        setMessage('');
        setVerificationStatus(null);
      }, 8000);
    } catch (error) {
      console.error('Failed to save messaging config:', error);
      setMessage('❌ Failed to save messaging configuration: ' + (error.response?.data?.error || error.message));
      setVerificationStatus({ verified: false, error: true });
    } finally {
      setSaving(false);
    }
  };

  const handleTestSlack = async () => {
    try {
      setTesting(true);
      const response = await axios.post('/api/messaging/test-slack',
        {
          slackConfig: {
            ...messagingConfig.slack,
            webhookUrl: normalizeSecretField(messagingConfig.slack.webhookUrl),
          },
        },
        getAuthConfig());
      if (response.data.success) {
        setMessage('✅ Slack test successful - Check your Slack channel');
      } else {
        setMessage('❌ Slack test failed: ' + response.data.error);
      }
    } catch (error) {
      setMessage('❌ Slack test failed: ' + (error.response?.data?.error || error.message));
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading Slack messaging configuration...</div>;
  }

  const canEdit = canManageUsers();

  return (
    <div className={`messaging-config-container ${embedded ? 'embedded' : ''}`} style={{ display: 'block', visibility: 'visible', opacity: 1 }}>
      {!embedded && (
        <div className="messaging-config-header">
          <h2>💬 Slack Notifications</h2>
          <p className="section-description">
            Configure Slack to automatically send user credentials when new users are created. Use <strong>Test</strong> with the values in this form (nothing is saved until you click Save Configuration).
          </p>
        </div>
      )}

      {embedded && (
        <div className="messaging-config-header" style={{ padding: '1rem 1.5rem', borderBottom: '1px solid #e0e0e0', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: '0 0 0.5rem 0', color: '#1976d2' }}>💬 Slack Notifications</h3>
          <p className="section-description" style={{ margin: 0, fontSize: '0.9rem' }}>
            Configure Slack to automatically send user credentials when new users are created. Use <strong>Test</strong> with the values in this form (nothing is saved until you click Save Configuration).
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
            {verificationStatus.discrepancies && (
              <div className="verification-warning">
                Issues found: {verificationStatus.discrepancies.join(', ')}
              </div>
            )}
          </div>
        </div>
      )}

      {lastSaved && !verificationStatus && (
        <div className="last-saved-indicator">
          <span className="last-saved-icon">💾</span>
          <span>Last saved: {new Date(lastSaved).toLocaleString()}</span>
        </div>
      )}

      <div className="config-group">
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={messagingConfig.enabled}
              onChange={(e) => setMessagingConfig({
                ...messagingConfig,
                enabled: e.target.checked,
              })}
              disabled={!canEdit}
            />
            Enable Slack messaging (send credentials when users are created)
          </label>
        </div>
      </div>

      {messagingConfig.enabled && (
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
                    enabled: e.target.checked,
                  },
                })}
                disabled={!canEdit}
              />
              Enable Slack Notifications
            </label>
          </div>

          {(messagingConfig.slack.enabled || canEdit) && (
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
                      webhookUrl: e.target.value,
                    },
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
                      channel: e.target.value,
                    },
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
                  disabled={saving || testing}
                >
                  {testing ? '⏳ Testing…' : '🧪 Test Slack Configuration'}
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
            disabled={saving || testing}
          >
            {saving ? '💾 Saving...' : '💾 Save Configuration'}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={loadMessagingConfig}
            disabled={saving || testing}
          >
            🔄 Reset
          </button>
        </div>
      )}
    </div>
  );
}

export default MessagingConfiguration;
