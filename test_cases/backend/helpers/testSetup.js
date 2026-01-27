/**
 * Test Setup Helper
 * Provides utilities for integration tests
 */

let app;
let closeServer;
let serverInstance;

/**
 * Get the Express app for testing (without starting HTTP server)
 * Use this with supertest for most integration tests
 */
export const getApp = async () => {
  if (!app) {
    try {
      const serverModule = await import('../../../backend/server.js');
      app = serverModule.app || serverModule.default;
      closeServer = serverModule.closeServer;
    } catch (error) {
      console.error('Failed to import server:', error);
      throw error;
    }
  }
  return app;
};

/**
 * Start the actual HTTP server (for tests that need it)
 * Most tests should use getApp() instead
 */
export const startTestServer = async () => {
  if (!serverInstance) {
    try {
      const serverModule = await import('../../../backend/server.js');
      const { startServer } = serverModule;
      serverInstance = await startServer();
      app = serverModule.app;
      closeServer = serverModule.closeServer;
    } catch (error) {
      console.error('Failed to start test server:', error);
      throw error;
    }
  }
  return serverInstance;
};

/**
 * Close the server and clean up all resources
 * Call this in afterAll() hooks
 */
export const cleanupTestServer = async () => {
  if (closeServer) {
    try {
      await closeServer();
      app = null;
      closeServer = null;
      serverInstance = null;
    } catch (error) {
      console.warn('Error during cleanup:', error);
    }
  }
};

/**
 * Setup for tests that use the app directly (no HTTP server)
 * Use in beforeAll()
 */
export const setupAppTest = async () => {
  return await getApp();
};

/**
 * Setup for tests that need a real HTTP server
 * Use in beforeAll()
 */
export const setupServerTest = async () => {
  return await startTestServer();
};

/**
 * Cleanup for all tests
 * Use in afterAll()
 */
export const cleanup = async () => {
  await cleanupTestServer();
};
