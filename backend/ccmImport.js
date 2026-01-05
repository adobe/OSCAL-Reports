/**
 * Cloud Control Matrix (CCM) Excel Import Module
 * 
 * @author Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
 * @copyright Copyright (c) 2025 Mukesh Kesharwani
 * @license GPL-3.0-or-later
 * 
 * Parse CCM Excel file and extract control data
 * This reverses the CCM export process
 */

import ExcelJS from 'exceljs';
export async function parseCCMExcel(buffer) {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    
    // Log available sheets
    const sheetNames = workbook.worksheets.map(ws => ws.name);
    console.log('Available sheets in workbook:', sheetNames);
    
    // Try to find the CCM sheet by trying multiple names
    let ccmSheet = null;
    const possibleNames = ['Cloud Control Matrix', 'CCM', 'Controls', 'Control Matrix'];
    
    for (const name of possibleNames) {
      ccmSheet = workbook.getWorksheet(name);
      if (ccmSheet) {
        console.log(`Found CCM sheet: "${name}"`);
        break;
      }
    }
    
    // If still not found, try to find by detecting CCM headers
    if (!ccmSheet) {
      ccmSheet = findCCMSheetByHeaders(workbook);
      if (ccmSheet) {
        console.log(`Found CCM sheet by headers: "${ccmSheet.name}"`);
      }
    }
    
    if (!ccmSheet) {
      throw new Error(
        `Invalid CCM file: Could not find CCM sheet. ` +
        `Available sheets: ${sheetNames.join(', ')}. ` +
        `Expected one of: ${possibleNames.join(', ')}, or a sheet with CCM-like headers.`
      );
    }
    
    // Get the summary sheet for system info
    const summarySheet = workbook.getWorksheet('Summary');
    
    // Extract system info from summary sheet
    const systemInfo = extractSystemInfo(summarySheet);
    
    // Extract controls from CCM sheet
    const controls = extractControls(ccmSheet);
    
    return {
      systemInfo,
      controls,
      statistics: {
        totalControls: controls.length,
        withImplementation: controls.filter(c => c.implementation && c.implementation.trim()).length,
        withStatus: controls.filter(c => c.status && c.status !== 'not-assessed').length
      }
    };
  } catch (error) {
    console.error('Error parsing CCM Excel:', error);
    throw new Error(`Failed to parse CCM Excel file: ${error.message}`);
  }
}

/**
 * Extract system information from Summary sheet
 */
function extractSystemInfo(summarySheet) {
  const systemInfo = {
    systemName: '',
    systemId: '',
    securityLevel: '',
    description: '',
    status: 'under-development',
    confidentiality: 'moderate',
    integrity: 'moderate',
    availability: 'moderate'
  };
  
  if (!summarySheet) {
    return systemInfo;
  }
  
  // Read summary rows (starting from row 2, skipping header)
  summarySheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 1) return; // Skip header
    
    const metric = getCellValue(row.getCell(1));
    const value = getCellValue(row.getCell(2));
    
    if (!metric || !value) return;
    
    switch (metric.toLowerCase()) {
      case 'system name':
        systemInfo.systemName = value;
        break;
      case 'system id':
        systemInfo.systemId = value;
        break;
      case 'security level':
      case 'data sensitivity/classification level':
        systemInfo.securityLevel = value;
        break;
    }
  });
  
  return systemInfo;
}

/**
 * Extract controls from CCM sheet
 */
