/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  __resetSecretsCacheForTests,
  __setSecretsCacheForTests,
} from '../../../backend/utils/secretsManager.js';
import { evaluateReadiness } from '../../../backend/utils/healthReady.js';

const ORIGINAL_ENV = { ...process.env };
const BACKEND_PUBLIC = path.join(process.cwd(), 'backend', 'public');
const BACKEND_INDEX = path.join(BACKEND_PUBLIC, 'index.html');

describe('healthReady', () => {
  let tmpDir;
  let indexBackup;

  beforeEach(() => {
    __resetSecretsCacheForTests();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.OSCAL_SECRETS_MODE;
    delete process.env.OSCAL_SECRETS_MANAGER_ARN;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oscal-ready-'));
    process.env.CONFIG_PATH = path.join(tmpDir, 'config.json');
    fs.writeFileSync(process.env.CONFIG_PATH, JSON.stringify({
      ssoConfig: { oauth: { providers: {} } },
      aiConfig: {},
    }));
    if (fs.existsSync(BACKEND_INDEX)) {
      indexBackup = fs.readFileSync(BACKEND_INDEX);
    } else {
      indexBackup = null;
      fs.mkdirSync(BACKEND_PUBLIC, { recursive: true });
    }
    fs.writeFileSync(BACKEND_INDEX, '<!DOCTYPE html><html></html>');
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    __resetSecretsCacheForTests();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (indexBackup) {
      fs.writeFileSync(BACKEND_INDEX, indexBackup);
    } else if (fs.existsSync(BACKEND_INDEX)) {
      fs.unlinkSync(BACKEND_INDEX);
    }
  });

  it('returns ready when SPA and config exist (config mode)', () => {
    const result = evaluateReadiness();
    expect(result.ready).toBe(true);
    expect(result.checks.spa.ok).toBe(true);
    expect(result.checks.config.ok).toBe(true);
  });

  it('returns not ready when index.html is missing', () => {
    fs.unlinkSync(BACKEND_INDEX);
    const result = evaluateReadiness();
    expect(result.ready).toBe(false);
    expect(result.checks.spa.ok).toBe(false);
  });

  it('requires SM secrets when Okta enabled with _sm pointer in aws-sm mode', () => {
    process.env.OSCAL_SECRETS_MODE = 'aws-sm';
    process.env.OSCAL_SECRETS_MANAGER_ARN = 'arn:aws:secretsmanager:us-east-1:1:secret:test';
    fs.writeFileSync(process.env.CONFIG_PATH, JSON.stringify({
      ssoConfig: {
        oauth: {
          providers: {
            okta: { enabled: true, clientSecret: { _sm: 'OSCAL/sso-oauth-okta-client-secret' } },
          },
        },
      },
      aiConfig: {},
    }));
    __setSecretsCacheForTests({});
    let result = evaluateReadiness();
    expect(result.ready).toBe(false);
    expect(result.checks.secrets.ok).toBe(false);
    __setSecretsCacheForTests({ 'OSCAL/sso-oauth-okta-client-secret': 'secret-value' });
    result = evaluateReadiness();
    expect(result.ready).toBe(true);
  });
});
