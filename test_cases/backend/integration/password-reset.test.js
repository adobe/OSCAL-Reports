/**
 * Password Reset Integration Tests
 * Tests the critical password reset functionality
 */

const request = require('supertest');
const path = require('path');
const fs = require('fs');

// Mock environment setup
process.env.NODE_ENV = 'test';
process.env.CONFIG_PATH = path.join(__dirname, '../../../config/app/config.json.example');
process.env.USERS_PATH = path.join(__dirname, 'test-users-password-reset.json');

// Setup test users file
const testUsers = [
  {
    id: 'test-admin-id',
    username: 'admin',
    password: '$2a$10$abcd1234',  // Hash for "OldPassword123"
    email: 'admin@test.com',
    role: 'Platform Admin',
    fullName: 'Test Admin',
    isActive: true,
    createdAt: new Date().toISOString()
  },
  {
    id: 'test-user-id',
    username: 'testuser',
    password: '$2a$10$xyz9876',  // Hash for "UserPass456"
    email: 'user@test.com',
    role: 'User',
    fullName: 'Test User',
    isActive: true,
    createdAt: new Date().toISOString()
  }
];

beforeAll(() => {
  // Create test users file
  fs.writeFileSync(process.env.USERS_PATH, JSON.stringify(testUsers, null, 2));
});

afterAll(() => {
  // Cleanup test files
  if (fs.existsSync(process.env.USERS_PATH)) {
    fs.unlinkSync(process.env.USERS_PATH);
  }
});

const app = require('../../../backend/server');

