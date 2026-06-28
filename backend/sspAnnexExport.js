/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * ACSC June 2026 System Security Plan Annex Excel export.
 */
import { SSP_ANNEX_JUNE_2026 } from './utils/acscTemplateSchemas.js';
import { splitPrinciplesAndControls } from './utils/acscControlClassifier.js';
import { buildAcscWorkbook } from './utils/acscExcelBuilder.js';

/**
 * @param {Array<Object>} controls
 * @param {Object} systemInfo
 * @param {{ includeExtensions?: boolean }} [options]
 * @returns {Promise<import('exceljs').Workbook>}
 */
export async function generateSSPAnnexExport(controls, systemInfo, options = {}) {
  const { principles, controls: ismControls } = splitPrinciplesAndControls(controls || []);

  return buildAcscWorkbook(SSP_ANNEX_JUNE_2026, controls || [], systemInfo || {}, {
    includeExtensions: options.includeExtensions !== false,
    principles,
    controls: ismControls,
  });
}
