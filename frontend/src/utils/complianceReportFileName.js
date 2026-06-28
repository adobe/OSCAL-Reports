/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Compliance report download filenames: {SystemName}_ComplianceReport_{YYYY-MM-DD}.{ext}
 * Example: AEMGovAu_ComplianceReport_2026-06-26.xlsx
 *
 * Keep in sync with backend/utils/complianceReportFileName.js
 */

/**
 * @param {string} [systemName] From System Information form (systemName field).
 * @param {string} [extension] File extension without leading dot (e.g. json, xlsx, pdf, sar.json).
 * @param {Date} [exportDate] Defaults to current date (UTC calendar day).
 * @returns {string}
 */
export function complianceReportFileName(systemName, extension = 'json', exportDate = new Date()) {
  const sanitizedName = String(systemName || '')
    .replace(/[^a-zA-Z0-9]/g, '')
    || 'System';
  const datePart = exportDate instanceof Date
    ? exportDate.toISOString().split('T')[0]
    : String(exportDate);
  const ext = String(extension || 'json').replace(/^\./, '');
  return `${sanitizedName}_ComplianceReport_${datePart}.${ext}`;
}
