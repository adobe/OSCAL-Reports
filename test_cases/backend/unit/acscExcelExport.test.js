/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { describe, test, expect } from '@jest/globals';
import { generateAcscExcelExport } from '../../../backend/acscExcelExport.js';
import { CCM_JUNE_2026 } from '../../../backend/utils/acscTemplateSchemas.js';

describe('acscExcelExport', () => {
  test('produces ACSC CCM June 2026 workbook layout', async () => {
    const workbook = await generateAcscExcelExport(
      [{ id: 'ISM-1997', title: 'Test', status: 'not-assessed' }],
      { systemName: 'Unified Export' }
    );
    expect(workbook.getWorksheet(CCM_JUNE_2026.sheets.principles)).toBeTruthy();
    expect(workbook.getWorksheet(CCM_JUNE_2026.sheets.controls)).toBeTruthy();
    expect(workbook.getWorksheet('Summary')).toBeFalsy();
  });
});
