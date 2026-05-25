/**
 * Verify an OSCAL report URL via backend proxy (SSRF-safe).
 *
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */

import axios from './safeAxios.js';

/**
 * @param {string} urlToVerify
 * @param {object} [authConfig] axios config (e.g. from getAuthConfig())
 * @returns {Promise<{ ok: boolean, message: string }>}
 */
export async function verifyOscalReportUrl(urlToVerify, authConfig = {}) {
  const url = typeof urlToVerify === 'string' ? urlToVerify.trim() : '';
  if (!url) {
    return { ok: false, message: '❌ Please enter a URL to verify' };
  }
  try {
    // eslint-disable-next-line no-undef -- browser URL API
    new URL(url);
  } catch {
    return { ok: false, message: '❌ Invalid URL format' };
  }

  try {
    const response = await axios.post('/api/proxy-fetch', { url }, authConfig);
    let data = response.data;
    const hasProxyWrapper = data?.success !== undefined && data?.status !== undefined && data?.data !== undefined;
    if (hasProxyWrapper) {
      data = data.data;
    }
    if (data && data['system-security-plan']) {
      const ssp = data['system-security-plan'];
      const metadata = ssp.metadata || {};
      const title = metadata.title || 'Untitled';
      const version = metadata.version || 'N/A';
      const oscalVersion = metadata['oscal-version'] || 'N/A';
      const systemName = ssp['system-characteristics']?.['system-name'] || 'N/A';
      return {
        ok: true,
        message: `✅ Valid OSCAL report found!\nTitle: ${title}\nSystem: ${systemName}\nVersion: ${version}\nOSCAL: ${oscalVersion}`,
      };
    }
    return {
      ok: false,
      message: `⚠️ URL is accessible but does not contain a valid OSCAL System Security Plan structure\n\nFound keys: ${data ? Object.keys(data).join(', ') : 'No data'}`,
    };
  } catch (error) {
    let errorMessage = '❌ Verification failed: ';
    if (error.response) {
      errorMessage += error.response.data?.error || error.response.statusText || 'Server error';
    } else if (error.message) {
      errorMessage += error.message;
    } else {
      errorMessage += 'Unknown error';
    }
    return { ok: false, message: errorMessage };
  }
}
