/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Shared ExcelJS helpers for ACSC June 2026 CCM and SSP Annex workbooks.
 */
import ExcelJS from 'exceljs';
import {
  OSCAL_EXTENSION_COLUMNS,
  normalizeHeader,
} from './acscTemplateSchemas.js';

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
const GROUP_HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E2F3' } };
const EXTENSION_HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF548235' } };

const STATUS_LIST =
  '"Not Assessed,Effective,Alternate Control,Ineffective,No Visibility,Not Implemented,Not Applicable"';

/** System metadata rows on the Info worksheet (column A = label, column B = value). */
const INFO_SHEET_SYSTEM_FIELDS = [
  { label: 'System Name', key: 'systemName' },
  { label: 'System ID', key: 'systemId' },
  { label: 'Description', key: 'description' },
  { label: 'Organisation', key: 'organization' },
  { label: 'System Owner', key: 'systemOwner' },
  { label: 'Assessor Details', key: 'assessorDetails' },
  { label: 'CSP IaaS Provider', key: 'cspIaaS' },
  { label: 'CSP PaaS Provider', key: 'cspPaaS' },
  { label: 'CSP SaaS Provider', key: 'cspSaaS' },
  { label: 'Security Level', key: 'securityLevel' },
  { label: 'Status', key: 'status' },
  { label: 'Catalogue URL', key: 'catalogueUrl' },
];

/**
 * @param {unknown} value
 * @returns {string}
 */
function infoSheetDisplayValue(value) {
  if (value == null || value === '') {
    return '';
  }
  return String(value).trim();
}

/**
 * @param {string|undefined} status
 * @returns {string}
 */
export function formatAcscStatus(status) {
  const statusMap = {
    'not-assessed': 'Not Assessed',
    effective: 'Effective',
    'alternate-control': 'Alternate Control',
    ineffective: 'Ineffective',
    'no-visibility': 'No Visibility',
    'not-implemented': 'Not Implemented',
    'not-applicable': 'Not Applicable',
    'Not Assessed': 'Not Assessed',
    Effective: 'Effective',
  };
  if (!status) return 'Not Assessed';
  const key = String(status).trim();
  return statusMap[key] || statusMap[key.toLowerCase()] || 'Not Assessed';
}

/**
 * @param {Object} control
 * @returns {string}
 */
export function extractControlDescription(control) {
  if (control.description) {
    return control.description;
  }
  if (!control.parts || control.parts.length === 0) {
    return control.title || '';
  }
  const prose = control.parts
    .filter((part) => part.prose)
    .map((part) => part.prose)
    .join('\n\n');
  return prose || control.title || '';
}

/**
 * @param {Object} control
 * @returns {string}
 */
