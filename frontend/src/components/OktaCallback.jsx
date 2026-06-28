/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import React, { useEffect, useRef, useState } from 'react';
import axios from '../utils/safeAxios.js';
import { useAuth } from '../contexts/AuthContext';
import './Login.css';

function OktaCallback() {
  const { completeOidcLogin } = useAuth();
  const [status, setStatus] = useState('exchanging'); // exchanging | success | error
  const [errorMessage, setErrorMessage] = useState('');
  const exchangeStarted = useRef(false);

  useEffect(() => {
    if (exchangeStarted.current) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    if (error) {
      setStatus('error');
      setErrorMessage(params.get('error_description') || error || 'Okta sign-in was cancelled or failed.');
      return;
    }
    if (!code || !state) {
      setStatus('error');
      setErrorMessage('Missing code or state from Okta. Please try signing in again.');
      return;
    }

    exchangeStarted.current = true;
    // CSRF: fetch token then POST so exchange-token is protected (Snyk UseCsurfForExpress)
    axios
      .get('/api/csrf-token', { withCredentials: true })
      .then((csrfRes) => {
        const csrfToken = csrfRes.data?.csrfToken || '';
        return axios.post(
          '/api/auth/okta/exchange-token',
          { code, state },
          {
            headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
            withCredentials: true,
          }
        );
      })
      .then((res) => {
        if (res.data?.success && res.data?.user && res.data?.sessionToken) {
          completeOidcLogin(res.data.user, res.data.sessionToken);
          setStatus('success');
          window.location.href = '/';
        } else {
          setStatus('error');
          setErrorMessage(res.data?.error || 'Sign-in failed.');
        }
      })
      .catch((err) => {
        const msg = err.response?.data?.error || err.message || 'Okta sign-in failed.';
        setStatus('error');
        const isStateError = msg && msg.includes('Invalid or expired state');
        const isCodeExpired = msg && (msg.includes('Code may be expired') || msg.toLowerCase().includes('authorization code') && msg.toLowerCase().includes('expired'));
        let displayMessage = msg;
        if (isStateError) {
          displayMessage = "The sign-in link may have expired or the server restarted. Click 'Back to sign in' below and try 'Sign in with Okta' again.";
        } else if (isCodeExpired) {
          displayMessage = "Sign-in took too long (authorization code expired). Click 'Back to sign in' and complete Okta sign-in within a minute.";
        }
        setErrorMessage(displayMessage);
      });
  }, [completeOidcLogin]);

  if (status === 'exchanging') {
    return (
      <div className="login-container">
        <div className="login-box">
          <div className="login-header">
            <h1>🔐 Signing you in</h1>
            <p>Completing Okta sign-in…</p>
          </div>
          <div style={{ padding: '1rem', textAlign: 'center', color: '#666' }}>
            Please wait.
          </div>
        </div>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="login-container">
        <div className="login-box">
          <div className="login-header">
            <h1>✅ Signed in</h1>
            <p>Redirecting to the app…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-header">
          <h1>🔐 Okta sign-in</h1>
          <p>Something went wrong</p>
        </div>
        <div className="error-message" style={{ margin: '1rem 0' }}>
          {errorMessage}
        </div>
        <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)', marginTop: '0.75rem' }}>
          If this keeps happening, ensure the app URL matches the Okta redirect URI (Settings → SSO → Okta) and complete sign-in within a minute.
        </p>
        <a href="/" className="login-button" style={{ display: 'inline-block', textAlign: 'center', textDecoration: 'none' }}>
          Back to sign in
        </a>
      </div>
    </div>
  );
}

export default OktaCallback;
