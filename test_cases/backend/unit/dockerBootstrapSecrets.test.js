/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getDockerBootstrapFieldSecret } from '../../../backend/utils/dockerBootstrapSecrets.js';
import { decryptConfigSecret, encryptConfigSecret } from '../../../backend/utils/configFieldCrypto.js';

describe('dockerBootstrapSecrets', () => {
  it('returns stable bootstrap field secret', () => {
    expect(getDockerBootstrapFieldSecret()).toBe(getDockerBootstrapFieldSecret());
    expect(getDockerBootstrapFieldSecret().length).toBeGreaterThan(20);
  });

  it('prepare-docker flow: re-encrypt Generic_OIDC for Docker bootstrap key', () => {
    const prev = process.env.OSCAL_CONFIG_FIELD_SECRET;
    process.env.OSCAL_CONFIG_FIELD_SECRET = 'oscal-config-field-dev-key-change-me';
    const examplePath = path.join(process.cwd(), '../../config/app/config.json.example');
    const cfg = JSON.parse(fs.readFileSync(examplePath, 'utf8'));
    const plain = decryptConfigSecret(cfg.ssoConfig.oauth.providers.Generic_OIDC.clientSecret);

    process.env.OSCAL_CONFIG_FIELD_SECRET = getDockerBootstrapFieldSecret();
    const dockerEnc = encryptConfigSecret(plain);
    const roundTrip = decryptConfigSecret(dockerEnc);
    expect(roundTrip).toBe(plain);

    if (prev === undefined) delete process.env.OSCAL_CONFIG_FIELD_SECRET;
    else process.env.OSCAL_CONFIG_FIELD_SECRET = prev;
  });
});