function formatExtensionValue(control, key) {
  const value = control[key];
  if (value == null || value === '') return '';
  if (key === 'adobeTeamResponsible' && Array.isArray(value)) {
    return value.filter(Boolean).join(', ');
  }
  if ((key === 'apiResponseData' || key === 'apiDataHistory') && typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

/**
 * @param {Object} control
 * @param {boolean} isCcm
 * @returns {Object}
 */
function buildPrincipleRowValues(control, isCcm) {
  const status = formatAcscStatus(control.status);
  const description = extractControlDescription(control);
  const implementation = control.implementation || status;
  const comments = control.remarks || control.providerComments || '';

  if (isCcm) {
    return {
      function: control.function || control.groupTitle || '',
      identifier: control.id || '',
      topic: control.topic || control.title || '',
      description,
      providerResponsibility: control.controlOwner || control.responsibleParty || '',
      implementationStatus: status,
      providerComments: comments,
      consumerResponsibility: control.consumerResponsibility || '',
      consumerImplementationRequired: formatAcscStatus(
        control.consumerImplementationRequired || 'not-assessed'
      ),
      consumerConfigurationRequired: formatAcscStatus(
        control.consumerConfigurationRequired || 'not-assessed'
      ),
      consumerComments: control.consumerComments || '',
    };
  }

  return {
    function: control.function || control.groupTitle || '',
    identifier: control.id || '',
    topic: control.topic || control.title || '',
    description,
    responsibility: control.controlOwner || control.responsibleParty || '',
    implementation,
    comments,
  };
}

/**
 * @param {Object} control
 * @param {boolean} isCcm
 * @returns {Object}
 */
function buildControlRowValues(control, isCcm) {
  const status = formatAcscStatus(control.status);
  const description = extractControlDescription(control);
  const comments = control.remarks || control.providerComments || control.comments || '';

  const base = {
    guideline: control.guideline || control.groupTitle || '',
    section: control.section || control.parentGroupTitle || '',
    topic: control.topic || control.title || '',
    identifier: control.id || '',
    revision: control.revision || '',
    updated: control.updated || '',
    nc: control.nc || '',
    os: control.os || '',
    p: control.p || '',
    s: control.s || '',
    ts: control.ts || '',
    ml1: control.ml1 || '',
    ml2: control.ml2 || '',
    ml3: control.ml3 || '',
    description,
  };

  if (isCcm) {
    return {
      ...base,
      administrationEnvironment: control.administrationEnvironment || '',
      cloudProductionCommon: control.cloudProductionCommon || '',
      cloudProductionServiceSpecific: control.cloudProductionServiceSpecific || '',
      providerResponsibility: control.controlOwner || control.responsibleParty || '',
      implementationStatus: status,
      providerComments: comments,
      consumerResponsibility: control.consumerResponsibility || '',
      consumerImplementationRequired: formatAcscStatus(
        control.consumerImplementationRequired || 'not-assessed'
      ),
      consumerConfigurationRequired: formatAcscStatus(
        control.consumerConfigurationRequired || 'not-assessed'
      ),
      consumerComments: control.consumerComments || '',
    };
  }

  return {
    ...base,
    responsibility: control.controlOwner || control.responsibleParty || '',
    implementation: status,
    comments,
  };
}

/**
 * @param {Object} control
 * @returns {Object}
 */
function buildExtensionRowValues(control) {
  const row = {};
  for (const col of OSCAL_EXTENSION_COLUMNS) {
    row[col.key] = formatExtensionValue(control, col.key);
  }
  if (!row.ismReference) {
    row.ismReference = control.ismReference || control.id || '';
  }
  return row;
}

/**
 * @param {import('exceljs').Worksheet} sheet
 * @param {Array<{header: string, key: string, width?: number}>} columns
 * @param {number} headerRowNumber
 */
function setColumnWidths(sheet, columns, headerRowNumber) {
  columns.forEach((col, index) => {
    const column = sheet.getColumn(index + 1);
    column.width = col.width || 18;
    if (headerRowNumber > 0) {
      const cell = sheet.getCell(headerRowNumber, index + 1);
      cell.value = col.header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = HEADER_FILL;
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = thinBorder();
    }
  });
}

/**
 * @returns {Object}
 */
function thinBorder() {
  return {
    top: { style: 'thin', color: { argb: 'FFD3D3D3' } },
    left: { style: 'thin', color: { argb: 'FFD3D3D3' } },
    bottom: { style: 'thin', color: { argb: 'FFD3D3D3' } },
    right: { style: 'thin', color: { argb: 'FFD3D3D3' } },
  };
}

/**
 * @param {import('exceljs').Worksheet} sheet
 * @param {Array<{label: string, startCol: number, endCol: number}>} groupHeaders
 */
function applyGroupHeaders(sheet, groupHeaders) {
  if (!groupHeaders) return 1;

  groupHeaders.forEach(({ label, startCol, endCol }) => {
    sheet.mergeCells(1, startCol, 1, endCol);
    const cell = sheet.getCell(1, startCol);
    cell.value = label;
    cell.font = { bold: true, size: 11 };
    cell.fill = GROUP_HEADER_FILL;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder();
  });

  return 2;
}

/**
 * @param {import('exceljs').Worksheet} sheet
 * @param {number} acscColCount
 * @param {number} headerRowNumber
 * @param {boolean} includeExtensions
 */
function applyExtensionGroupHeader(sheet, acscColCount, headerRowNumber, includeExtensions) {
  if (!includeExtensions || OSCAL_EXTENSION_COLUMNS.length === 0) return;

  const startCol = acscColCount + 1;
  const endCol = acscColCount + OSCAL_EXTENSION_COLUMNS.length;
  const groupRow = headerRowNumber === 2 ? 1 : headerRowNumber;

  if (groupRow === 1 && headerRowNumber === 1) {
    // SSP single header row — skip merged extension group
    OSCAL_EXTENSION_COLUMNS.forEach((col, index) => {
      const cell = sheet.getCell(headerRowNumber, acscColCount + index + 1);
      cell.value = col.header;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.fill = EXTENSION_HEADER_FILL;
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    });
    return;
  }

  sheet.mergeCells(groupRow, startCol, groupRow, endCol);
  const groupCell = sheet.getCell(groupRow, startCol);
  groupCell.value = 'OSCAL Extensions';
  groupCell.font = { bold: true, size: 11 };
  groupCell.fill = EXTENSION_HEADER_FILL;
  groupCell.alignment = { vertical: 'middle', horizontal: 'center' };

  OSCAL_EXTENSION_COLUMNS.forEach((col, index) => {
    const cell = sheet.getCell(headerRowNumber, acscColCount + index + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = EXTENSION_HEADER_FILL;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder();
  });
}

/**
 * @param {import('exceljs').Worksheet} sheet
 * @param {Object} rowValues
 * @param {Array<{key: string}>} acscColumns
 * @param {number} rowNumber
 * @param {boolean} includeExtensions
 */
function writeDataRow(sheet, rowValues, acscColumns, rowNumber, includeExtensions) {
  acscColumns.forEach((col, index) => {
    const cell = sheet.getCell(rowNumber, index + 1);
    cell.value = rowValues[col.key] ?? '';
    cell.alignment = { vertical: 'top', wrapText: true };
    cell.border = thinBorder();
  });

  if (includeExtensions) {
    const extValues = buildExtensionRowValues(rowValues._sourceControl || rowValues);
    OSCAL_EXTENSION_COLUMNS.forEach((col, index) => {
      const cell = sheet.getCell(rowNumber, acscColumns.length + index + 1);
      cell.value = extValues[col.key] ?? '';
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.border = thinBorder();
    });
  }
}

/**
 * @param {import('exceljs').Workbook} workbook
 * @param {Object} systemInfo
 */
export function addInfoSheet(workbook, _schema, systemInfo) {
  const sheet = workbook.addWorksheet('Info', {
    properties: { tabColor: { argb: 'FF00B050' } },
  });
  sheet.getColumn(1).width = 28;
  sheet.getColumn(2).width = 90;

  const headerRow = 1;
  const fieldHeader = sheet.getCell(headerRow, 1);
  const valueHeader = sheet.getCell(headerRow, 2);
  fieldHeader.value = 'Field';
  valueHeader.value = 'Value';
  for (const cell of [fieldHeader, valueHeader]) {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder();
  }

  let rowNumber = headerRow + 1;
  for (const { label, key } of INFO_SHEET_SYSTEM_FIELDS) {
    const labelCell = sheet.getCell(rowNumber, 1);
    const valueCell = sheet.getCell(rowNumber, 2);
    labelCell.value = label;
    valueCell.value = infoSheetDisplayValue(systemInfo?.[key]);
    labelCell.font = { bold: true, size: 11 };
    labelCell.alignment = { vertical: 'top', wrapText: true };
    labelCell.border = thinBorder();
    valueCell.alignment = { vertical: 'top', wrapText: true };
    valueCell.border = thinBorder();
    rowNumber += 1;
  }

  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
}

/**
 * @param {import('exceljs').Workbook} workbook
 * @param {Object} schema
 * @param {Array<Object>} principles
 * @param {boolean} includeExtensions
 */
export function addPrinciplesSheet(workbook, schema, principles, includeExtensions) {
  const isCcm = schema.id === 'ccm-june-2026';
  const sheet = workbook.addWorksheet(schema.sheets.principles, {
    properties: { tabColor: { argb: 'FF7030A0' } },
  });

  const acscColumns = schema.principles.columns;
  const headerRowNumber = applyGroupHeaders(sheet, schema.principles.groupHeaders);
  setColumnWidths(sheet, acscColumns, headerRowNumber);

  if (includeExtensions) {
    applyExtensionGroupHeader(sheet, acscColumns.length, headerRowNumber, true);
  }

  let rowNumber = headerRowNumber + 1;
  for (const control of principles) {
    const rowValues = {
      ...buildPrincipleRowValues(control, isCcm),
      _sourceControl: control,
    };
    writeDataRow(sheet, rowValues, acscColumns, rowNumber, includeExtensions);
    rowNumber += 1;
  }

  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: headerRowNumber }];
  const totalCols = acscColumns.length + (includeExtensions ? OSCAL_EXTENSION_COLUMNS.length : 0);
  if (totalCols > 0) {
    sheet.autoFilter = {
      from: { row: headerRowNumber, column: 1 },
      to: { row: headerRowNumber, column: totalCols },
    };
  }
}

/**
 * @param {import('exceljs').Workbook} workbook
 * @param {Object} schema
 * @param {Array<Object>} controls
 * @param {boolean} includeExtensions
 */
export function addControlsSheet(workbook, schema, controls, includeExtensions) {
  const isCcm = schema.id === 'ccm-june-2026';
  const sheet = workbook.addWorksheet(schema.sheets.controls, {
    properties: { tabColor: { argb: 'FF4472C4' } },
  });

  const acscColumns = schema.controls.columns;
  const headerRowNumber = 1;
  setColumnWidths(sheet, acscColumns, headerRowNumber);

  if (includeExtensions) {
    applyExtensionGroupHeader(sheet, acscColumns.length, headerRowNumber, true);
  }

  let rowNumber = 2;
  for (const control of controls) {
    const rowValues = {
      ...buildControlRowValues(control, isCcm),
      _sourceControl: control,
    };
    writeDataRow(sheet, rowValues, acscColumns, rowNumber, includeExtensions);
    applyStatusFormatting(sheet, rowNumber, isCcm);
    rowNumber += 1;
  }

  applyStatusValidation(sheet, isCcm, headerRowNumber + 1, rowNumber - 1);

  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: headerRowNumber }];
  const totalCols = acscColumns.length + (includeExtensions ? OSCAL_EXTENSION_COLUMNS.length : 0);
  if (totalCols > 0) {
    sheet.autoFilter = {
      from: { row: headerRowNumber, column: 1 },
      to: { row: headerRowNumber, column: totalCols },
    };
  }
}

