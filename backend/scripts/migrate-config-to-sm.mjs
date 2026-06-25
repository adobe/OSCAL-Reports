/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * One-time migration: plaintext / _pass secrets in config.json → AWS SM bundle + _sm pointers.
 * Run on EC2 with OSCAL_SECRETS_MODE=aws-sm and OSCAL_SECRETS_MANAGER_ARN set.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { atomicWriteJSON } from '../utils/atomicWrite.js';
import {
  SENSITIVE_CONFIG_KEYS,
  getByPath,
  setByPath,
} from '../utils/sensitiveConfigKeys.js';
import {
  isAwsSmMode,
  getSecretsManagerArn,
  mergeAndPutBundle,
  entryKeyToConfigPointer,
  isSmPointer,
  reloadSecretsFromAws,
  initializeSecretsCache,
  getSecret,
} from '../utils/secretsManager.js';
import { isPassPointer, passShow } from '../utils/passResolver.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getConfigPath() {
  const env = (process.env.CONFIG_PATH || '').trim();
  if (env) return path.resolve(env);
  return '/opt/oscal/data/config.json';
}

function readPlainSecret(value, smEntry) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t || t === '********') return null;
    return t;
  }
  if (isSmPointer(value)) return null;
  if (isPassPointer(value)) {
    const resolved = (passShow(value._pass) || '').trim();
    return resolved || null;
  }
  return null;
}

async function main() {
  if (!isAwsSmMode()) {
    console.error('OSCAL_SECRETS_MODE must be aws-sm');
    process.exit(1);
  }
  if (!getSecretsManagerArn()) {
    console.error('OSCAL_SECRETS_MANAGER_ARN is required');
    process.exit(1);
  }

  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    console.error(`Config not found: ${configPath}`);
    process.exit(1);
  }

  const fileStat = fs.statSync(configPath);
  if (fileStat.size < 256) {
    console.error(`Refusing migration: ${configPath} is too small (${fileStat.size} bytes)`);
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  await initializeSecretsCache();
  const partial = {};
  let changed = false;

  for (const { path: keyPath, smEntry } of SENSITIVE_CONFIG_KEYS) {
    const current = getByPath(raw, keyPath);
    const plain = readPlainSecret(current, smEntry);
    if (plain) {
      partial[smEntry] = plain;
      changed = true;
    }
    const inSm = (getSecret(smEntry) || '').trim();
    const willHaveInSm = plain || inSm;
    if (willHaveInSm && !isSmPointer(current)) {
      setByPath(raw, keyPath, entryKeyToConfigPointer(smEntry));
      changed = true;
    }
  }

  if (!changed) {
    console.log('No migration needed — config already uses _sm pointers and no plaintext secrets found.');
    process.exit(0);
  }

  if (Object.keys(partial).length > 0) {
    const put = await mergeAndPutBundle(partial);
    if (!put.success) {
      console.error('PutSecretValue failed:', put.error);
      process.exit(1);
    }
    await reloadSecretsFromAws();
    console.log(`Merged ${Object.keys(partial).length} secret(s) into AWS Secrets Manager bundle.`);
  }

  await atomicWriteJSON(configPath, raw, { backup: true });
  console.log(`Rewrote ${configPath} with _sm pointers only.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
