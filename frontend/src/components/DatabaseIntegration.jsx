/**
 * Database Integration - Platform Settings tab
 * Configure PostgreSQL (or AWS RDS) connection for schema-less extended data storage.
 *
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license GPL-3.0-or-later
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import './DatabaseIntegration.css';

const MASK = '********';

const defaultDatabaseConfig = {
  enabled: false,
  host: '',
  port: 5432,
  database: '',
  user: '',
  password: '',
  authMode: 'password',
  sslMode: 'disable',
  connectionTimeout: 10000
};

function DatabaseIntegration({ embedded = false }) {
  const { canManageUsers, getAuthConfig } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);
  const [databaseConfig, setDatabaseConfig] = useState({ ...defaultDatabaseConfig });

  useEffect(() => {
    loadDatabaseConfig();
  }, []);

  const loadDatabaseConfig = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/settings', getAuthConfig());
      const cfg = response.data.databaseConfig || defaultDatabaseConfig;
      setDatabaseConfig({
        ...defaultDatabaseConfig,
        ...cfg,
        port: cfg.port ?? 5432,
        connectionTimeout: cfg.connectionTimeout ?? 10000,
        authMode: cfg.authMode === 'iam' ? 'iam' : 'password'
      });
      if (response.data.lastModified) {
        setLastSaved(response.data.lastModified);
      }
      setMessage('');
      setVerificationStatus(null);
    } catch (error) {
      console.error('Failed to load database config:', error);
      setMessage('Failed to load database configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!canManageUsers()) {
      setMessage('You do not have permission to save database configuration');
      return;
    }
    try {
      setSaving(true);
      setVerificationStatus(null);
      const response = await axios.get('/api/settings', getAuthConfig());
      const currentConfig = response.data;
      const updatedConfig = {
        ...currentConfig,
        databaseConfig
      };
      const saveResponse = await axios.post('/api/settings', updatedConfig, getAuthConfig());
      const verification = saveResponse.data.verification;
      if (verification) {
        setVerificationStatus({
          verified: verification.verified,
          timestamp: verification.timestamp,
          configPath: verification.configPath,
          discrepancies: verification.discrepancies,
          warning: verification.warning
        });
        setLastSaved(verification.timestamp);
        setMessage(verification.verified ? 'Configuration saved and verified on disk' : 'Configuration saved; verification found issues.');
      } else {
        setMessage('Database configuration saved successfully');
      }
      await loadDatabaseConfig();
      setTimeout(() => {
        setMessage('');
        setVerificationStatus(null);
      }, 8000);
    } catch (error) {
      console.error('Failed to save database config:', error);
      setMessage('Failed to save database configuration: ' + (error.response?.data?.error || error.message));
      setVerificationStatus({ verified: false, error: true });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!databaseConfig.enabled || !databaseConfig.host || !databaseConfig.database) {
      setMessage('Enable integration and set Host and Database name, then save before testing.');
      return;
    }
    try {
      setSaving(true);
      setMessage('Testing connection...');
      const response = await axios.post('/api/database/test-connection', {}, getAuthConfig());
      if (response.data.success) {
        setMessage('Database connection test successful');
      } else {
        setMessage('Connection test failed: ' + (response.data.error || 'Unknown error'));
      }
      setTimeout(() => setMessage(''), 5000);
    } catch (error) {
      setMessage('Connection test failed: ' + (error.response?.data?.error || error.message));
      setTimeout(() => setMessage(''), 8000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="database-integration-loading">Loading database configuration...</div>;
  }

  const canEdit = canManageUsers();

  return (
    <div className={`database-integration-container ${embedded ? 'embedded' : ''}`}>
      {embedded && (
        <div className="database-integration-header">
          <h3>Database Integration</h3>
          <p className="section-description">
            Configure PostgreSQL or AWS RDS for storing custom and organisational context fields. Connection can be tested after saving.
          </p>
        </div>
      )}

      {!canEdit && (
        <div className="read-only-banner">
          Read-only: You do not have permission to edit database configuration.
        </div>
      )}

      {message && (
        <div className={`message ${message.startsWith('Database connection test successful') || message.startsWith('Configuration saved') || (message.includes('saved successfully') && !message.includes('Failed')) ? 'success' : message.includes('Read-only') ? 'warning' : 'error'}`}>
          {message}
        </div>
      )}

      {verificationStatus && (
        <div className={`verification-status ${verificationStatus.verified ? 'verified' : 'warning'}`}>
          <div className="verification-header">
            {verificationStatus.verified ? <><span className="verification-icon">OK</span><strong>Disk verification passed</strong></> : <><span className="verification-icon">!</span><strong>Verification warning</strong></>}
          </div>
          {verificationStatus.timestamp && <div className="verification-details">Saved at: {new Date(verificationStatus.timestamp).toLocaleString()}</div>}
        </div>
      )}

      {lastSaved && !verificationStatus && (
        <div className="last-saved-indicator">
          Last saved: {new Date(lastSaved).toLocaleString()}
        </div>
      )}

      <div className="config-group">
        <div className="form-group">
          <label>
            <input
              type="checkbox"
              checked={databaseConfig.enabled}
              onChange={(e) => setDatabaseConfig({ ...databaseConfig, enabled: e.target.checked })}
              disabled={!canEdit}
            />
            Enable Database Integration
          </label>
          <small>When enabled, custom fields and organisational context can be stored in the configured database (PostgreSQL or AWS RDS).</small>
        </div>

        {databaseConfig.enabled && (
          <>
            <div className="form-group">
              <label>Authentication</label>
              <select
                value={databaseConfig.authMode === 'iam' ? 'iam' : 'password'}
                onChange={(e) =>
                  setDatabaseConfig({
                    ...databaseConfig,
                    authMode: e.target.value,
                    password: e.target.value === 'iam' ? '' : databaseConfig.password
                  })
                }
                disabled={!canEdit}
              >
                <option value="password">Username and password</option>
                <option value="iam">AWS RDS IAM database authentication</option>
              </select>
              <small>
                IAM mode uses the instance or task role (no static DB password). Use &quot;Require&quot; SSL for RDS.
              </small>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Host *</label>
                <input
                  type="text"
                  placeholder="localhost or RDS endpoint"
                  value={databaseConfig.host}
                  onChange={(e) => setDatabaseConfig({ ...databaseConfig, host: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
              <div className="form-group">
                <label>Port</label>
                <input
                  type="number"
                  placeholder="5432"
                  value={databaseConfig.port}
                  onChange={(e) => setDatabaseConfig({ ...databaseConfig, port: parseInt(e.target.value, 10) || 5432 })}
                  disabled={!canEdit}
                />
                <small>Default: 5432</small>
              </div>
            </div>

            <div className="form-group">
              <label>Database name *</label>
              <input
                type="text"
                placeholder="oscal_extended"
                value={databaseConfig.database}
                onChange={(e) => setDatabaseConfig({ ...databaseConfig, database: e.target.value })}
                disabled={!canEdit}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>User</label>
                <input
                  type="text"
                  placeholder={databaseConfig.authMode === 'iam' ? 'RDS IAM DB user' : 'postgres'}
                  value={databaseConfig.user}
                  onChange={(e) => setDatabaseConfig({ ...databaseConfig, user: e.target.value })}
                  disabled={!canEdit}
                />
              </div>
              {databaseConfig.authMode !== 'iam' && (
                <div className="form-group">
                  <label>Password</label>
                  <input
                    type="password"
                    placeholder={databaseConfig.password === MASK ? MASK : 'Leave blank to keep current'}
                    value={databaseConfig.password === MASK ? '' : databaseConfig.password}
                    onChange={(e) => setDatabaseConfig({ ...databaseConfig, password: e.target.value })}
                    disabled={!canEdit}
                    autoComplete="new-password"
                  />
                  <small>Leave blank to keep existing password.</small>
                </div>
              )}
            </div>

            <div className="form-group">
              <label>SSL mode</label>
              <select
                value={databaseConfig.sslMode || 'disable'}
                onChange={(e) => setDatabaseConfig({ ...databaseConfig, sslMode: e.target.value })}
                disabled={!canEdit}
              >
                <option value="disable">Disable</option>
                <option value="prefer">Prefer</option>
                <option value="require">Require</option>
              </select>
              <small>Use &quot;Require&quot; for AWS RDS or production.</small>
            </div>

            <div className="form-group">
              <label>Connection timeout (ms)</label>
              <input
                type="number"
                placeholder="10000"
                value={databaseConfig.connectionTimeout ?? 10000}
                onChange={(e) => setDatabaseConfig({ ...databaseConfig, connectionTimeout: parseInt(e.target.value, 10) || 10000 })}
                disabled={!canEdit}
              />
              <small>Default: 10000 (10 seconds).</small>
            </div>

            {databaseConfig.enabled && (
              <div className="config-actions">
                <button type="button" className="btn-test" onClick={handleTestConnection} disabled={!canEdit || saving}>
                  Test connection
                </button>
              </div>
            )}
          </>
        )}

        <div className="config-actions" style={{ marginTop: '1rem' }}>
          <button type="button" className="btn-primary" onClick={handleSave} disabled={!canEdit || saving}>
            {saving ? 'Saving...' : 'Save configuration'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default DatabaseIntegration;
