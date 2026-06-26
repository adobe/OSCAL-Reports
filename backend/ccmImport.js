/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 *
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import ExcelJS from 'exceljs';
import {
  CCM_JUNE_2026,
  SSP_ANNEX_JUNE_2026,
  OSCAL_EXTENSION_COLUMNS,
  normalizeHeader,
} from './utils/acscTemplateSchemas.js';
import { isIsmPrinciple } from './utils/acscControlClassifier.js';
import { INFO_SHEET_SYSTEM_FIELDS } from './utils/acscExcelBuilder.js';

/**
 * @param {Buffer} buffer
 * @returns {Promise<{ systemInfo: Object, controls: Array<Object>, statistics: Object, templateType: string }>}
 */
export async function parseCCMExcel(buffer) {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const sheetNames = workbook.worksheets.map((ws) => ws.name);
    console.log('Available sheets in workbook:', sheetNames);

    const templateType = detectTemplateType(workbook);
    const schema = templateType === 'ssp-annex' ? SSP_ANNEX_JUNE_2026 : CCM_JUNE_2026;
    const isCcm = templateType === 'ccm';

    const principlesSheet = findSheet(workbook, [schema.sheets.principles, 'Principles']);
    const controlsSheet = findSheet(workbook, [schema.sheets.controls, 'Controls']);

    if (!controlsSheet && !principlesSheet) {
      throw new Error(
        `Invalid ACSC workbook: could not find Principles or Controls sheets. Available: ${sheetNames.join(', ')}`
      );
    }

    const systemInfo = extractSystemInfoFromInfoSheet(workbook);
    const controls = [];

    if (principlesSheet) {
      const headerRow = schema.principles.groupHeaders ? 2 : 1;
      controls.push(
        ...extractSheetRows(principlesSheet, schema.principles.columns, headerRow, isCcm, true)
      );
    }

    if (controlsSheet) {
      controls.push(...extractSheetRows(controlsSheet, schema.controls.columns, 1, isCcm, false));
    }

    return {
      systemInfo,
      controls,
      templateType,
      statistics: {
        totalControls: controls.length,
        principles: controls.filter((c) => isIsmPrinciple(c)).length,
        ismControls: controls.filter((c) => !isIsmPrinciple(c)).length,
        withImplementation: controls.filter((c) => c.implementation && c.implementation.trim()).length,
        withStatus: controls.filter((c) => c.status && c.status !== 'not-assessed').length,
      },
    };
  } catch (error) {
    console.error('Error parsing ACSC Excel:', error);
    throw new Error(`Failed to parse ACSC Excel file: ${error.message}`);
  }
}

/**
 * @param {import('exceljs').Workbook} workbook
 * @returns {'ccm'|'ssp-annex'}
 */
function detectTemplateType(workbook) {
  const names = workbook.worksheets.map((ws) => ws.name.toLowerCase());
  if (names.some((n) => n.includes('cloud controls') || n.includes('ccm'))) {
    return 'ccm';
  }

  const controlsSheet = findSheet(workbook, ['Controls - June 2026', 'Controls']);
  if (controlsSheet) {
    const headers = readHeaderMap(controlsSheet, 1);
    if (headers['administration environment'] || headers['provider responsibility']) {
      return 'ccm';
    }
  }

  return 'ssp-annex';
}

/**
 * @param {import('exceljs').Workbook} workbook
 * @param {string[]} candidates
 * @returns {import('exceljs').Worksheet|null}
 */
function findSheet(workbook, candidates) {
  for (const name of candidates) {
    const sheet = workbook.getWorksheet(name);
    if (sheet) return sheet;
  }
  for (const worksheet of workbook.worksheets) {
    const lower = worksheet.name.toLowerCase();
    if (candidates.some((c) => lower.includes(c.toLowerCase().split(' ')[0]))) {
      if (lower.includes('principle') && candidates.some((c) => c.toLowerCase().includes('principle'))) {
        return worksheet;
      }
      if (lower.includes('control') && candidates.some((c) => c.toLowerCase().includes('control'))) {
        return worksheet;
      }
    }
  }
  return null;
}

/**
 * @param {import('exceljs').Workbook} workbook
 * @returns {Object}
 */
