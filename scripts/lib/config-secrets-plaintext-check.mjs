/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Exit 0 when config.json has no plaintext sensitive secrets; exit 1 otherwise.
 * Usage: node config-secrets-plaintext-check.mjs /path/to/config.json
 */
import fs from 'fs';
import { validateConfigSecretsProtected } from '../../backend/utils/configSecretMigration.js';

const configPath = process.argv[2];
if (!configPath) {
  console.error('Usage: node config-secrets-plaintext-check.mjs CONFIG.json');
  process.exit(2);
}

if (!fs.existsSync(configPath)) {
  process.exit(0);
}

const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const { ok, paths } = validateConfigSecretsProtected(raw);
if (!ok) {
  console.error('Plaintext secrets in config:', paths.join(', '));
  process.exit(1);
}
process.exit(0);
