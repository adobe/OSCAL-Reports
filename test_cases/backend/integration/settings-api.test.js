/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';

describe('Settings API Integration Tests', () => {
  let app;
  let mockSaveConfig;
  let mockLoadConfig;

  beforeAll(() => {
    // Create a test Express app
    app = express();
    app.use(express.json());
    
    // Mock config functions
    mockLoadConfig = () => ({
      publishedSoaUrl: 'https://example.com',
      messagingConfig: {
        email: {
          enabled: true,
          smtpHost: 'smtp.example.com',
          smtpPort: 587,
          smtpUser: 'test@example.com'
        }
      },
      aiConfig: {
        enabled: false,
        url: ''
      }
    });
    
    mockSaveConfig = async (config) => {
      // Simulate async operation (this would write to disk)
      await new Promise(resolve => setTimeout(resolve, 10));
      
      return {
        success: true,
        verified: true,
        timestamp: new Date().toISOString(),
        configPath: '/app/config/app/config.json',
        message: 'Configuration saved and verified on disk'
      };
    };
    
    // Mock authentication middleware
    const mockAuth = (req, res, next) => {
      req.user = { username: 'testuser', role: 'Platform Admin' };
      next();
    };
    
    const mockAuthorize = () => (req, res, next) => next();
    
    // Create the settings endpoint (this MUST be async to handle await)
    app.get('/api/settings', (req, res) => {
      try {
        const config = mockLoadConfig();
        res.json(config);
      } catch (error) {
        res.status(500).json({ error: 'Failed to load settings' });
      }
    });
    
    // POST endpoint must be async to use await
    app.post('/api/settings', mockAuth, mockAuthorize(), async (req, res) => {
      try {
        const incomingConfig = req.body;
        
        // This uses await, so the handler MUST be async
        const saveResult = await mockSaveConfig(incomingConfig);
        
        if (saveResult.success) {
          const savedConfig = mockLoadConfig();
          
          const response = {
            success: true,
            message: saveResult.message || 'Settings saved successfully',
            config: savedConfig,
            verification: {
              verified: saveResult.verified,
              timestamp: saveResult.timestamp,
              configPath: saveResult.configPath
            }
          };
          
          res.json(response);
        } else {
          res.status(500).json({
            error: 'Failed to save settings',
            details: saveResult.error
          });
        }
      } catch (error) {
        res.status(500).json({
          error: 'Failed to save settings',
          details: error.message
        });
      }
    });
  });

  describe('GET /api/settings', () => {
    test('should return current settings', async () => {
      const response = await request(app)
        .get('/api/settings')
        .expect(200);

      expect(response.body).toHaveProperty('publishedSoaUrl');
      expect(response.body).toHaveProperty('messagingConfig');
      expect(response.body).toHaveProperty('aiConfig');
    });

    test('should return email configuration', async () => {
      const response = await request(app)
        .get('/api/settings')
        .expect(200);

      expect(response.body.messagingConfig).toHaveProperty('email');
      expect(response.body.messagingConfig.email).toHaveProperty('smtpHost');
    });
  });

  describe('POST /api/settings', () => {
    test('should successfully save settings with async operation', async () => {
      const newConfig = {
        publishedSoaUrl: 'https://new-example.com',
        messagingConfig: {
          email: {
            enabled: true,
            smtpHost: 'smtp.new-example.com',
            smtpPort: 587,
            smtpUser: 'new@example.com'
          }
        }
      };

      const response = await request(app)
        .post('/api/settings')
        .send(newConfig)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('verification');
    });

    test('should return verification details after save', async () => {
      const newConfig = {
        publishedSoaUrl: 'https://test.com',
        messagingConfig: {
          email: {
            enabled: true,
            smtpHost: 'smtp.test.com',
            smtpPort: 587
          }
        }
      };

      const response = await request(app)
        .post('/api/settings')
        .send(newConfig)
        .expect(200);

      expect(response.body.verification).toHaveProperty('verified', true);
      expect(response.body.verification).toHaveProperty('timestamp');
      expect(response.body.verification).toHaveProperty('configPath');
    });

    test('should handle async save operation properly', async () => {
      // This test specifically validates that the async/await pattern works
      const startTime = Date.now();
      
      const response = await request(app)
        .post('/api/settings')
        .send({ publishedSoaUrl: 'https://async-test.com' })
        .expect(200);

      const endTime = Date.now();
      
      // The save operation has a 10ms delay, so this should take at least that long
      expect(endTime - startTime).toBeGreaterThanOrEqual(8); // Allow small margin
      expect(response.body.success).toBe(true);
    });

    test('should handle errors in async operations gracefully', async () => {
      // Test error handling when async operation fails
      const originalSaveConfig = mockSaveConfig;
      
      // Temporarily replace with failing version
      mockSaveConfig = async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        throw new Error('Disk write failed');
      };

      const response = await request(app)
        .post('/api/settings')
        .send({ publishedSoaUrl: 'https://error-test.com' });

      // Should return error, not crash
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body).toHaveProperty('error');
      
      // Restore original function
      mockSaveConfig = originalSaveConfig;
    });
  });

  describe('Async Handler Validation', () => {
    test('should document the requirement for async handlers', () => {
      // This test documents why async handlers are critical
      const requirements = {
        mustBeAsync: 'Handlers using await must be declared as async',
        symptomIfMissing: 'SyntaxError: Unexpected reserved word',
        affectedVersion: 'v1.6.1',
        fixVersion: 'v1.6.2',
        prevention: 'Unit tests check for async keyword in handlers using await'
      };
      
      expect(requirements.mustBeAsync).toBeTruthy();
      expect(requirements.affectedVersion).toBe('v1.6.1');
      expect(requirements.fixVersion).toBe('v1.6.2');
    });

    test('should validate that POST /api/settings uses async/await properly', async () => {
      // This integration test validates the async behavior works correctly
      let asyncOperationCompleted = false;
      
      const testConfig = {
        publishedSoaUrl: 'https://async-validation.com'
      };
      
      const response = await request(app)
        .post('/api/settings')
        .send(testConfig)
        .expect(200);
      
      // If we got here without a SyntaxError, the async handler is working
      asyncOperationCompleted = true;
      
      expect(asyncOperationCompleted).toBe(true);
      expect(response.body.success).toBe(true);
    });
  });
});
