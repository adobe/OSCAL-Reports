/**
 * Settings Component with Tabs
 * Includes API Gateway Settings and SSO Integration
 */

import React, { useState } from 'react';
import Settings from './Settings';
import SSOIntegration from './SSOIntegration';
import MessagingConfiguration from './MessagingConfiguration';
import AIIntegration from './AIIntegration';
import DatabaseIntegration from './DatabaseIntegration';
import { useAuth } from '../contexts/AuthContext';
import './SettingsWithTabs.css';

/** Error boundary so a tab (e.g. SSO) does not leave a blank screen on render error */
class TabErrorBoundary extends React.Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('Tab content error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      const err = this.state.error;
      const message = err?.message || (err && String(err)) || 'Unknown error';
      return (
        <div style={{ padding: '2rem', minHeight: '300px', background: '#fff8f8', border: '1px solid #fcc', borderRadius: 8 }}>
          <h3 style={{ color: '#c00', marginTop: 0 }}>Something went wrong loading this tab</h3>
          <p style={{ color: '#666' }}>If the problem persists, check the browser console or try refreshing.</p>
          <details style={{ marginTop: '1rem', fontSize: '0.9rem', color: '#555' }}>
            <summary style={{ cursor: 'pointer' }}>Error details</summary>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: '0.5rem', padding: '0.75rem', background: '#f5f5f5', borderRadius: 4 }}>{message}</pre>
          </details>
          <button type="button" className="btn-secondary" style={{ marginTop: '1rem' }} onClick={() => this.setState({ hasError: false, error: null })}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function SettingsWithTabs({ onClose }) {
  const { canManageUsers } = useAuth();
  const [activeTab, setActiveTab] = useState('api-gateway');

  return (
    <div className="settings-tabs-container">
      <div className="settings-tabs-header">
        <h2>⚙️ Platform Settings</h2>
        {onClose && (
          <button className="settings-close-btn" onClick={onClose}>✖</button>
        )}
      </div>

      <div className="settings-tabs-nav">
        <button
          className={`settings-tab-btn ${activeTab === 'api-gateway' ? 'active' : ''}`}
          onClick={() => setActiveTab('api-gateway')}
        >
          🌐 API Gateways and Information Catalogue Store
        </button>
        <button
          className={`settings-tab-btn ${activeTab === 'sso' ? 'active' : ''}`}
          onClick={() => setActiveTab('sso')}
        >
          🔐 SSO Integration
        </button>
        <button
          className={`settings-tab-btn ${activeTab === 'messaging' ? 'active' : ''}`}
          onClick={() => setActiveTab('messaging')}
        >
          📧 Messaging
        </button>
        <button
          className={`settings-tab-btn ${activeTab === 'ai' ? 'active' : ''}`}
          onClick={() => setActiveTab('ai')}
        >
          🤖 AI Integration
        </button>
        <button
          className={`settings-tab-btn ${activeTab === 'database' ? 'active' : ''}`}
          onClick={() => setActiveTab('database')}
        >
          🗄️ Database
        </button>
      </div>

      <div className="settings-tabs-content" style={{ minHeight: '500px', position: 'relative', background: 'white' }}>
        {activeTab === 'api-gateway' && <Settings />}
        {activeTab === 'sso' && (
          <TabErrorBoundary>
            <div style={{ width: '100%', minHeight: '450px', flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1, background: 'white' }}>
              <SSOIntegration embedded={true} />
            </div>
          </TabErrorBoundary>
        )}
        {activeTab === 'messaging' && (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1, background: 'white' }}>
            <MessagingConfiguration embedded={true} />
          </div>
        )}
        {activeTab === 'ai' && (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1, background: 'white' }}>
            <AIIntegration embedded={true} />
          </div>
        )}
        {activeTab === 'database' && (
          <TabErrorBoundary>
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1, background: 'white' }}>
              <DatabaseIntegration embedded={true} />
            </div>
          </TabErrorBoundary>
        )}
      </div>
    </div>
  );
}

export default SettingsWithTabs;

