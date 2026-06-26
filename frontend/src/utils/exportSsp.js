/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Shared OSCAL JSON export — same generate-ssp path for all use cases.
 */
import axios from './safeAxios.js';
import { complianceReportFileName } from './complianceReportFileName.js';

export { complianceReportFileName };

const DEFAULT_GENERATE_TIMEOUT_MS = 300000;

/**
 * @param {object} sspJson
 * @param {string} filename
 */
export function downloadJsonFile(sspJson, filename) {
  const blob = new Blob([JSON.stringify(sspJson, null, 2)], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/**
 * POST /api/generate-ssp — used by main controls table and MRC after prepare.
 * @param {{ metadata?: object, controls: Array, systemInfo: object, validationOptions?: object }} payload
 * @param {object} [axiosConfig]
 * @returns {Promise<object>}
 */
export async function postGenerateSsp(payload, axiosConfig = {}) {
  const response = await axios.post(
    '/api/generate-ssp',
    payload,
    { timeout: DEFAULT_GENERATE_TIMEOUT_MS, ...axiosConfig },
  );
  return response.data;
}

/**
 * POST /api/prepare-ssp-export — baseline SSP + edits → same control/systemInfo shape as main app.
 * @param {object} existingSSP
 * @param {object} [controlEdits]
 * @param {object} [axiosConfig]
 * @returns {Promise<{ controls: Array, systemInfo: object, metadata: object }>}
 */
export async function prepareSspExportFromBaseline(existingSSP, controlEdits = {}, axiosConfig = {}) {
  const response = await axios.post(
    '/api/prepare-ssp-export',
    { existingSSP, controlEdits },
    axiosConfig,
  );
  return response.data;
}

/**
 * Full export: generate-ssp then browser download (main workflow).
 * @param {{ metadata?: object, controls: Array, systemInfo: object, validationOptions?: object }} args
 * @param {object} [axiosConfig]
 * @returns {Promise<object>} generated SSP JSON
 */
export async function exportSspJsonDownload({ metadata, controls, systemInfo, validationOptions = {} }, axiosConfig = {}) {
  const ssp = await postGenerateSsp({
    metadata,
    controls,
    systemInfo,
    validationOptions,
  }, axiosConfig);
  const filename = complianceReportFileName(systemInfo?.systemName, 'json');
  downloadJsonFile(ssp, filename);
  return ssp;
}

/**
 * Multi-Report Comparison: prepare from baseline + edits, then same generate-ssp as main app.
 * @param {{ existingSSP: object, controlEdits?: object, validationOptions?: object }} args
 * @param {object} [axiosConfig]
 * @returns {Promise<object>} generated SSP JSON
 */
export async function exportBaselineSspWithEdits(
  { existingSSP, controlEdits = {}, validationOptions = {} },
  axiosConfig = {},
) {
  const prepared = await prepareSspExportFromBaseline(existingSSP, controlEdits, axiosConfig);
  return exportSspJsonDownload({
    metadata: prepared.metadata,
    controls: prepared.controls,
    systemInfo: prepared.systemInfo,
    validationOptions,
  }, axiosConfig);
}

/**
 * Build SSP JSON for validation without download.
 * @param {{ existingSSP: object, controlEdits?: object, validationOptions?: object }} args
 * @param {object} [axiosConfig]
 * @returns {Promise<object>}
 */
export async function buildSspFromBaselineWithEdits(
  { existingSSP, controlEdits = {}, validationOptions = {} },
  axiosConfig = {},
) {
  const prepared = await prepareSspExportFromBaseline(existingSSP, controlEdits, axiosConfig);
  return postGenerateSsp({
    metadata: prepared.metadata,
    controls: prepared.controls,
    systemInfo: prepared.systemInfo,
    validationOptions,
  }, axiosConfig);
}
