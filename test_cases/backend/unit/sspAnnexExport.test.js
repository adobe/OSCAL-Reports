/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { describe, test, expect } from '@jest/globals';
import { generateSSPAnnexExport } from '../../../backend/sspAnnexExport.js';
import { SSP_ANNEX_JUNE_2026 } from '../../../backend/utils/acscTemplateSchemas.js';

const sampleControls = [
  {
    id: 'GOV-01',
    title: 'Executive cyber security accountability',
    function: 'Govern',
    status: 'not-assessed',
    parts: [{ prose: 'Accountability statement.' }],
  },
  {
    id: 'ISM-1997',
    title: 'Embedding cyber security',
    guideline: 'Guidelines for cyber security roles',
    section: 'Board of directors and executive committee',
    status: 'effective',
    remarks: 'Annual review complete.',
    controlOwner: 'Internal Service Provider',
  },
];

describe('sspAnnexExport', () => {
  test('creates three ACSC SSP Annex sheets', async () => {
    const workbook = await generateSSPAnnexExport(sampleControls, { systemName: 'Test System' });
    expect(workbook.getWorksheet('Info')).toBeTruthy();
    expect(workbook.getWorksheet(SSP_ANNEX_JUNE_2026.sheets.principles)).toBeTruthy();
    expect(workbook.getWorksheet(SSP_ANNEX_JUNE_2026.sheets.controls)).toBeTruthy();
  });

  test('principles sheet uses seven ACSC columns', async () => {
    const workbook = await generateSSPAnnexExport(sampleControls, { systemName: 'Test System' });
    const sheet = workbook.getWorksheet(SSP_ANNEX_JUNE_2026.sheets.principles);
    expect(sheet.getCell(1, 1).value).toBe('Function');
    expect(sheet.getCell(1, 7).value).toBe('Comments');
    expect(sheet.getCell(2, 2).value).toBe('GOV-01');
  });

  test('controls sheet uses eighteen ACSC columns before extensions', async () => {
    const workbook = await generateSSPAnnexExport(sampleControls, { systemName: 'Test System' });
    const sheet = workbook.getWorksheet(SSP_ANNEX_JUNE_2026.sheets.controls);
    expect(sheet.getCell(1, 1).value).toBe('Guideline');
    expect(sheet.getCell(1, 17).value).toBe('Implementation');
    expect(sheet.getCell(1, 18).value).toBe('Comments');
    expect(sheet.getCell(2, 4).value).toBe('ISM-1997');
    expect(sheet.getCell(2, 17).value).toBe('Effective');
  });
});
