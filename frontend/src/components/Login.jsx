/**
 * Login Component
 * Provides user authentication interface
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { getDefaultPasswords } from '../utils/passwordGenerator';
import './Login.css';

const Login = () => {
  const { login, error: authError } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showDefaultCredentials, setShowDefaultCredentials] = useState(true);
  const [defaultPasswords, setDefaultPasswords] = useState(() => getDefaultPasswords()); // Fallback to local generation

  // Fetch default passwords from backend to ensure they match
  useEffect(() => {
    axios.get('/api/auth/default-credentials')
      .then(response => {
        if (response.data.success && response.data.passwords) {
          setDefaultPasswords(response.data.passwords);
        }
      })
      .catch(error => {
        console.warn('Could not fetch default credentials from backend, using local generation:', error);
        // Keep the fallback passwords generated locally
      });
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

  const fillCredentials = (role) => {
    switch(role) {
      case 'user':
        setUsername('user');
        setPassword(defaultPasswords.user);
        break;
      case 'assessor':
        setUsername('assessor');
        setPassword(defaultPasswords.assessor);
        break;
      default:
        break;
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <h1>🔐 Keekar's OSCAL Generator</h1>
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
        </form>

        {showDefaultCredentials && (
          <div className="default-credentials">
            <div className="credentials-header">
              <span>🔑 Default Test Credentials</span>
              <button 
                className="close-btn"
                onClick={() => setShowDefaultCredentials(false)}
                title="Close"
              >
                ×
              </button>
            </div>
            <div className="credentials-list">
              <div className="credential-item platform-admin-notice">
                <div className="credential-info">
                  <strong>Platform Admin</strong>
                  <span className="admin-message">Please get in touch with platform administrator to get the Platform Admin credential.</span>
                </div>
              </div>
              <div className="credential-item">
                <div className="credential-info">
                  <strong>User</strong>
                  <span>user / {defaultPasswords.user}</span>
                </div>
                <button 
                  type="button"
                  onClick={() => fillCredentials('user')}
                  className="fill-btn"
                  disabled={loading}
                >
                  Use
                </button>
              </div>
              <div className="credential-item">
                <div className="credential-info">
                  <strong>Assessor</strong>
                  <span>assessor / {defaultPasswords.assessor}</span>
                </div>
                <button 
                  type="button"
                  onClick={() => fillCredentials('assessor')}
                  className="fill-btn"
                  disabled={loading}
                >
                  Use
                </button>
              </div>
            </div>
            <div className="credentials-note">
                    ℹ️ These are default credentials for testing. Passwords use timestamp format (username#DDMMYYHH). Change them in production.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;