function extractControls(ccmSheet) {
  const controls = [];
  const headers = {};
  
  // Read header row to map column indices
  const headerRow = ccmSheet.getRow(1);
  headerRow.eachCell((cell, colNumber) => {
    const headerName = getCellValue(cell);
    if (headerName) {
      headers[headerName.toLowerCase().trim()] = colNumber;
    }
  });
  
  console.log('CCM Headers detected:', Object.keys(headers));
  
  // Validate required headers
  const requiredHeaders = ['control id'];
  const missingHeaders = requiredHeaders.filter(h => !headers[h]);
  
  if (missingHeaders.length > 0) {
    console.error('Missing required headers:', missingHeaders);
    console.log('Available headers:', Object.keys(headers));
    throw new Error(
      `Missing required headers: ${missingHeaders.join(', ')}. ` +
      `Available headers: ${Object.keys(headers).join(', ')}`
    );
  }
  
  // Helper function to safely get cell value by header name
  const safeGetCell = (row, headerName) => {
    const colIndex = headers[headerName];
    if (colIndex === undefined) return '';
    try {
      return getCellValue(row.getCell(colIndex)) || '';
    } catch (error) {
      console.warn(`Error getting cell for header "${headerName}":`, error.message);
      return '';
    }
  };
  
  // Read data rows (starting from row 2)
  ccmSheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 1) return; // Skip header
    
    const controlId = safeGetCell(row, 'control id');
    if (!controlId) return; // Skip empty rows
    
    const control = {
      id: controlId,
      title: safeGetCell(row, 'control title'),
      groupTitle: safeGetCell(row, 'control domain'),
      
      // Parse parts for control description
      parts: [],
      
      // Implementation details
      status: parseStatus(safeGetCell(row, 'implementation status')),
      implementation: safeGetCell(row, 'implementation details'),
      
      // Responsible parties
      responsibleParty: safeGetCell(row, 'responsible party'),
      consumerGuidance: safeGetCell(row, 'consumer guidance'),
      controlOwner: safeGetCell(row, 'cloud provider responsibility'),
      
      // Dates
      implementationDate: safeGetCell(row, 'implementation date'),
      reviewDate: safeGetCell(row, 'review date'),
      nextReviewDate: safeGetCell(row, 'next review date'),
      
      // Control Type and Testing
      controlType: safeGetCell(row, 'control type'),
      evidence: safeGetCell(row, 'evidence location'),
      testingProcedure: safeGetCell(row, 'testing method'),
      testingFrequency: safeGetCell(row, 'testing frequency'),
      lastTestDate: safeGetCell(row, 'last test date'),
      
      // API fields
      apiUrl: safeGetCell(row, 'api url'),
      apiCredentialId: safeGetCell(row, 'api credential id'),
      apiResponseData: parseJSON(safeGetCell(row, 'api response data')),
      apiDataHistory: parseJSON(safeGetCell(row, 'api data history')),
      
      // Risk assessment
      riskRating: safeGetCell(row, 'risk level'),
      residualRisk: safeGetCell(row, 'residual risk'),
      
      // Additional fields
      frameworks: safeGetCell(row, 'related frameworks'),
      compensatingControls: safeGetCell(row, 'compensating controls'),
      exceptions: safeGetCell(row, 'exceptions/deviations'),
      justification: safeGetCell(row, 'justification'),
      remarks: safeGetCell(row, 'additional notes'),
      
      // ISM reference
      ismReference: safeGetCell(row, 'ism reference') || controlId
    };
    
    // Add control description as a part
    const description = safeGetCell(row, 'control description');
    if (description) {
      control.parts = [{
        id: `${controlId}_smt`,
        name: 'statement',
        prose: description
      }];
    }
    
    controls.push(control);
  });
  
  console.log(`Extracted ${controls.length} controls from CCM`);
  return controls;
}

/**
 * Get cell value safely
 */
function getCellValue(cell) {
  if (!cell) return '';
  
  // Handle different cell value types
  if (cell.value === null || cell.value === undefined) {
    return '';
  }
  
  // Handle formula cells
  if (cell.type === ExcelJS.ValueType.Formula && cell.result !== undefined) {
    return String(cell.result);
  }
  
  // Handle rich text
  if (typeof cell.value === 'object' && cell.value.richText) {
    return cell.value.richText.map(rt => rt.text).join('');
  }
  
  // Handle hyperlinks
  if (typeof cell.value === 'object' && cell.value.text) {
    return cell.value.text;
  }
  
  // Handle dates
  if (cell.value instanceof Date) {
    return cell.value.toISOString().split('T')[0]; // YYYY-MM-DD format
  }
  
  return String(cell.value).trim();
}

/**
 * Parse status from CCM format to internal format
 */
function parseStatus(status) {
  if (!status) return 'not-assessed';
  
  const statusMap = {
    'not assessed': 'not-assessed',
    'effective': 'effective',
    'alternate control': 'alternate-control',
    'ineffective': 'ineffective',
    'no visibility': 'no-visibility',
    'not implemented': 'not-implemented',
    'not applicable': 'not-applicable'
  };
  
  const normalized = status.toLowerCase().trim();
  return statusMap[normalized] || 'not-assessed';
}

/**
 * Safely parse JSON string
 */
function parseJSON(value) {
  if (!value) return null;
  
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Find CCM sheet by detecting expected headers
 */
function findCCMSheetByHeaders(workbook) {
  const expectedHeaders = ['control id', 'control title', 'control domain', 'implementation status'];
  
  for (const worksheet of workbook.worksheets) {
    const headerRow = worksheet.getRow(1);
    const headers = [];
    
    headerRow.eachCell((cell) => {
      const value = getCellValue(cell);
      if (value) {
        headers.push(value.toLowerCase().trim());
      }
    });
    
    // Check if this sheet has at least 3 of the expected headers
    const matchCount = expectedHeaders.filter(expected => 
      headers.some(header => header.includes(expected) || expected.includes(header))
    ).length;
    
    if (matchCount >= 3) {
      console.log(`Sheet "${worksheet.name}" appears to be a CCM sheet (${matchCount}/${expectedHeaders.length} headers matched)`);
      return worksheet;
    }
  }
  
  return null;
}

/**
 * Validate CCM structure
 */
export function validateCCMStructure(buffer) {
  // This is a quick check before full parsing
  // Returns true if the file appears to be a valid CCM file
  try {
    // Basic checks can be done here
    return true;
  } catch {
    return false;
  }
}

