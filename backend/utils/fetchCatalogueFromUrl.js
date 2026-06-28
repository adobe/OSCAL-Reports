/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Fetch and parse an OSCAL catalogue/profile from a remote URL (SSRF-validated).
 */

import https from 'https';
import axios from './safeAxios.js';
import { validateUrl } from './urlValidator.js';
import { extractControlsWithIsmMetadata } from './acscCatalogProps.js';

/**
 * @param {string} rawUrl
 * @param {{ allowPrivateIPs?: boolean, allowLocalhost?: boolean, timeoutMs?: number }} [urlValidationOptions]
 * @returns {Promise<{ catalogue: object, controls: object[], metadata: object|undefined }>}
 */
export async function fetchCatalogueFromUrl(rawUrl, urlValidationOptions = {}) {
  if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
    const err = new Error('URL is required');
    err.statusCode = 400;
    throw err;
  }

  const { timeoutMs = 120000, ...validateOptions } = urlValidationOptions;

  const urlValidation = await validateUrl(rawUrl.trim(), validateOptions);
  if (!urlValidation.valid) {
    const err = new Error(
      urlValidation.blocked ? 'Access to this URL is forbidden' : 'Invalid URL'
    );
    err.statusCode = urlValidation.blocked ? 403 : 400;
    err.details = urlValidation.error;
    if (urlValidation.blocked) {
      err.code = 'SSRF_BLOCKED';
    }
    throw err;
  }

  let response;
  try {
    response = await axios.get(urlValidation.url, {
      headers: { Accept: 'application/json' },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: timeoutMs,
    });
  } catch (error) {
    const httpStatus = error.response?.status;
    const err = new Error(
      httpStatus
        ? `Failed to fetch catalogue (HTTP ${httpStatus})`
        : 'Failed to fetch catalogue (network error)'
    );
    err.statusCode = httpStatus === 404 ? 404 : 500;
    err.details = error.message;
    err.httpStatus = httpStatus;
    throw err;
  }

  const catalogue = response.data;
  const controls = extractControlsWithIsmMetadata(catalogue);

  return {
    catalogue,
    controls,
    metadata: catalogue.catalog?.metadata || catalogue.metadata,
  };
}
