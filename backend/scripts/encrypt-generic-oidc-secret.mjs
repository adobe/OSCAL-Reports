#!/usr/bin/env node
/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * One-shot helper: encrypt GENERIC_OIDC client secret for config.json.example (_cfgenc).
 * Usage: GENERIC_OIDC_CLIENT_SECRET='...' OSCAL_CONFIG_FIELD_SECRET='...' node backend/scripts/encrypt-generic-oidc-secret.mjs
 */
import { encryptConfigSecret } from '../utils/configFieldCrypto.js';

const secret = (process.env.GENERIC_OIDC_CLIENT_SECRET || '').trim();
if (!secret) {
  console.error('Set GENERIC_OIDC_CLIENT_SECRET in the environment.');
  process.exit(1);
}

const enc = encryptConfigSecret(secret);
console.log(JSON.stringify(enc, null, 2));
