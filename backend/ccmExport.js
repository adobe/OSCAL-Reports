/**
 * Cloud Control Matrix (CCM) Excel Export Module
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license GPL-3.0-or-later
 * 
 * Generate Cloud Control Matrix Excel export
 * Based on ACSC ISM Cloud Controls Matrix Template (September 2025)
 * Template: https://www.cyber.gov.au/sites/default/files/2025-09/Cloud%20controls%20matrix%20template%20%28September%202025%29.xlsx
 */

import ExcelJS from 'exceljs';
export async function generateCCMExport(controls, systemInfo) {
  const workbook = new ExcelJS.Workbook();
  
  // Set workbook properties
  workbook.creator = systemInfo.systemName || 'Keekar\'s OSCAL SOA/SSP/CCM Generator';
  workbook.lastModifiedBy = 'Keekar\'s OSCAL SOA/SSP/CCM Generator';
  workbook.created = new Date();
  workbook.modified = new Date();
  
  // Create CCM sheet
  const ccmSheet = workbook.addWorksheet('Cloud Control Matrix', {
    properties: { tabColor: { argb: 'FF4472C4' } }
  });
  
  // Define CCM columns based on ACSC template
  ccmSheet.columns = [
    { header: 'Control ID', key: 'controlId', width: 12 },
    { header: 'Control Domain', key: 'domain', width: 18 },
    { header: 'Control Title', key: 'title', width: 35 },
    { header: 'Control Description', key: 'specification', width: 45 },
    { header: 'ISM Reference', key: 'ismReference', width: 15 },
    { header: 'Implementation Status', key: 'status', width: 18 },
    { header: 'Implementation Details', key: 'implementation', width: 45 },
    { header: 'Responsible Party', key: 'responsibleParty', width: 22 },
    { header: 'Consumer Guidance', key: 'consumerGuidance', width: 40 },
    { header: 'Cloud Provider Responsibility', key: 'controlOwner', width: 28 },
    { header: 'Implementation Date', key: 'implementationDate', width: 15 },
    { header: 'Review Date', key: 'reviewDate', width: 15 },
    { header: 'Next Review Date', key: 'nextReviewDate', width: 15 },
    { header: 'Control Type', key: 'controlType', width: 35 },
    { header: 'Evidence Location', key: 'evidence', width: 35 },
    { header: 'Testing Method', key: 'testingProcedure', width: 35 },
    { header: 'Testing Frequency', key: 'testingFrequency', width: 18 },
    { header: 'Last Test Date', key: 'lastTestDate', width: 15 },
    { header: 'API URL', key: 'apiUrl', width: 40 },
    { header: 'API Credential ID', key: 'apiCredentialId', width: 30 },
    { header: 'API Response Data', key: 'apiResponseData', width: 45 },
    { header: 'API Data History', key: 'apiDataHistory', width: 60 },
    { header: 'Risk Level', key: 'riskRating', width: 12 },
    { header: 'Residual Risk', key: 'residualRisk', width: 12 },
    { header: 'Related Frameworks', key: 'frameworks', width: 28 },
    { header: 'Compensating Controls', key: 'compensatingControls', width: 35 },
    { header: 'Exceptions/Deviations', key: 'exceptions', width: 35 },
    { header: 'Justification', key: 'justification', width: 35 },
    { header: 'Additional Notes', key: 'remarks', width: 35 }
  ];
  
  // Style the header row
  const headerRow = ccmSheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' }
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.height = 40;
  
  // Add borders to header
  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };
  });
  
  // Add data rows
  controls.forEach((control, index) => {
    const row = ccmSheet.addRow({
      controlId: control.id,
      domain: control.groupTitle || extractDomain(control.id),
      title: control.title,
      specification: extractSpecification(control),
      ismReference: control.ismReference || control.id,
      status: formatStatus(control.status || 'not-assessed'),
      implementation: control.implementation || '',
      responsibleParty: control.responsibleParty || '',
      consumerGuidance: control.consumerGuidance || '',
      controlOwner: control.controlOwner || '',
      implementationDate: control.implementationDate || '',
      reviewDate: control.reviewDate || '',
      nextReviewDate: control.nextReviewDate || '',
      controlType: control.controlType || '',
      evidence: control.evidence || '',
      testingProcedure: control.testingProcedure || '',
      testingFrequency: control.testingFrequency || '',
      lastTestDate: control.lastTestDate || '',
      apiUrl: control.apiUrl || '',
      apiCredentialId: control.apiCredentialId || '',
      apiResponseData: control.apiResponseData ? JSON.stringify(control.apiResponseData, null, 2) : '',
      apiDataHistory: control.apiDataHistory ? JSON.stringify(control.apiDataHistory, null, 2) : '',
      riskRating: control.riskRating || '',
      residualRisk: control.residualRisk || '',
      frameworks: control.frameworks || '',
      compensatingControls: control.compensatingControls || '',
      exceptions: control.exceptions || '',
      justification: control.justification || '',
      remarks: control.remarks || ''
    });
    
    // Apply row styling
    row.alignment = { vertical: 'top', wrapText: true };
    row.height = Math.max(30, Math.min(100, row.height));
    
    // Add borders
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
        right: { style: 'thin', color: { argb: 'FFD3D3D3' } }
      };
    });
    
    // Color code by status
    const statusCell = row.getCell('status');
    switch (control.status) {
      case 'not-assessed':
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFC084FC' } // Purple/Lavender
        };
        statusCell.font = { color: { argb: 'FF1F2937' } };
        break;
      case 'effective':
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF86EFAC' } // Green
        };
        statusCell.font = { color: { argb: 'FF1F2937' } };
        break;
      case 'alternate-control':
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFBBF7D0' } // Light Green
        };
        statusCell.font = { color: { argb: 'FF1F2937' } };
        break;
      case 'ineffective':
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFECACA' } // Pink
        };
        statusCell.font = { color: { argb: 'FF1F2937' } };
        break;
      case 'no-visibility':
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF000000' } // Black
        };
        statusCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
        break;
      case 'not-implemented':
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFCA5A5' } // Red
        };
        statusCell.font = { color: { argb: 'FF1F2937' } };
        break;
      case 'not-applicable':
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFD1D5DB' } // Gray
        };
        statusCell.font = { color: { argb: 'FF1F2937' } };
        break;
      default:
        statusCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFC084FC' } // Purple/Lavender (Not Assessed)
        };
        statusCell.font = { color: { argb: 'FF1F2937' } };
    }
  });
  
  // Add summary sheet
  const summarySheet = workbook.addWorksheet('Summary', {
    properties: { tabColor: { argb: 'FF28A745' } }
  });
  
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 40 },
    { header: 'Value', key: 'value', width: 30 }
  ];
  
  // Style summary header
  const summaryHeaderRow = summarySheet.getRow(1);
  summaryHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  summaryHeaderRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF28A745' }
  };
  
  // Calculate statistics
  const stats = {
    totalControls: controls.length,
    effective: controls.filter(c => c.status === 'effective').length,
    alternateControl: controls.filter(c => c.status === 'alternate-control').length,
    ineffective: controls.filter(c => c.status === 'ineffective').length,
    noVisibility: controls.filter(c => c.status === 'no-visibility').length,
    notImplemented: controls.filter(c => c.status === 'not-implemented').length,
    notApplicable: controls.filter(c => c.status === 'not-applicable').length,
    notAssessed: controls.filter(c => c.status === 'not-assessed').length
  };
  
  const implementationRate = stats.totalControls > 0 
    ? (((stats.effective + stats.alternateControl) / stats.totalControls) * 100).toFixed(1) 
    : 0;
  
  // Add summary data
  summarySheet.addRow({ metric: 'System Name', value: systemInfo.systemName || '' });
  summarySheet.addRow({ metric: 'System ID', value: systemInfo.systemId || '' });
  summarySheet.addRow({ metric: 'Security Level', value: systemInfo.securityLevel || '' });
  summarySheet.addRow({ metric: 'Report Date', value: new Date().toLocaleDateString() });
  summarySheet.addRow({ metric: '', value: '' }); // Spacer
  summarySheet.addRow({ metric: 'Total Controls', value: stats.totalControls });
  summarySheet.addRow({ metric: 'Effective', value: stats.effective });
  summarySheet.addRow({ metric: 'Alternate Control', value: stats.alternateControl });
  summarySheet.addRow({ metric: 'Ineffective', value: stats.ineffective });
  summarySheet.addRow({ metric: 'No Visibility', value: stats.noVisibility });
  summarySheet.addRow({ metric: 'Not Implemented', value: stats.notImplemented });
  summarySheet.addRow({ metric: 'Not Applicable', value: stats.notApplicable });
  summarySheet.addRow({ metric: 'Not Assessed', value: stats.notAssessed });
  summarySheet.addRow({ metric: 'Implementation Rate', value: `${implementationRate}%` });
  
  // Add data validation for Implementation Status column
  const statusColumn = ccmSheet.getColumn('status');
  statusColumn.eachCell({ includeEmpty: false }, (cell, rowNumber) => {
    if (rowNumber > 1) { // Skip header
      cell.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Not Assessed,Effective,Alternate Control,Ineffective,No Visibility,Not Implemented,Not Applicable"']
      };
    }
  });
  
  // Add data validation for Risk Level
  const riskColumn = ccmSheet.getColumn('riskRating');
  riskColumn.eachCell({ includeEmpty: false }, (cell, rowNumber) => {
    if (rowNumber > 1) {
      cell.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: ['"Critical,High,Medium,Low"']
      };
    }
  });
  
  // Add auto-filter to CCM sheet
  ccmSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: 23 }
  };
  
  // Freeze header row
  ccmSheet.views = [
    { state: 'frozen', xSplit: 0, ySplit: 1 }
  ];
  
  return workbook;
}

/**
 * Extract control specification from OSCAL parts
 */
function extractSpecification(control) {
  if (!control.parts || control.parts.length === 0) {
    return control.title || '';
  }
  
  const specifications = control.parts
    .filter(part => part.prose)
    .map(part => part.prose)
    .join('\n\n');
  
  return specifications || control.title || '';
}

/**
 * Extract domain from control ID
 */
function extractDomain(controlId) {
  if (!controlId) return 'Unknown';
  
  // Extract prefix (e.g., AC, AU, CM from AC-1, AU-2, CM-3)
  const match = controlId.match(/^([A-Z]+)[-_]/);
  if (match) {
    return match[1];
  }
  
  // For other formats, return first part
  const parts = controlId.split(/[-_.]/);
  return parts[0] || 'Unknown';
}

/**
 * Format status for CCM template
 */
function formatStatus(status) {
  const statusMap = {
    'not-assessed': 'Not Assessed',
    'effective': 'Effective',
    'alternate-control': 'Alternate Control',
    'ineffective': 'Ineffective',
    'no-visibility': 'No Visibility',
    'not-implemented': 'Not Implemented',
    'not-applicable': 'Not Applicable'
  };
  
  return statusMap[status] || 'Not Assessed';
}

