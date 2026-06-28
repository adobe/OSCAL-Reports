#!/usr/bin/env node
/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Repair Generic_OIDC _cfgenc when /data/.field-secret was randomly generated and
 * no longer matches the Docker-bundled config envelope.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decryptConfigSecret, isCfgEncPointer } from '../utils/configFieldCrypto.js';
import { getDockerBootstrapFieldSecret } from '../utils/dockerBootstrapSecrets.js';
import { getEffectiveGenericOidcClientSecret } from '../auth/genericOidc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECRET_PATH = ['ssoConfig', 'oauth', 'providers', 'Generic_OIDC', 'clientSecret'];

function getNested(obj, keys) {
  let cur = obj;
  for (const k of keys) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = cur[k];
  }
  return cur;
}

function setNested(obj, keys, value) {
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const k = keys[i];
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
}

function tryDecryptWithKey(enc, fieldSecret) {
  if (!isCfgEncPointer(enc)) return '';
  const prev = process.env.OSCAL_CONFIG_FIELD_SECRET;
  process.env.OSCAL_CONFIG_FIELD_SECRET = fieldSecret;
  try {
    return decryptConfigSecret(enc).trim();
  } catch {
    return '';
  } finally {
    if (prev === undefined) delete process.env.OSCAL_CONFIG_FIELD_SECRET;
    else process.env.OSCAL_CONFIG_FIELD_SECRET = prev;
  }
}

function main() {
  const configPath = (process.env.CONFIG_PATH || '/data/config.json').trim();
  const bundledPath = (process.env.DOCKER_BUNDLED_CONFIG || '/app/config/app/config.json').trim();
  const fieldSecretFile = (process.env.DOCKER_FIELD_SECRET_FILE || '/data/.field-secret').trim();

  if (!fs.existsSync(configPath)) {
    process.exit(0);
  }
  if (!fs.existsSync(bundledPath)) {
    process.exit(0);
  }

  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const bundled = JSON.parse(fs.readFileSync(bundledPath, 'utf8'));
  const volumeEnc = getNested(cfg, SECRET_PATH);
  const bundledEnc = getNested(bundled, SECRET_PATH);

  if (!isCfgEncPointer(bundledEnc)) {
    process.exit(0);
  }

  const bootstrapKey = getDockerBootstrapFieldSecret();
  const currentFieldKey = (process.env.OSCAL_CONFIG_FIELD_SECRET || '').trim()
    || (fs.existsSync(fieldSecretFile) ? fs.readFileSync(fieldSecretFile, 'utf8').trim() : '');

  if (typeof volumeEnc === 'string' && volumeEnc.trim() && !isCfgEncPointer(volumeEnc)) {
    process.exit(0);
  }

  if (isCfgEncPointer(volumeEnc) && currentFieldKey && tryDecryptWithKey(volumeEnc, currentFieldKey)) {
    process.exit(0);
  }

  if (isCfgEncPointer(volumeEnc) && tryDecryptWithKey(volumeEnc, bootstrapKey)) {
    if (currentFieldKey !== bootstrapKey) {
      fs.writeFileSync(fieldSecretFile, `${bootstrapKey}\n`, { mode: 0o600 });
      console.log('Aligned Docker field secret with bundled Generic_OIDC _cfgenc');
    }
    process.exit(0);
  }

  if (getEffectiveGenericOidcClientSecret(cfg.ssoConfig?.oauth?.providers?.Generic_OIDC)) {
    process.exit(0);
  }

  const plainFromBundled = tryDecryptWithKey(bundledEnc, bootstrapKey);
  if (!plainFromBundled) {
    console.error('Docker Generic OIDC repair: bundled _cfgenc could not be decrypted');
    process.exit(1);
  }

  setNested(cfg, SECRET_PATH, bundledEnc);
  fs.writeFileSync(configPath, `${JSON.stringify(cfg, null, 2)}\n`, { mode: 0o600 });

  fs.writeFileSync(fieldSecretFile, `${bootstrapKey}\n`, { mode: 0o600 });
  process.env.OSCAL_CONFIG_FIELD_SECRET = bootstrapKey;

  console.log('Repaired Generic_OIDC _cfgenc and aligned Docker field secret');
}

main();
