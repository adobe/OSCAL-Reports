/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    // Inject build timestamp at build time
    'import.meta.env.VITE_BUILD_TIME': JSON.stringify(new Date().toISOString()),
  },
  server: {
    port: 3021,
    allowedHosts: ['keekar.3utilities.com', 'oscal.keekar.au'],
    proxy: {
      '/api': {
        target: 'http://localhost:3020',
        // Keep changeOrigin so the upstream connection works; backend uses X-Forwarded-* to build Okta redirect_uri
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const host = req.headers.host;
            if (host) {
              proxyReq.setHeader('X-Forwarded-Host', host);
              proxyReq.setHeader('X-Forwarded-Proto', req.socket?.encrypted ? 'https' : 'http');
            }
          });
        },
      },
    },
  }
})

