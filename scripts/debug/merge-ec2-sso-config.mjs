#!/usr/bin/env node
/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Merge SSO + SMTP settings so both instances match (Okta + Generic OIDC + SMTP).
 * Usage: node scripts/debug/merge-ec2-sso-config.mjs [/path/to/reference-config.json]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
process.chdir(repoRoot);

const CONFIG_PATH = process.env.CONFIG_PATH || '/opt/oscal/data/config.json';
const REF_PATH = process.argv[2] || process.env.OSCAL_SSO_MERGE_REF || '';

const { atomicWriteJSON } = await import(path.join(repoRoot, 'backend/utils/atomicWrite.js'));
const {
  entryKeyToConfigPointer,
  initializeSecretsCache,
  getSecret,
} = await import(path.join(repoRoot, 'backend/utils/secretsManager.js'));

function readCfg(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function pickOkta(a, b) {
  const score = (p) => (p?.enabled ? 10 : 0) + (p?.domain ? 30 : 0) + (p?.clientId ? 10 : 0);
  return score(a) >= score(b) ? a : b;
}

function pickGeneric(a, b) {
  const score = (p) =>
    (p?.enabled ? 10 : 0) + (p?.issuerUrl || p?.discoveryUrl ? 40 : 0) + (p?.clientId ? 10 : 0);
  return score(a) >= score(b) ? a : b;
}

const local = readCfg(CONFIG_PATH);
const ref = REF_PATH && fs.existsSync(REF_PATH) ? readCfg(REF_PATH) : null;

const lp = local?.ssoConfig?.oauth?.providers || {};
const rp = ref?.ssoConfig?.oauth?.providers || {};

const okta = pickOkta(lp.okta || {}, rp.okta || {});
const generic = pickGeneric(lp.Generic_OIDC || {}, rp.Generic_OIDC || {});

local.ssoConfig = local.ssoConfig || {};
local.ssoConfig.oauth = local.ssoConfig.oauth || {};
local.ssoConfig.oauth.providers = local.ssoConfig.oauth.providers || {};

local.ssoConfig.oauth.providers.okta = {
  ...okta,
  clientSecret: entryKeyToConfigPointer('OSCAL/sso-oauth-okta-client-secret'),
};
local.ssoConfig.oauth.providers.Generic_OIDC = {
  ...generic,
  tlsRelaxed: true,
};
await initializeSecretsCache();
const genericSm = (getSecret('OSCAL/sso-oauth-generic-oidc-client-secret') || '').trim();
const existingGenericCs = lp.Generic_OIDC?.clientSecret;
if (genericSm) {
  local.ssoConfig.oauth.providers.Generic_OIDC.clientSecret = entryKeyToConfigPointer(
    'OSCAL/sso-oauth-generic-oidc-client-secret',
  );
} else if (typeof existingGenericCs === 'string' && existingGenericCs.trim()) {
  local.ssoConfig.oauth.providers.Generic_OIDC.clientSecret = existingGenericCs.trim();
} else if (typeof rp.Generic_OIDC?.clientSecret === 'string' && rp.Generic_OIDC.clientSecret.trim()) {
  local.ssoConfig.oauth.providers.Generic_OIDC.clientSecret = rp.Generic_OIDC.clientSecret.trim();
} else {
  local.ssoConfig.oauth.providers.Generic_OIDC.clientSecret = entryKeyToConfigPointer(
    'OSCAL/sso-oauth-generic-oidc-client-secret',
  );
}

const smtpLocal = local?.messagingConfig?.email || {};
const smtpRef = ref?.messagingConfig?.email || {};
local.messagingConfig = local.messagingConfig || {};
local.messagingConfig.email = {
  ...smtpRef,
  ...smtpLocal,
  smtpPassword: entryKeyToConfigPointer('OSCAL/smtp-password'),
};

local.lastModified = new Date().toISOString();
await atomicWriteJSON(CONFIG_PATH, local, { backup: true });

console.log(
  JSON.stringify(
    {
      success: true,
      oktaEnabled: local.ssoConfig.oauth.providers.okta.enabled,
      oktaDomain: local.ssoConfig.oauth.providers.okta.domain,
      genericEnabled: local.ssoConfig.oauth.providers.Generic_OIDC.enabled,
      genericIssuer: local.ssoConfig.oauth.providers.Generic_OIDC.issuerUrl,
      smtpHost: local.messagingConfig.email.smtpHost,
    },
    null,
    2,
  ),
);
