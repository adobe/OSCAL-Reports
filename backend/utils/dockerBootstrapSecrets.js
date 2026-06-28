/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Docker image bootstrap for _cfgenc (field encryption key only — not the OAuth client secret).
 * OAuth client secrets stay as _cfgenc blobs in bundled config.json; this key decrypts them at runtime.
 */
import crypto from 'crypto';
import fs from 'fs';

/** Image-family identifier; bump when rotating bundled _cfgenc envelopes. */
const DOCKER_FIELD_SECRET_VERSION = 'oscal-docker-cfgenc-v1';

/**
 * Stable field secret for Docker /data/.field-secret on first boot.
 * @returns {string}
 */
export function getDockerBootstrapFieldSecret() {
  return crypto
    .createHmac('sha256', 'oscal-report-generator-docker-bootstrap')
    .update(DOCKER_FIELD_SECRET_VERSION)
    .digest('base64url');
}

/**
 * @returns {boolean}
 */
export function isDockerRuntime() {
  if (process.env.OSCAL_DOCKER_IMAGE === '1') return true;
  try {
    if (fs.existsSync('/.dockerenv')) return true;
  } catch (_) {
    /* ignore */
  }
  if ((process.env.CONFIG_PATH || '').startsWith('/data/')) return true;
  return false;
}
