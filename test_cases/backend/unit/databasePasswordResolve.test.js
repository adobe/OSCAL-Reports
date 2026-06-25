/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { jest } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { encryptConfigSecret } from '../../../backend/utils/configFieldCrypto.js';

jest.unstable_mockModule('../../../backend/utils/passResolver.js', () => ({
  resolvePassPointers: jest.fn((obj) => obj),
  passShow: jest.fn(() => ''),
  isPassPointer: () => false,
}));

jest.unstable_mockModule('../../../backend/utils/secretsManager.js', () => ({
  isAwsSmMode: () => false,
  isSmPointer: () => false,
  entryKeyToConfigPointer: (k) => ({ _sm: k }),
  mergeAndPutBundle: jest.fn(async () => ({ success: true })),
  reloadSecretsFromAws: jest.fn(async () => ({})),
  ensureSmCacheReady: jest.fn(async () => {}),
  resolveSmPointers: jest.fn((obj) => obj),
  isSecretCached: () => false,
  getSecret: () => '',
  resolveSecretPointer: jest.fn(() => ''),
}));

describe('getResolvedDatabaseConfigForTest', () => {
  let tmpDir;
  let configPath;

  beforeEach(async () => {
    jest.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oscal-db-test-'));
    configPath = path.join(tmpDir, 'config.json');
    process.env.CONFIG_PATH = configPath;
    process.env.OSCAL_CONFIG_FIELD_SECRET = 'db-coalesce-test-key';
    delete process.env.OSCAL_SECRETS_MODE;

    const enc = encryptConfigSecret('rds-secret-123');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        messagingConfig: { email: {} },
        aiConfig: {},
        databaseConfig: {
          enabled: true,
          host: 'stored-host',
          port: 5432,
          database: 'oscal',
          user: 'oscalmaster',
          authMode: 'password',
          sslMode: 'require',
          password: enc,
        },
      }),
      'utf8'
    );
  });

  afterEach(() => {
    delete process.env.CONFIG_PATH;
    delete process.env.OSCAL_CONFIG_FIELD_SECRET;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns string password when form sends _cfgenc envelope', async () => {
    const { getResolvedDatabaseConfigForTest } = await import('../../../backend/configManager.js');
    const enc = encryptConfigSecret('rds-secret-123');
    const db = getResolvedDatabaseConfigForTest({
      host: 'db.example.com',
      database: 'oscal',
      user: 'oscalmaster',
      authMode: 'password',
      sslMode: 'require',
      password: enc,
    });
    expect(typeof db.password).toBe('string');
    expect(db.password).toBe('rds-secret-123');
  });

  it('returns string password when form sends empty string (masked) and stored _cfgenc', async () => {
    const { getResolvedDatabaseConfigForTest } = await import('../../../backend/configManager.js');
    const db = getResolvedDatabaseConfigForTest({
      host: 'db.example.com',
      database: 'oscal',
      user: 'oscalmaster',
      authMode: 'password',
      sslMode: 'require',
      password: '',
    });
    expect(typeof db.password).toBe('string');
    expect(db.password).toBe('rds-secret-123');
  });
});
