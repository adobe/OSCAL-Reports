/**
 * Settings Component with Tabs
 * Includes API Gateway Settings and SSO Integration
 */

import React, { useState } from 'react';
import Settings from './Settings';
import SSOIntegration from './SSOIntegration';
import MessagingConfiguration from './MessagingConfiguration';
import AIIntegration from './AIIntegration';
import { useAuth } from '../contexts/AuthContext';
import './SettingsWithTabs.css';

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
          🌐 API Gateway
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
      </div>

      <div className="settings-tabs-content" style={{ minHeight: '500px', position: 'relative', background: 'white' }}>
        {activeTab === 'api-gateway' && <Settings />}
        {activeTab === 'sso' && (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1, background: 'white' }}>
            <SSOIntegration embedded={true} />
          </div>
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
      </div>
    </div>
  );
}

export default SettingsWithTabs;

