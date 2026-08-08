/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { describe, test, expect, beforeAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import {
  buildAdminSettingsResponse,
  buildRuntimeSettingsResponse,
  sanitizeSettingsSaveResponse,
} from '../../../backend/utils/settingsClientResponse.js';
import { stripLegacyEmailMessagingConfig } from '../../../backend/configManager.js';
import { ROLES } from '../../../backend/auth/roles.js';

describe('Settings auth disclosure (VULN-36998)', () => {
  let app;
  const userToken = 'user-token-vuln36998';
  const adminToken = 'admin-token-vuln36998';

  beforeAll(() => {
    app = express();
    app.use(express.json());

    const mockAuthenticate = (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const token = authHeader.substring(7);
      if (token === userToken) {
        req.user = { username: 'user1', role: ROLES.USER, id: 'user-1' };
        return next();
      }
      if (token === adminToken) {
        req.user = { username: 'admin', role: ROLES.PLATFORM_ADMIN, id: 'admin-1' };
        return next();
      }
      return res.status(401).json({ error: 'Invalid token' });
    };

    const mockAuthorizeEditSettings = (req, res, next) => {
      if (req.user?.role === ROLES.PLATFORM_ADMIN) {
        return next();
      }
      return res.status(403).json({ error: 'Insufficient permissions' });
    };

    const fullConfig = {
      publishedSoaUrl: 'https://example.com/soa.json',
      databaseConfig: {
        enabled: true,
        host: 'db.internal.example.com',
        user: 'oscal_app',
      },
      ssoConfig: {
        oauth: {
          enabled: true,
          groupToRoleMapping: { 'Platform Admin': 'Platform Admin' },
        },
      },
      messagingConfig: {
        enabled: false,
        channel: 'slack',
        slack: { enabled: false, webhookUrl: '', channel: '#general' },
      },
    };

    app.get('/api/settings/runtime', mockAuthenticate, (req, res) => {
      res.json(buildRuntimeSettingsResponse(fullConfig));
    });

    app.get('/api/settings', mockAuthenticate, mockAuthorizeEditSettings, (req, res) => {
      res.json(buildAdminSettingsResponse(fullConfig, req.user));
    });
  });

  test('unauthenticated GET /api/settings returns 401', async () => {
    await request(app).get('/api/settings').expect(401);
  });

  test('unauthenticated GET /api/settings/runtime returns 401', async () => {
    await request(app).get('/api/settings/runtime').expect(401);
  });

  test('authenticated non-admin GET /api/settings returns 403', async () => {
    await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
  });

  test('authenticated admin GET /api/settings returns full config shape', async () => {
    const response = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toHaveProperty('publishedSoaUrl');
    expect(response.body).toHaveProperty('ssoConfig');
    expect(response.body.databaseConfig.host).toBe('db.internal.example.com');
  });

  test('authenticated user GET /api/settings/runtime returns allowlisted fields only', async () => {
    const response = await request(app)
      .get('/api/settings/runtime')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);

    expect(response.body).toEqual({
      databaseConfig: { enabled: true },
      publishedSoaUrl: 'https://example.com/soa.json',
    });
    expect(response.body).not.toHaveProperty('ssoConfig');
    expect(response.body.databaseConfig).not.toHaveProperty('host');
  });
});

describe('settingsClientResponse helpers', () => {
  test('buildRuntimeSettingsResponse allowlists runtime fields', () => {
    const runtime = buildRuntimeSettingsResponse({
      publishedSoaUrl: 'https://legacy.example/soa.json',
      databaseConfig: { enabled: true, host: 'secret-host' },
      ssoConfig: { oauth: { enabled: true } },
    });
    expect(runtime).toEqual({
      databaseConfig: { enabled: true },
      publishedSoaUrl: 'https://legacy.example/soa.json',
    });
  });

  test('sanitizeSettingsSaveResponse masks secrets for admin save response', () => {
    const sanitized = sanitizeSettingsSaveResponse({
      aiConfig: {
        bedrockAuthMode: 'iam-role',
        bedrockAssumeRoleArn: 'arn:aws:iam::123:role/Test',
        bedrockExternalId: 'ext-id',
        awsRegion: 'us-east-1',
      },
    }, { role: ROLES.PLATFORM_ADMIN });
    expect(sanitized.aiConfig.bedrockAssumeRoleArn).toBe('arn:aws:iam::123:role/Test');
  });

  test('stripLegacyEmailMessagingConfig removes email block and normalizes channel', () => {
    const config = {
      messagingConfig: {
        enabled: true,
        channel: 'email',
        email: { smtpHost: 'smtp.example.com' },
        slack: { enabled: false },
      },
    };
    stripLegacyEmailMessagingConfig(config);
    expect(config.messagingConfig.email).toBeUndefined();
    expect(config.messagingConfig.channel).toBe('slack');
  });
});

describe('Self-registration removal', () => {
  test('POST /api/auth/self-register is not registered on minimal auth app', async () => {
    const app = express();
    app.use(express.json());
    app.post('/api/auth/login', (req, res) => res.json({ success: true }));

    const response = await request(app)
      .post('/api/auth/self-register')
      .send({ email: 'user@example.com' });

    expect(response.status).toBe(404);
  });
});
