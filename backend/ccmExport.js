/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 *
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { CCM_JUNE_2026 } from './utils/acscTemplateSchemas.js';
import { splitPrinciplesAndControls } from './utils/acscControlClassifier.js';
import { buildAcscWorkbook } from './utils/acscExcelBuilder.js';

/**
 * Generate ACSC June 2026 Cloud Controls Matrix Excel workbook.
 * @param {Array<Object>} controls
 * @param {Object} systemInfo
 * @param {{ includeExtensions?: boolean }} [options]
 * @returns {Promise<import('exceljs').Workbook>}
 */
export async function generateCCMExport(controls, systemInfo, options = {}) {
  const { principles, controls: ismControls } = splitPrinciplesAndControls(controls || []);

  return buildAcscWorkbook(CCM_JUNE_2026, controls || [], systemInfo || {}, {
    includeExtensions: options.includeExtensions !== false,
    principles,
    controls: ismControls,
  });
}

export { formatAcscStatus } from './utils/acscExcelBuilder.js';
