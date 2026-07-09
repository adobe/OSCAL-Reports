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
const BACKEND_PUBLIC = path.join(process.cwd(), 'public');
const BACKEND_INDEX = path.join(BACKEND_PUBLIC, 'index.html');

function writeConfigFile(obj) {
  const payload = { ...obj };
  let json = JSON.stringify(payload);
  while (json.length < 256) {
    payload._readinessPad = (payload._readinessPad || '') + 'x';
    json = JSON.stringify(payload);
  }
  fs.writeFileSync(process.env.CONFIG_PATH, json);
}

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
    writeConfigFile({
      ssoConfig: { oauth: { providers: {} } },
      aiConfig: {},
    });
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

  it('warns on bedrock iam-role without assume ARN but stays ready', () => {
    writeConfigFile({
      ssoConfig: { oauth: { providers: {} } },
      aiConfig: {
        enabled: true,
        provider: 'aws-bedrock',
        bedrockAuthMode: 'iam-role',
        bedrockAssumeRoleArn: '',
      },
    });
    delete process.env.BEDROCK_ASSUME_ROLE_ARN;
    const result = evaluateReadiness();
    expect(result.ready).toBe(true);
    expect(result.checks.bedrock.ok).toBe(false);
    expect(result.checks.bedrock.reason).toBe('bedrock_assume_role_missing');
  });

  it('bedrock check ok when BEDROCK_ASSUME_ROLE_ARN env is set', () => {
    writeConfigFile({
      ssoConfig: { oauth: { providers: {} } },
      aiConfig: {
        enabled: true,
        provider: 'aws-bedrock',
        bedrockAuthMode: 'iam-role',
        bedrockAssumeRoleArn: '',
      },
    });
    process.env.BEDROCK_ASSUME_ROLE_ARN = 'arn:aws:iam::1:role/test';
    const result = evaluateReadiness();
    expect(result.ready).toBe(true);
    expect(result.checks.bedrock.ok).toBe(true);
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
      _readinessPad: 'x'.repeat(200),
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
