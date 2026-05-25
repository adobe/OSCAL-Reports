/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
export default {
  testEnvironment: 'node',
  transform: {},
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  modulePaths: ['<rootDir>/../../backend/node_modules'],
  testMatch: [
    '**/*.test.js',
    '**/*.spec.js'
  ],
  collectCoverageFrom: [
    '../../backend/**/*.js',
    '!../../backend/node_modules/**',
    '!../../backend/public/**',
    '!../../backend/server.js'
  ],
  coverageDirectory: './coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  testTimeout: 10000,
  // Force Jest to exit after all tests complete
  // This prevents hanging due to open handles (connections, timers, etc.)
  forceExit: true,
  // Detect and report open handles during development
  // Commented out for CI to avoid verbose output, but useful for debugging locally
  // detectOpenHandles: true,
  // Ensure test isolation
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true
};

