/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */

import { describe, test, expect } from '@jest/globals';
import {
  complianceReportFileName,
  complianceReportContentDisposition,
} from '../../../backend/utils/complianceReportFileName.js';

describe('complianceReportFileName', () => {
  const exportDate = new Date('2026-06-26T12:00:00.000Z');

  test('builds {System}_ComplianceReport_{date}.{ext}', () => {
    expect(complianceReportFileName('AEM Gov Au', 'xlsx', exportDate)).toBe(
      'AEMGovAu_ComplianceReport_2026-06-26.xlsx'
    );
    expect(complianceReportFileName('AEMGovAu', 'json', exportDate)).toBe(
      'AEMGovAu_ComplianceReport_2026-06-26.json'
    );
  });

  test('falls back to System when name is empty after sanitization', () => {
    expect(complianceReportFileName('   ', 'pdf', exportDate)).toBe(
      'System_ComplianceReport_2026-06-26.pdf'
    );
  });

  test('supports compound extensions such as sar.json', () => {
    expect(complianceReportFileName('MyApp', 'sar.json', exportDate)).toBe(
      'MyApp_ComplianceReport_2026-06-26.sar.json'
    );
  });

  test('content disposition quotes filename', () => {
    expect(complianceReportContentDisposition('AEMGovAu', 'xlsx')).toMatch(
      /^attachment; filename="AEMGovAu_ComplianceReport_\d{4}-\d{2}-\d{2}\.xlsx"$/
    );
  });
});