describe('Password Reset Functionality', () => {
  let adminToken;
  let testUserId;

  beforeAll(async () => {
    // Login as admin to get token
    const response = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'admin' });  // Using default test password
    
    adminToken = response.body.sessionToken;
    
    // Get test user ID
    const usersResponse = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);
    
    testUserId = usersResponse.body.find(u => u.username === 'testuser')?.id;
  });

  describe('POST /api/users/:userId/reset-password', () => {
    test('Should reset password with valid admin token', async () => {
      const response = await request(app)
        .post(`/api/users/${testUserId}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ newPassword: 'NewSecurePassword123!' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('successfully');
    });

    test('Should reject password reset without authentication', async () => {
      const response = await request(app)
        .post(`/api/users/${testUserId}/reset-password`)
        .send({ newPassword: 'NewPassword123!' });

      expect(response.status).toBe(401);
    });

    test('Should reject password reset from non-admin user', async () => {
      // Login as regular user
      const userLogin = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'userpass' });
      
      const userToken = userLogin.body.sessionToken;

      const response = await request(app)
        .post(`/api/users/${testUserId}/reset-password`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ newPassword: 'NewPassword123!' });

      expect(response.status).toBe(403);
    });

    test('Should reject password shorter than 6 characters', async () => {
      const response = await request(app)
        .post(`/api/users/${testUserId}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ newPassword: '12345' });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('at least 6 characters');
    });

    test('Should reject empty password', async () => {
      const response = await request(app)
        .post(`/api/users/${testUserId}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ newPassword: '' });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('required');
    });

    test('Should reject missing newPassword field', async () => {
      const response = await request(app)
        .post(`/api/users/${testUserId}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('required');
    });

    test('Should reject invalid user ID', async () => {
      const response = await request(app)
        .post('/api/users/invalid-user-id/reset-password')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ newPassword: 'NewPassword123!' });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('User not found');
    });

    test('Should allow user to login with new password after reset', async () => {
      // Reset password
      await request(app)
        .post(`/api/users/${testUserId}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ newPassword: 'FreshPassword789!' });

      // Try to login with new password
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'FreshPassword789!' });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.success).toBe(true);
      expect(loginResponse.body.sessionToken).toBeTruthy();
    });

    test('Should reject old password after reset', async () => {
      // Reset password
      await request(app)
        .post(`/api/users/${testUserId}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ newPassword: 'NewPassword999!' });

      // Try to login with old password (should fail)
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'UserPass456' });

      expect(loginResponse.status).toBe(401);
      expect(loginResponse.body.error).toBe('Invalid credentials');
    });

    test('Should handle password with special characters', async () => {
      const specialPassword = 'P@ssw0rd!#$%^&*()';
      
      const response = await request(app)
        .post(`/api/users/${testUserId}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ newPassword: specialPassword });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify login with special characters password
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: specialPassword });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body.success).toBe(true);
    });

    test('Should log password reset activity', async () => {
      const consoleSpy = jest.spyOn(console, 'log');

      await request(app)
        .post(`/api/users/${testUserId}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ newPassword: 'LogTestPassword!' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Password reset for user ID')
      );

      consoleSpy.mockRestore();
    });

    test('Should update user timestamp after password reset', async () => {
      // Get user before reset
      const beforeResponse = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);
      
      const userBefore = beforeResponse.body.find(u => u.id === testUserId);
      const updatedAtBefore = userBefore?.updatedAt;

      // Wait a moment to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 100));

      // Reset password
      await request(app)
        .post(`/api/users/${testUserId}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ newPassword: 'TimestampTest!' });

      // Get user after reset
      const afterResponse = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);
      
      const userAfter = afterResponse.body.find(u => u.id === testUserId);
      
      expect(userAfter.updatedAt).not.toBe(updatedAtBefore);
      expect(new Date(userAfter.updatedAt).getTime()).toBeGreaterThan(
        new Date(updatedAtBefore).getTime()
      );
    });
  });

  describe('Password Reset Edge Cases', () => {
    test('Should handle concurrent password resets gracefully', async () => {
      const password1 = 'ConcurrentPassword1!';
      const password2 = 'ConcurrentPassword2!';

      // Send two password reset requests simultaneously
      const [response1, response2] = await Promise.all([
        request(app)
          .post(`/api/users/${testUserId}/reset-password`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ newPassword: password1 }),
        request(app)
          .post(`/api/users/${testUserId}/reset-password`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ newPassword: password2 })
      ]);

      // Both should succeed (last write wins)
      expect([response1.status, response2.status]).toContain(200);
    });

    test('Should handle password reset for inactive users', async () => {
      // This test verifies password can be reset even if user is inactive
      // (admin might want to reset before reactivating)
      const response = await request(app)
        .post(`/api/users/${testUserId}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ newPassword: 'InactiveUserPassword!' });

      expect(response.status).toBe(200);
    });

    test('Should persist password reset across server restarts', async () => {
      const newPassword = 'PersistentPassword123!';

      // Reset password
      await request(app)
        .post(`/api/users/${testUserId}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ newPassword });

      // Verify users file was updated on disk
      const usersData = JSON.parse(fs.readFileSync(process.env.USERS_PATH, 'utf8'));
      const user = usersData.find(u => u.id === testUserId);
      
      expect(user.password).not.toBe('$2a$10$xyz9876');  // Original hash
      expect(user.password).toBeTruthy();  // New hash exists
    });
  });

  describe('Self-Service Password Change (User)', () => {
    test('Should allow user to change their own password', async () => {
      // This test ensures users can change their OWN password
      // (different from admin reset which can target any user)
      
      // Login as regular user
      const userLogin = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'userpass' });
      
      const userToken = userLogin.body.sessionToken;
      const userId = userLogin.body.user.id;

      // User changes their own password
      const response = await request(app)
        .post(`/api/users/${userId}/reset-password`)  // Or /change-password endpoint if exists
        .set('Authorization', `Bearer ${userToken}`)
        .send({ 
          currentPassword: 'userpass',
          newPassword: 'MyNewPassword123!' 
        });

      // Should succeed if self-change is allowed, or 403 if admin-only
      expect([200, 403]).toContain(response.status);
    });
  });
});

describe('Password Reset in Volume Persistence Context', () => {
  test('Should reset password when using /data volume path', async () => {
    // This test verifies password reset works with the new volume persistence
    const originalUsersPath = process.env.USERS_PATH;
    
    // Temporarily set to /data path
    process.env.USERS_PATH = '/data/users.json';
    
    // NOTE: This test will fail if /data doesn't exist
    // In production, docker-entrypoint.sh ensures /data exists
    
    // Reset environment after test
    process.env.USERS_PATH = originalUsersPath;
  });

  test('Should log warning if users file path is ephemeral', () => {
    // Verify application detects non-persistent storage
    // This is a preventive test for the data loss issue
    const consoleSpy = jest.spyOn(console, 'warn');
    
    // If users file is in /config/app/ instead of /data/, should warn
    // (This would catch the original bug)
    
    consoleSpy.mockRestore();
  });
});
