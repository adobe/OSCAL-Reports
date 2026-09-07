/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * One-time migration: plaintext / _pass / _cfgenc secrets in config.json → _cfgenc pointers.
 * Run locally or in Docker with OSCAL_CONFIG_FIELD_SECRET or SESSION_SECRET set.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  isAwsSmMode,
} from '../utils/secretsManager.js';
import {
  ensureConfigSecretsProtected,
} from '../utils/configSecretMigration.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getConfigPath() {
  const env = (process.env.CONFIG_PATH || '').trim();
  if (env) return path.resolve(env);
  if (fs.existsSync('/data/config.json')) return '/data/config.json';
  return path.join(__dirname, '../../config/app/config.json');
}

async function main() {
  if (isAwsSmMode()) {
    console.error('Use migrate-config-to-sm.mjs when OSCAL_SECRETS_MODE=aws-sm');
    process.exit(1);
  }

  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    console.error(`Config not found: ${configPath}`);
    process.exit(1);
  }

  const result = await ensureConfigSecretsProtected(configPath, {
    refusePlaintext: true,
    allowPassResolution: true,
  });
  if (!result.ok) {
    console.error('Migration failed:', result.errors.join('; '));
    if (result.plaintextPaths?.length) {
      console.error('Plaintext paths:', result.plaintextPaths.join(', '));
    }
    process.exit(1);
  }

  if (result.migrated?.length > 0) {
    console.log(`Migrated ${result.migrated.length} secret(s) to _cfgenc in ${configPath}`);
    console.log('Paths:', result.migrated.join(', '));
  } else {
    console.log('No migration needed — config already uses _cfgenc or has no plaintext secrets.');
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
