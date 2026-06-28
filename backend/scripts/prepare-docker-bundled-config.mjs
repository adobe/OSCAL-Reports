#!/usr/bin/env node
/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Build Docker bundled config.json: re-encrypt Generic OIDC client secret with the
 * Docker bootstrap field key (OAuth secret never written plaintext to the image layer).
 *
 * Usage: node backend/scripts/prepare-docker-bundled-config.mjs [sourceExample] [destConfig]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { decryptConfigSecret, encryptConfigSecret } from '../utils/configFieldCrypto.js';
import { getDockerBootstrapFieldSecret } from '../utils/dockerBootstrapSecrets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');

const sourcePath = path.resolve(process.argv[2] || path.join(repoRoot, 'config/app/config.json.example'));
const destPath = path.resolve(process.argv[3] || path.join(repoRoot, 'config/app/config.docker.json'));

const DEV_FIELD_SECRET = 'oscal-config-field-dev-key-change-me';
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

function main() {
  if (!fs.existsSync(sourcePath)) {
    console.error(`Source config not found: ${sourcePath}`);
    process.exit(1);
  }

  const cfg = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const enc = getNested(cfg, SECRET_PATH);
  if (!enc || typeof enc !== 'object' || !enc._cfgenc) {
    console.error('Generic_OIDC.clientSecret _cfgenc missing in source config');
    process.exit(1);
  }

  process.env.OSCAL_CONFIG_FIELD_SECRET = DEV_FIELD_SECRET;
  let plain = '';
  try {
    plain = decryptConfigSecret(enc).trim();
  } catch (err) {
    console.error('Could not decrypt source Generic_OIDC secret (dev field key):', err.message);
    process.exit(1);
  }
  if (!plain) {
    console.error('Generic_OIDC client secret is empty after decrypt');
    process.exit(1);
  }

  process.env.OSCAL_CONFIG_FIELD_SECRET = getDockerBootstrapFieldSecret();
  setNested(cfg, SECRET_PATH, encryptConfigSecret(plain));

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, `${JSON.stringify(cfg, null, 2)}\n`, { mode: 0o600 });
  console.log(`Wrote Docker bundled config: ${destPath}`);
}

main();