function extractSystemInfoFromInfoSheet(workbook) {
  const systemInfo = {
    systemName: '',
    systemId: '',
    securityLevel: '',
    description: '',
    organization: '',
    systemOwner: '',
    assessorDetails: '',
    cspIaaS: '',
    cspPaaS: '',
    cspSaaS: '',
    catalogueUrl: '',
    status: 'under-development',
    confidentiality: 'moderate',
    integrity: 'moderate',
    availability: 'moderate',
  };

  const infoSheet = workbook.getWorksheet('Info');
  if (!infoSheet) return systemInfo;

  const labelToKey = Object.fromEntries(
    INFO_SHEET_SYSTEM_FIELDS.map(({ label, key }) => [label.toLowerCase(), key])
  );
  labelToKey.organization = 'organization';

  let tableStartRow = null;
  const maxScanRow = Math.min(infoSheet.rowCount || 0, 40);
  for (let rowNumber = 1; rowNumber <= maxScanRow; rowNumber += 1) {
    const fieldHeader = normalizeHeader(getCellValue(infoSheet.getCell(rowNumber, 1)));
    const valueHeader = normalizeHeader(getCellValue(infoSheet.getCell(rowNumber, 2)));
    if (fieldHeader === 'field' && valueHeader === 'value') {
      tableStartRow = rowNumber + 1;
      break;
    }
  }

  if (tableStartRow) {
    for (let rowNumber = tableStartRow; rowNumber <= (infoSheet.rowCount || 0); rowNumber += 1) {
      const label = getCellValue(infoSheet.getCell(rowNumber, 1))?.trim();
      const value = getCellValue(infoSheet.getCell(rowNumber, 2))?.trim();
      if (!label) {
        continue;
      }
      const key = labelToKey[label.toLowerCase()];
      if (key) {
        systemInfo[key] = value || '';
      }
    }
    return systemInfo;
  }

  // Legacy Info sheet: free-text lines in column B ("System: …", "System ID: …")
  infoSheet.eachRow((row) => {
    const value = getCellValue(row.getCell(2));
    if (!value) return;
    if (value.startsWith('System:')) {
      systemInfo.systemName = value.replace(/^System:\s*/i, '').trim();
    } else if (value.startsWith('System ID:')) {
      systemInfo.systemId = value.replace(/^System ID:\s*/i, '').trim();
    }
  });

  return systemInfo;
}

/**
 * @param {import('exceljs').Worksheet} sheet
 * @param {number} headerRowNumber
 * @returns {Record<string, number>}
 */
function readHeaderMap(sheet, headerRowNumber) {
  const headers = {};
  const row = sheet.getRow(headerRowNumber);
  row.eachCell((cell, colNumber) => {
    const name = normalizeHeader(getCellValue(cell));
    if (name && name !== 'oscal extensions') {
      headers[name] = colNumber;
    }
  });
  return headers;
}

/**
 * @param {import('exceljs').Worksheet} sheet
 * @param {Array<{header: string, key: string}>} schemaColumns
 * @param {number} headerRowNumber
 * @param {boolean} isCcm
 * @param {boolean} isPrinciplesSheet
 * @returns {Array<Object>}
 */
function extractSheetRows(sheet, schemaColumns, headerRowNumber, isCcm, isPrinciplesSheet) {
  const headerMap = readHeaderMap(sheet, headerRowNumber);
  const extensionMap = {};

  OSCAL_EXTENSION_COLUMNS.forEach((col) => {
    const idx = headerMap[normalizeHeader(col.header)];
    if (idx) extensionMap[col.key] = idx;
  });

  const controls = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;

    const identifier = getByHeaders(row, headerMap, ['identifier']);
    if (!identifier) return;

    const control = mapRowToControl(row, headerMap, extensionMap, isCcm, isPrinciplesSheet);
    control.id = identifier;
    control.title = control.topic || getByHeaders(row, headerMap, ['topic']) || identifier;
    if (!control.ismReference) {
      control.ismReference = identifier;
    }

    if (control.description) {
      control.parts = [{
        id: `${identifier}_smt`,
        name: 'statement',
        prose: control.description,
      }];
    }

    controls.push(control);
  });

  return controls;
}

