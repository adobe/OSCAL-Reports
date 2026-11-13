/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/layout.css'
import './index.css'

const root = ReactDOM.createRoot(document.getElementById('root'));
const isLocalGuardianDemo = import.meta.env.DEV &&
  window.location.pathname === '/guardian-local-demo';

if (isLocalGuardianDemo) {
  import('./components/GuardianLocalIntegrationDemo.jsx').then(({ default: Demo }) => {
    root.render(<React.StrictMode><Demo /></React.StrictMode>);
  });
} else {
  root.render(<React.StrictMode><App /></React.StrictMode>);
}
