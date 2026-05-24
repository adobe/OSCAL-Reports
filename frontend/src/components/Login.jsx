/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from '../utils/safeAxios.js';
import './Login.css';

const Login = () => {
  const { login, error: authError } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSelfRegistration, setShowSelfRegistration] = useState(true);
  const [registerEmail, setRegisterEmail] = useState('');
  const [registrationMessage, setRegistrationMessage] = useState('');
  const [registrationSuccess, setRegistrationSuccess] = useState(false);

  // Show error from URL (e.g. ?error=okta_not_configured after Okta redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlError = params.get('error');
    if (urlError === 'okta_not_configured') {
      setError('Okta sign-in is not configured. Enable OAuth and Okta in Settings → SSO Integration.');
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(username, password);
    
    if (!result.success) {
      setError(result.error || 'Login failed');
    }
    
    setLoading(false);
  };

  const handleSelfRegister = async (e) => {
    e.preventDefault();
    setRegistrationMessage('');
    setRegistrationSuccess(false);
    setLoading(true);
    
    try {
      const response = await axios.post('/api/auth/self-register', { 
        email: registerEmail 
      });
      
      if (response.data.success) {
        setRegistrationSuccess(true);
        setRegistrationMessage(response.data.message || '✅ Registration successful! Check your email for credentials.');
        setRegisterEmail('');
      } else {
        setRegistrationSuccess(false);
        setRegistrationMessage(response.data.message || 'Registration failed');
      }
    } catch (error) {
      setRegistrationSuccess(false);
      setRegistrationMessage(error.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <h1>🔐 Keekar's OSCAL Generator <span className="beta-badge" title="Beta Release">Beta</span></h1>
          <p>Please sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
              autoComplete="username"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
              disabled={loading}
            />
          </div>

          {(error || authError) && (
            <div className="error-message">
              ⚠️ {error || authError}
            </div>
          )}

          <button 
            type="submit" 
            className="login-button"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <div className="login-divider" style={{ margin: '1rem 0', textAlign: 'center', color: '#666', fontSize: '0.9rem' }}>
            — or —
          </div>
          <a
            href="/api/auth/okta/authorize"
            className="login-button okta-login-btn"
            style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: '0.5rem' }}
          >
            Sign in with Okta
          </a>
        </form>

        {showSelfRegistration && (
          <div className="self-registration-panel">
            <div className="registration-header">
              <span>📝 New User Registration</span>
              <button 
                className="close-btn"
                onClick={() => setShowSelfRegistration(false)}
                title="Close"
              >
                ×
              </button>
            </div>
            <p className="registration-description">
              Don't have an account? Register with your email:
            </p>
            
            <form onSubmit={handleSelfRegister} className="registration-form">
              <input 
                type="email" 
                placeholder="your.email@example.com"
                value={registerEmail}
                onChange={(e) => setRegisterEmail(e.target.value)}
                disabled={loading}
                required
                className="registration-input"
              />
              <button 
                type="submit" 
                className="registration-btn"
                disabled={loading}
              >
                {loading ? 'Registering...' : 'Register'}
              </button>
            </form>
            
            <div className="registration-info">
              ℹ️ You will receive your password via email.<br/>
              Accounts inactive for 45+ days are automatically deactivated.
            </div>
            
            <div className="beta-release-banner">
              <a 
                href="https://keekar.3utilities.com/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="beta-link"
              >
                🚀 Try Beta Release & Give Feedback
              </a>
            </div>
            
            {registrationMessage && (
              <div className={`registration-message ${registrationSuccess ? 'success' : 'error'}`}>
                {registrationMessage}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;

