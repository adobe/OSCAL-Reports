/**
 * Email Functionality Integration Tests
 * Tests email configuration and SMTP connection
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';

const API_URL = process.env.API_URL || 'http://localhost:3020';

describe('Email Functionality Tests', () => {
  let authToken;
  let app;

  beforeAll(async () => {
    // Login as Platform Admin
    const loginResponse = await request(API_URL)
      .post('/api/auth/login')
      .send({
        username: 'admin',
        password: process.env.TEST_ADMIN_PASSWORD || 'Admin@2026'
      });
    
    expect(loginResponse.status).toBe(200);
    authToken = loginResponse.body.sessionToken;
  });

  describe('Email Configuration Endpoint', () => {
    it('should require authentication', async () => {
      const response = await request(API_URL)
        .post('/api/messaging/test-email')
        .send({
          emailConfig: {
            enabled: true,
            smtpHost: 'smtp.gmail.com',
            smtpPort: 587,
            smtpSecure: false
          }
        });
      
      expect(response.status).toBe(401);
    });

    it('should require Platform Admin role', async () => {
      // Login as regular user
      const userLogin = await request(API_URL)
        .post('/api/auth/login')
        .send({
          username: 'user',
          password: process.env.TEST_USER_PASSWORD || 'User@2026'
        });
      
      const response = await request(API_URL)
        .post('/api/messaging/test-email')
        .set('Authorization', `Bearer ${userLogin.body.sessionToken}`)
        .send({
          emailConfig: {
            enabled: true,
            smtpHost: 'smtp.gmail.com',
            smtpPort: 587
          }
        });
      
      expect(response.status).toBe(403);
    });

    it('should validate email config is provided', async () => {
      const response = await request(API_URL)
        .post('/api/messaging/test-email')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});
      
      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/required/i);
    });

    it('should handle incomplete email config', async () => {
      const response = await request(API_URL)
        .post('/api/messaging/test-email')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          emailConfig: {
            enabled: true,
            smtpHost: 'smtp.gmail.com'
            // Missing port, user, etc.
          }
        });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/incomplete/i);
    });

    it('should handle disabled email config', async () => {
      const response = await request(API_URL)
        .post('/api/messaging/test-email')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          emailConfig: {
            enabled: false,
            smtpHost: 'smtp.gmail.com',
            smtpPort: 587
          }
        });
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toMatch(/not enabled/i);
    });
  });

  describe('Port 587 (STARTTLS) Support', () => {
    it('should support port 587 configuration', async () => {
      const response = await request(API_URL)
        .post('/api/messaging/test-email')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          emailConfig: {
            enabled: true,
            smtpHost: 'smtp.gmail.com',
            smtpPort: 587,
            smtpSecure: false,
            smtpUser: 'test@example.com',
            smtpPassword: 'invalid',
            fromEmail: 'test@example.com',
            fromName: 'Test'
          }
        })
        .timeout(15000);
      
      expect(response.status).toBe(200);
      // Will fail auth, but shows port 587 is accepted
      expect(response.body).toHaveProperty('success');
    }, 20000);
  });

  describe('Port 465 (SSL) Support', () => {
    it('should support port 465 configuration', async () => {
      const response = await request(API_URL)
        .post('/api/messaging/test-email')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          emailConfig: {
            enabled: true,
            smtpHost: 'smtp.gmail.com',
            smtpPort: 465,
            smtpSecure: true,
            smtpUser: 'test@example.com',
            smtpPassword: 'invalid',
            fromEmail: 'test@example.com',
            fromName: 'Test'
          }
        })
        .timeout(15000);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success');
    }, 20000);
  });

  describe('Email Security - Not Affected by SSRF', () => {
    it('should NOT perform URL validation on SMTP hosts', async () => {
      // Email should work with private IPs if needed
      const response = await request(API_URL)
        .post('/api/messaging/test-email')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          emailConfig: {
            enabled: true,
            smtpHost: '192.168.1.1', // Private IP
            smtpPort: 587,
            smtpSecure: false,
            smtpUser: 'test@example.com',
            smtpPassword: 'test',
            fromEmail: 'test@example.com',
            fromName: 'Test'
          }
        })
        .timeout(15000);
      
      expect(response.status).toBe(200);
      // Should attempt connection, not block due to private IP
      expect(response.body).toHaveProperty('success');
    }, 20000);

    it('should NOT be affected by CSRF protection', async () => {
      // Email endpoint should work without CSRF token
      const response = await request(API_URL)
        .post('/api/messaging/test-email')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          emailConfig: {
            enabled: true,
            smtpHost: 'smtp.gmail.com',
            smtpPort: 587,
            smtpSecure: false,
            smtpUser: 'test@example.com',
            smtpPassword: 'test',
            fromEmail: 'test@example.com',
            fromName: 'Test'
          }
        })
        .timeout(15000);
      
      expect(response.status).toBe(200);
    }, 20000);
  });

  describe('TLS Configuration', () => {
    it('should handle TLS for port 587', async () => {
      const response = await request(API_URL)
        .post('/api/messaging/test-email')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          emailConfig: {
            enabled: true,
            smtpHost: 'smtp.gmail.com',
            smtpPort: 587,
            smtpSecure: false,
            smtpUser: 'test@example.com',
            smtpPassword: 'test',
            fromEmail: 'test@example.com',
            fromName: 'Test'
          }
        })
        .timeout(15000);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success');
    }, 20000);

    it('should handle SSL for port 465', async () => {
      const response = await request(API_URL)
        .post('/api/messaging/test-email')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          emailConfig: {
            enabled: true,
            smtpHost: 'smtp.gmail.com',
            smtpPort: 465,
            smtpSecure: true,
            smtpUser: 'test@example.com',
            smtpPassword: 'test',
            fromEmail: 'test@example.com',
            fromName: 'Test'
          }
        })
        .timeout(15000);
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success');
    }, 20000);
  });

  describe('Error Handling', () => {
    it('should handle invalid SMTP host', async () => {
      const response = await request(API_URL)
        .post('/api/messaging/test-email')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          emailConfig: {
            enabled: true,
            smtpHost: 'invalid.smtp.server.that.does.not.exist.com',
            smtpPort: 587,
            smtpSecure: false,
            smtpUser: 'test@example.com',
            smtpPassword: 'test',
            fromEmail: 'test@example.com',
            fromName: 'Test'
          }
        })
        .timeout(20000);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    }, 25000);

    it('should handle connection timeout gracefully', async () => {
      const response = await request(API_URL)
        .post('/api/messaging/test-email')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          emailConfig: {
            enabled: true,
            smtpHost: '192.0.2.1', // TEST-NET-1 (should timeout)
            smtpPort: 587,
            smtpSecure: false,
            smtpUser: 'test@example.com',
            smtpPassword: 'test',
            fromEmail: 'test@example.com',
            fromName: 'Test'
          }
        })
        .timeout(25000);
      
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
    }, 35000); // 35 second timeout
  });
});

export default describe;
