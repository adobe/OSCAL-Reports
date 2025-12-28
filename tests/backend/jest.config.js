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
  testTimeout: 10000
};