/**
 * @param {import('exceljs').Row} row
 * @param {Record<string, number>} headerMap
 * @param {Record<string, number>} extensionMap
 * @param {boolean} isCcm
 * @param {boolean} isPrinciplesSheet
 * @returns {Object}
 */
function mapRowToControl(row, headerMap, extensionMap, isCcm, isPrinciplesSheet) {
  const get = (...names) => getByHeaders(row, headerMap, names);

  const description = get('description');
  const statusRaw = isPrinciplesSheet
    ? (isCcm ? get('implementation status', 'implementation') : get('implementation'))
    : (isCcm ? get('implementation status', 'implementation') : get('implementation'));

  const control = {
    topic: get('topic'),
    description,
    function: get('function'),
    guideline: get('guideline'),
    section: get('section'),
    revision: get('revision'),
    updated: get('updated'),
    nc: get('nc'),
    os: get('os'),
    p: get('p'),
    s: get('s'),
    ts: get('ts'),
    ml1: get('ml1'),
    ml2: get('ml2'),
    ml3: get('ml3'),
    groupTitle: get('guideline', 'function', 'section'),
    status: parseStatus(statusRaw),
    implementation: get('implementation details') || '',
    remarks: get('comments', 'provider comments', 'consumer comments') || '',
    controlOwner: get('provider responsibility', 'responsibility', 'cloud provider responsibility') || '',
    responsibleParty: get('responsible party', 'provider responsibility', 'responsibility') || '',
    consumerResponsibility: get('consumer responsibility') || '',
    consumerImplementationRequired: parseStatus(get('consumer implementation required')),
    consumerConfigurationRequired: parseStatus(get('consumer configuration required')),
    administrationEnvironment: get('administration environment') || '',
    cloudProductionCommon: get('cloud production - common controls') || '',
    cloudProductionServiceSpecific: get('cloud production - service specific') || '',
    ismReference: get('ism reference') || '',
  };

  for (const [key, colIndex] of Object.entries(extensionMap)) {
    const value = getCellValue(row.getCell(colIndex));
    if (!value) continue;
    if (key === 'adobeTeamResponsible') {
      control[key] = value.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 3);
    } else if (key === 'apiResponseData' || key === 'apiDataHistory') {
      control[key] = parseJSON(value);
    } else {
      control[key] = value;
    }
  }

  if (!control.ismReference) {
    control.ismReference = '';
  }

  return control;
}

/**
 * @param {import('exceljs').Row} row
 * @param {Record<string, number>} headerMap
 * @param {string[]} names
 * @returns {string}
 */
function getByHeaders(row, headerMap, names) {
  for (const name of names) {
    const col = headerMap[normalizeHeader(name)];
    if (col !== undefined) {
      const value = getCellValue(row.getCell(col));
      if (value) return value;
    }
  }
  return '';
}

/**
 * @param {import('exceljs').Cell|undefined} cell
 * @returns {string}
 */
function getCellValue(cell) {
  if (!cell) return '';

  if (cell.value === null || cell.value === undefined) {
    return '';
  }

  if (cell.type === ExcelJS.ValueType.Formula && cell.result !== undefined) {
    return String(cell.result);
  }

  if (typeof cell.value === 'object' && cell.value.richText) {
    return cell.value.richText.map((rt) => rt.text).join('');
  }

  if (typeof cell.value === 'object' && cell.value.text) {
    return cell.value.text;
  }

  if (cell.value instanceof Date) {
    return cell.value.toISOString().split('T')[0];
  }

  return String(cell.value).trim();
}

/**
 * @param {string} status
 * @returns {string}
 */
function parseStatus(status) {
  if (!status) return 'not-assessed';

  const statusMap = {
    'not assessed': 'not-assessed',
    effective: 'effective',
    'alternate control': 'alternate-control',
    ineffective: 'ineffective',
    'no visibility': 'no-visibility',
    'not implemented': 'not-implemented',
    'not applicable': 'not-applicable',
  };

  return statusMap[String(status).toLowerCase().trim()] || 'not-assessed';
}

/**
 * @param {string} value
 * @returns {Object|null}
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
 * @param {Buffer} buffer
 * @returns {boolean}
 */
export function validateCCMStructure(buffer) {
  try {
    return Buffer.isBuffer(buffer) && buffer.length > 0;
  } catch {
    return false;
  }
}
