/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import axios from '../utils/safeAxios.js';
import './Login.css';

const Login = () => {
  const { login, error: authError } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [loginProviders, setLoginProviders] = useState([]);
  const [showExpeditedAccessPolicy, setShowExpeditedAccessPolicy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlError = params.get('error');
    if (urlError === 'okta_not_configured') {
      setError('Okta sign-in is not configured. Enable OAuth and Okta in Settings → SSO Integration.');
    } else if (urlError === 'generic_oidc_not_configured') {
      setError('Generic SSO is not configured or the redirect URI is not allowed for this host.');
    }
  }, []);

  useEffect(() => {
    axios
      .get('/api/auth/sso/login-providers')
      .then((res) => {
        const list = Array.isArray(res.data?.providers) ? res.data.providers : [];
        const order = { okta: 0, Generic_OIDC: 1 };
        list.sort((a, b) => (order[a.id] ?? 99) - (order[b.id] ?? 99));
        setLoginProviders(list);
        setShowExpeditedAccessPolicy(res.data?.showExpeditedAccessPolicy === true);
      })
      .catch(() => setLoginProviders([]));
  }, []);

  const oktaProvider = useMemo(
    () => loginProviders.find((p) => p.id === 'okta'),
    [loginProviders],
  );
  const genericProvider = useMemo(
    () => loginProviders.find((p) => p.id === 'Generic_OIDC'),
    [loginProviders],
  );
  const showOktaDivider = Boolean(oktaProvider);

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

          {showOktaDivider && (
            <>
              <div className="login-divider">— or —</div>
              <a
                href={oktaProvider.authorizeUrl}
                className="login-button okta-login-btn login-sso-link"
              >
                Sign in with {oktaProvider.displayName || 'Okta'}
              </a>
            </>
          )}
          {!oktaProvider && loginProviders.length === 0 && (
            <p className="login-sso-unavailable">
              SSO providers are not enabled. Use username/password or ask an administrator.
            </p>
          )}
        </form>

        {genericProvider && (
          <div className="login-access-panel">
            <a
              href={genericProvider.authorizeUrl}
              className="login-button generic-oidc-login-btn login-access-sso-btn"
            >
              Sign in with Generic SSO
            </a>
            <div className="login-access-info">
              <p className="login-access-info-lead">
                ℹ️ <strong>Access:</strong> Admission is limited to a modest cohort of fifteen concurrent
                users.
              </p>
              <p>
                <strong>Capacity constraint:</strong> The sixteenth aspirant must await vacancy,
                occasioned only when an account lapses into dormancy after thirty days of inactivity.
              </p>
              <p>
                <strong>Registration:</strong> The erstwhile regime of email-based self-registration
                (with credentials ferried via SMTP) now yields to a sleeker orthodoxy—Generic SSO via
                Authentik, enabling social sign-in and passwordless access. Correspondingly, messaging
                and SMTP configurations shall soon be consigned to obsolescence.
              </p>
              {showExpeditedAccessPolicy && (
                <p>
                  <strong>Expedited entry (optional):</strong> Those disinclined to linger in the queue
                  may solicit immediate admission from the application proprietor for an annual
                  consideration of <strong>AUD $12</strong>—merely to defray the shared Authentik licence
                  underpinning social SSO and passwordless capabilities. This is less a mercenary
                  indulgence than a practical concession to finite resources.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Login;
