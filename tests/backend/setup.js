/**
 * Test Setup and Global Configuration
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
  })
};

