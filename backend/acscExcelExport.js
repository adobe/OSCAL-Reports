/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Unified ACSC June 2026 Excel export for SOA, SSP, and CCM (single workbook layout).
 */
import { generateCCMExport } from './ccmExport.js';

/** One filename for all SOA/SSP/CCM Excel exports (same control dataset). */
export const UNIFIED_ACSC_EXCEL_FILENAME = 'soa-ssp-ccm-june-2026.xlsx';

/**
 * ACSC Cloud Controls Matrix June 2026 is the superset layout (Principles + Controls +
 * provider/consumer columns). The same in-app controls[] populate SOA, SSP, and CCM views.
 * @param {Array<Object>} controls
 * @param {Object} systemInfo
 * @param {{ includeExtensions?: boolean }} [options]
 * @returns {Promise<import('exceljs').Workbook>}
 */
export async function generateAcscExcelExport(controls, systemInfo, options = {}) {
  return generateCCMExport(controls, systemInfo, options);
}
