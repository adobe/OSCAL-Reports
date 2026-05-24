/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.PORT = '3999'; // Different port for testing
process.env.BUILD_TIMESTAMP = '2025-12-29T12:00:00.000Z';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  // Keep error for debugging
  error: console.error,
};

// Global test helpers
global.testHelpers = {
  /**
   * Create a mock user
   */
  createMockUser: (overrides = {}) => ({
    id: 'test-user-id',
    username: 'testuser',
    email: 'test@example.com',
    role: 'User',
    fullName: 'Test User',
    isActive: true,
    createdAt: new Date().toISOString(),
    ...overrides
  }),

  /**
   * Create a mock admin user
   */
  createMockAdmin: () => ({
    id: 'admin-user-id',
    username: 'admin',
    email: 'admin@example.com',
    role: 'Platform Admin',
    fullName: 'Admin User',
    isActive: true,
    createdAt: new Date().toISOString()
  }),

  /**
   * Create a mock session token
   */
  createMockSession: (userId = 'test-user-id') => ({
    token: 'mock-session-token',
    userId,
    username: 'testuser',
    role: 'User',
    expiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
  }),

  /**
   * Create a mock Bearer token (v1.6.5+)
   */
  createMockBearerToken: (role = 'User') => {
    const prefix = role === 'Platform Admin' ? 'admin' : 'user';
    return `Bearer ${prefix}-token-${Math.random().toString(36).substring(7)}`;
  },

  /**
   * Create authorization header with Bearer token (v1.6.5+)
   */
  createAuthHeader: (role = 'User') => {
    const token = global.testHelpers.createMockBearerToken(role);
    return { Authorization: token };
  },

  /**
   * Create mock AI service URL (v1.6.5+)
   */
  createMockAIUrl: (type = 'localhost') => {
    const urls = {
      localhost: 'http://localhost:11434',
      privateIP: 'http://192.168.1.100:11434',
      dockerNetwork: 'http://172.18.0.5:11434',
      publicCloud: 'https://api.mistral.ai/v1/models',
    };
    return urls[type] || urls.localhost;
  },

  /**
   * Create mock SSRF test URLs (v1.6.5+)
   */
  createSSRFTestUrls: () => ({
    safe: [
      'https://example.com',
      'https://raw.githubusercontent.com/file.json',
      'https://pages.nist.gov/oscal/catalog.json',
    ],
    blocked: [
      'http://169.254.169.254/latest/meta-data/',
      'http://metadata.google.internal/',
      'file:///etc/passwd',
      'gopher://localhost:70',
    ],
    privateAllowedForAI: [
      'http://localhost:11434',
      'http://192.168.1.100:11434',
      'http://10.0.50.5:11434',
    ],
  })
};