/**
 * @param {import('exceljs').Worksheet} sheet
 * @param {number} rowNumber
 * @param {boolean} isCcm
 */
function applyStatusFormatting(sheet, rowNumber, isCcm) {
  const statusCol = isCcm ? 20 : 17;
  const cell = sheet.getCell(rowNumber, statusCol);
  const value = String(cell.value || '').toLowerCase();
  const colors = {
    'not assessed': 'FFC084FC',
    effective: 'FF86EFAC',
    'alternate control': 'FFBBF7D0',
    ineffective: 'FFFECACA',
    'no visibility': 'FF000000',
    'not implemented': 'FFFCA5A5',
    'not applicable': 'FFD1D5DB',
  };
  const color = colors[value];
  if (color) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    cell.font = {
      color: { argb: value === 'no visibility' ? 'FFFFFFFF' : 'FF1F2937' },
      bold: value === 'no visibility',
    };
  }
}

/**
 * @param {import('exceljs').Worksheet} sheet
 * @param {boolean} isCcm
 * @param {number} startRow
 * @param {number} endRow
 */
function applyStatusValidation(sheet, isCcm, startRow, endRow) {
  const statusCol = isCcm ? 20 : 17;
  for (let r = startRow; r <= endRow; r += 1) {
    sheet.getCell(r, statusCol).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [STATUS_LIST],
    };
  }
}

/**
 * @param {Object} schema
 * @param {Array<Object>} allControls
 * @param {Object} systemInfo
 * @param {{ includeExtensions?: boolean, principles?: Array<Object>, controls?: Array<Object> }} [options]
 * @returns {Promise<import('exceljs').Workbook>}
 */
export async function buildAcscWorkbook(schema, allControls, systemInfo, options = {}) {
  const includeExtensions = options.includeExtensions !== false;
  const principles = options.principles || [];
  const controls = options.controls || allControls;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = systemInfo?.systemName || 'OSCAL Report Generator';
  workbook.lastModifiedBy = 'OSCAL Report Generator';
  workbook.created = new Date();
  workbook.modified = new Date();

  addInfoSheet(workbook, schema, systemInfo);
  addPrinciplesSheet(workbook, schema, principles, includeExtensions);
  addControlsSheet(workbook, schema, controls, includeExtensions);

  return workbook;
}

export { OSCAL_EXTENSION_COLUMNS, normalizeHeader, buildExtensionRowValues, INFO_SHEET_SYSTEM_FIELDS };
