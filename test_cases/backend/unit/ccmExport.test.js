/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { describe, test, expect } from '@jest/globals';
import ExcelJS from 'exceljs';
import { generateCCMExport } from '../../../backend/ccmExport.js';
import { CCM_JUNE_2026 } from '../../../backend/utils/acscTemplateSchemas.js';

const sampleControls = [
  {
    id: 'GOV-01',
    title: 'Executive cyber security accountability',
    function: 'Govern',
    groupTitle: 'Govern',
    status: 'not-assessed',
    parts: [{ prose: 'The board is accountable for cyber security.' }],
  },
  {
    id: 'ISM-1997',
    title: 'Embedding cyber security',
    guideline: 'Guidelines for cyber security roles',
    section: 'Board of directors and executive committee',
    revision: '1',
    updated: 'Dec-25',
    nc: 'Yes',
    status: 'effective',
    implementation: 'Implemented via governance framework.',
    remarks: 'Reviewed annually.',
    controlOwner: 'Cloud Service Provider',
    testingObjective: 'Verify governance roles',
    riskRating: 'Low',
  },
];

describe('ccmExport', () => {
  test('creates ACSC June 2026 workbook sheets', async () => {
    const workbook = await generateCCMExport(sampleControls, { systemName: 'Test CSP' });
    expect(workbook.getWorksheet('Info')).toBeTruthy();
    expect(workbook.getWorksheet(CCM_JUNE_2026.sheets.principles)).toBeTruthy();
    expect(workbook.getWorksheet(CCM_JUNE_2026.sheets.controls)).toBeTruthy();
    expect(workbook.getWorksheet('Summary')).toBeFalsy();
    expect(workbook.getWorksheet('Cloud Control Matrix')).toBeFalsy();
  });

  test('controls sheet has ACSC headers in order followed by extensions', async () => {
    const workbook = await generateCCMExport(sampleControls, { systemName: 'Test CSP' });
    const sheet = workbook.getWorksheet(CCM_JUNE_2026.sheets.controls);
    expect(sheet.getCell(1, 1).value).toBe('Guideline');
    expect(sheet.getCell(1, 4).value).toBe('Identifier');
    expect(sheet.getCell(1, 20).value).toBe('Implementation\nStatus');
    expect(sheet.getCell(1, 26).value).toBe('Responsible Party');
  });

  test('writes principle and control rows to correct sheets', async () => {
    const workbook = await generateCCMExport(sampleControls, { systemName: 'Test CSP' });
    const principles = workbook.getWorksheet(CCM_JUNE_2026.sheets.principles);
    const controls = workbook.getWorksheet(CCM_JUNE_2026.sheets.controls);

    expect(principles.getCell(3, 2).value).toBe('GOV-01');
    expect(controls.getCell(2, 4).value).toBe('ISM-1997');
    expect(controls.getCell(2, 20).value).toBe('Effective');
  });

  test('round-trips through buffer load', async () => {
    const workbook = await generateCCMExport(sampleControls, { systemName: 'Test CSP' });
    const buffer = await workbook.xlsx.writeBuffer();
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(buffer);
    expect(loaded.getWorksheet(CCM_JUNE_2026.sheets.controls)).toBeTruthy();
  });
});
