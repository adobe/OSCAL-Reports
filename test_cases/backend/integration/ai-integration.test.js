/**
 * AI Integration Tests
 * Tests AI connectivity with private IPs allowed
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import request from 'supertest';

const API_URL = process.env.API_URL || 'http://localhost:3020';

describe('AI Integration Tests', () => {
  let authToken;

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

  describe('Private IP Support - Architectural Design', () => {
    it('should allow Ollama on private Class C network', async () => {
      const response = await request(API_URL)
        .post('/api/ai/test-connection')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          provider: 'ollama',
          url: 'http://192.168.1.111:11434'
        });
      
      expect(response.status).toBe(200);
      // Should NOT be blocked by SSRF
      expect(response.body).not.toHaveProperty('securityReason', 'SSRF_PREVENTION');
    });

    it('should allow Ollama on private Class A network', async () => {
      const response = await request(API_URL)
        .post('/api/ai/test-connection')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          provider: 'ollama',
          url: 'http://10.0.0.5:11434'
        });
      
      expect(response.status).toBe(200);
      expect(response.body).not.toHaveProperty('securityReason', 'SSRF_PREVENTION');
    });

    it('should allow Ollama on private Class B network', async () => {
      const response = await request(API_URL)
        .post('/api/ai/test-connection')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          provider: 'ollama',
          url: 'http://172.16.0.10:11434'
        });
      
      expect(response.status).toBe(200);
      expect(response.body).not.toHaveProperty('securityReason', 'SSRF_PREVENTION');
    });

    it('should allow Ollama on localhost', async () => {
      const response = await request(API_URL)
        .post('/api/ai/test-connection')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          provider: 'ollama',
          url: 'http://localhost:11434'
        });
      
      expect(response.status).toBe(200);
      expect(response.body).not.toHaveProperty('securityReason', 'SSRF_PREVENTION');
    });

    it('should allow Ollama on 127.0.0.1', async () => {
      const response = await request(API_URL)
        .post('/api/ai/test-connection')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          provider: 'ollama',
          url: 'http://127.0.0.1:11434'
        });
      
      expect(response.status).toBe(200);
      expect(response.body).not.toHaveProperty('securityReason', 'SSRF_PREVENTION');
    });
  });

  describe('Cloud Metadata Protection Still Active', () => {
    it('should block AWS metadata endpoint', async () => {
      const response = await request(API_URL)
        .post('/api/ai/test-connection')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          provider: 'ollama',
          url: 'http://169.254.169.254/latest/meta-data/'
        });
      
      expect(response.status).toBe(400);
      expect(response.body.securityReason).toBe('SSRF_PREVENTION');
    });

    it('should block GCP metadata endpoint', async () => {
      const response = await request(API_URL)
        .post('/api/ai/test-connection')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          provider: 'ollama',
          url: 'http://metadata.google.internal'
        });
      
      expect(response.status).toBe(400);
      expect(response.body.securityReason).toBe('SSRF_PREVENTION');
    });
  });

  describe('Dangerous Protocol Protection', () => {
    it('should block file:// protocol', async () => {
      const response = await request(API_URL)
        .post('/api/ai/test-connection')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          provider: 'ollama',
          url: 'file:///etc/passwd'
        });
      
      expect(response.status).toBe(400);
      expect(response.body.securityReason).toBe('SSRF_PREVENTION');
    });

    it('should block gopher:// protocol', async () => {
      const response = await request(API_URL)
        .post('/api/ai/test-connection')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          provider: 'ollama',
          url: 'gopher://internal-server:70'
        });
      
      expect(response.status).toBe(400);
      expect(response.body.securityReason).toBe('SSRF_PREVENTION');
    });
  });

  describe('Mistral API Support', () => {
    it('should allow Mistral API (trusted domain)', async () => {
      const response = await request(API_URL)
        .post('/api/ai/test-connection')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          provider: 'mistral-api',
          url: 'https://api.mistral.ai/v1/chat/completions',
          apiToken: 'test-token'
        });
      
      expect(response.status).toBe(200);
      expect(response.body).not.toHaveProperty('securityReason', 'SSRF_PREVENTION');
    });
  });

  describe('AWS Bedrock Support', () => {
    it('should allow AWS Bedrock without URL validation', async () => {
      const response = await request(API_URL)
        .post('/api/ai/test-connection')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          provider: 'aws-bedrock',
          awsRegion: 'us-east-1',
          awsAccessKeyId: 'test',
          awsSecretAccessKey: 'test',
          bedrockModelId: 'anthropic.claude-v2'
        });
      
      // Will fail auth but shouldn't be blocked by SSRF
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success');
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication', async () => {
      const response = await request(API_URL)
        .post('/api/ai/test-connection')
        .send({
          provider: 'ollama',
          url: 'http://192.168.1.111:11434'
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
        .post('/api/ai/test-connection')
        .set('Authorization', `Bearer ${userLogin.body.sessionToken}`)
        .send({
          provider: 'ollama',
          url: 'http://192.168.1.111:11434'
        });
      
      expect(response.status).toBe(403);
    });
  });

  describe('URL Format Validation', () => {
    it('should validate URL is provided', async () => {
      const response = await request(API_URL)
        .post('/api/ai/test-connection')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          provider: 'ollama'
          // Missing URL
        });
      
      expect(response.status).toBe(400);
    });

    it('should handle malformed URLs', async () => {
      const response = await request(API_URL)
        .post('/api/ai/test-connection')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          provider: 'ollama',
          url: 'not-a-valid-url'
        });
      
      expect(response.status).toBe(400);
    });
  });
});

export default describe;
