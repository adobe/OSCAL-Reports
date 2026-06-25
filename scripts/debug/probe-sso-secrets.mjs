#!/usr/bin/env node
/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * EC2 diagnostic: resolve Generic OIDC / Okta client secrets with production env.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
process.chdir(repoRoot);

const { canResolveCfgEnc, decryptConfigSecret, isCfgEncPointer } = await import(
  path.join(repoRoot, 'backend/utils/configFieldCrypto.js')
);
const { getResolvedConfig } = await import(path.join(repoRoot, 'backend/configManager.js'));
const { getEffectiveGenericOidcClientSecret } = await import(
  path.join(repoRoot, 'backend/auth/genericOidc.js')
);
const { getSecret, initializeSecretsCache, isSecretCached } = await import(
  path.join(repoRoot, 'backend/utils/secretsManager.js')
);

const configPath = process.env.CONFIG_PATH || '/opt/oscal/data/config.json';
const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const gencs = raw?.ssoConfig?.oauth?.providers?.Generic_OIDC?.clientSecret;

let decryptLen = 0;
let decryptErr = null;
if (isCfgEncPointer(gencs)) {
  try {
    decryptLen = decryptConfigSecret(gencs).length;
  } catch (e) {
    decryptErr = e.message;
  }
}

await initializeSecretsCache();
const resolved = getResolvedConfig();
const genericResolved = getEffectiveGenericOidcClientSecret(
  resolved?.ssoConfig?.oauth?.providers?.Generic_OIDC,
);
const oktaCs = resolved?.ssoConfig?.oauth?.providers?.okta?.clientSecret;

console.log(
  JSON.stringify(
    {
      configPath,
      canResolveCfgEnc: canResolveCfgEnc(),
      hasSessionSecret: !!(process.env.SESSION_SECRET || '').trim(),
      oscalSecretsMode: process.env.OSCAL_SECRETS_MODE || '',
      genericCfgenc: isCfgEncPointer(gencs),
      genericDecryptWithEnvLen: decryptLen,
      genericDecryptError: decryptErr,
      genericResolvedLen: genericResolved.length,
      oktaResolvedLen: typeof oktaCs === 'string' ? oktaCs.length : 0,
      smHasOkta: isSecretCached('OSCAL/sso-oauth-okta-client-secret'),
      smOktaLen: (getSecret('OSCAL/sso-oauth-okta-client-secret') || '').length,
    },
    null,
    2,
  ),
);
