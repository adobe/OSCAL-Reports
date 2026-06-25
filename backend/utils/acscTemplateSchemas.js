/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * ACSC June 2026 Excel template definitions for CCM and SSP Annex exports.
 */

export const TEMPLATE_CCM_JUNE_2026 = 'ccm-june-2026';
export const TEMPLATE_SSP_ANNEX_JUNE_2026 = 'ssp-annex-june-2026';

/** OSCAL extension columns appended after ACSC columns (same order for both templates). */
export const OSCAL_EXTENSION_COLUMNS = [
  { header: 'Responsible Party', key: 'responsibleParty', width: 22 },
  { header: 'Adobe Team Responsible', key: 'adobeTeamResponsible', width: 28 },
  { header: 'Implementation Date', key: 'implementationDate', width: 15 },
  { header: 'Review Date', key: 'reviewDate', width: 15 },
  { header: 'Next Review Date', key: 'nextReviewDate', width: 15 },
  { header: 'Control Type', key: 'controlType', width: 35 },
  { header: 'Evidence Location', key: 'evidence', width: 35 },
  { header: 'Assessment/Testing Objective', key: 'testingObjective', width: 40 },
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
  { header: 'ISM Reference', key: 'ismReference', width: 15 },
];

export const CCM_JUNE_2026 = {
  id: TEMPLATE_CCM_JUNE_2026,
  filename: 'cloud-control-matrix-june-2026.xlsx',
  infoTitle: 'Cloud controls matrix template',
  infoOverview:
    'The Cloud controls matrix template is intended for use by security assessors to capture the implementation of controls from the Information security manual (ISM) by a Cloud Service Provider (CSP). In doing so, the CCM template provides indicative guidance on the scoping of security assessments, however, it should be noted that the guidance is not definitive and should be interpreted by security assessors in the context of the services being assessed. The CCM template also captures the ability for consumers to implement controls for services built upon a CSP\'s services by identifying where they are responsible for configuring their own services in accordance with the ISM.',
  infoSectionLabel: 'ISM controls',
  sheets: {
    principles: 'Principles - June 2026',
    controls: 'Controls - June 2026',
  },
  principles: {
    groupHeaders: [
      { label: 'ISM Principles', startCol: 1, endCol: 4 },
      { label: 'Provider Responsibilities', startCol: 5, endCol: 7 },
      { label: 'Consumer Responsibilities', startCol: 8, endCol: 11 },
    ],
    columns: [
      { header: 'Function', key: 'function', width: 14 },
      { header: 'Identifier', key: 'identifier', width: 14 },
      { header: 'Topic', key: 'topic', width: 35 },
      { header: 'Description', key: 'description', width: 50 },
      { header: 'Provider\nResponsibility', key: 'providerResponsibility', width: 22 },
      { header: 'Implementation\nStatus', key: 'implementationStatus', width: 18 },
      { header: 'Comments', key: 'providerComments', width: 35 },
      { header: 'Consumer\nResponsibility', key: 'consumerResponsibility', width: 22 },
      { header: 'Consumer Implementation\nRequired', key: 'consumerImplementationRequired', width: 22 },
      { header: 'Consumer Configuration\nRequired', key: 'consumerConfigurationRequired', width: 22 },
      { header: 'Comments', key: 'consumerComments', width: 35 },
    ],
  },
  controls: {
    columns: [
      { header: 'Guideline', key: 'guideline', width: 28 },
      { header: 'Section', key: 'section', width: 28 },
      { header: 'Topic', key: 'topic', width: 28 },
      { header: 'Identifier', key: 'identifier', width: 14 },
      { header: 'Revision', key: 'revision', width: 10 },
      { header: 'Updated', key: 'updated', width: 12 },
      { header: 'NC', key: 'nc', width: 6 },
      { header: 'OS', key: 'os', width: 6 },
      { header: 'P', key: 'p', width: 6 },
      { header: 'S', key: 's', width: 6 },
      { header: 'TS', key: 'ts', width: 6 },
      { header: 'ML1', key: 'ml1', width: 6 },
      { header: 'ML2', key: 'ml2', width: 6 },
      { header: 'ML3', key: 'ml3', width: 6 },
      { header: 'Description', key: 'description', width: 50 },
      { header: 'Administration\nEnvironment', key: 'administrationEnvironment', width: 28 },
      { header: 'Cloud Production -\nCommon Controls ', key: 'cloudProductionCommon', width: 28 },
      { header: 'Cloud Production -\nService Specific', key: 'cloudProductionServiceSpecific', width: 28 },
      { header: 'Provider\nResponsibility', key: 'providerResponsibility', width: 22 },
      { header: 'Implementation\nStatus', key: 'implementationStatus', width: 18 },
      { header: 'Comments', key: 'providerComments', width: 35 },
      { header: 'Consumer\nResponsibility', key: 'consumerResponsibility', width: 22 },
      { header: 'Consumer Implementation\nRequired', key: 'consumerImplementationRequired', width: 22 },
      { header: 'Consumer Configuration\nRequired', key: 'consumerConfigurationRequired', width: 22 },
      { header: 'Comments', key: 'consumerComments', width: 35 },
    ],
  },
};

export const SSP_ANNEX_JUNE_2026 = {
  id: TEMPLATE_SSP_ANNEX_JUNE_2026,
  filename: 'ssp-annex-june-2026.xlsx',
  infoTitle: 'System security plan annex template',
  infoOverview:
    'The System security plan annex template is intended for use by security assessors to capture the implementation of controls from the Information security manual (ISM) by an organisation. In doing so, the SSP annex template provides indicative guidance on the scoping of security assessments, however, it should be noted that the guidance is not definitive and should be interpreted by security assessors in the context of the system being assessed.',
  infoSectionLabel: 'ISM controls',
  sheets: {
    principles: 'Principles - June 2026',
    controls: 'Controls - June 2026',
  },
  principles: {
    groupHeaders: null,
    columns: [
      { header: 'Function', key: 'function', width: 14 },
      { header: 'Identifier', key: 'identifier', width: 14 },
      { header: 'Topic', key: 'topic', width: 35 },
      { header: 'Description', key: 'description', width: 50 },
      { header: 'Responsibility', key: 'responsibility', width: 22 },
      { header: 'Implementation', key: 'implementation', width: 18 },
      { header: 'Comments', key: 'comments', width: 35 },
    ],
  },
  controls: {
    columns: [
      { header: 'Guideline', key: 'guideline', width: 28 },
      { header: 'Section', key: 'section', width: 28 },
      { header: 'Topic', key: 'topic', width: 28 },
      { header: 'Identifier', key: 'identifier', width: 14 },
      { header: 'Revision', key: 'revision', width: 10 },
      { header: 'Updated', key: 'updated', width: 12 },
      { header: 'NC', key: 'nc', width: 6 },
      { header: 'OS', key: 'os', width: 6 },
      { header: 'P', key: 'p', width: 6 },
      { header: 'S', key: 's', width: 6 },
      { header: 'TS', key: 'ts', width: 6 },
      { header: 'ML1', key: 'ml1', width: 6 },
      { header: 'ML2', key: 'ml2', width: 6 },
      { header: 'ML3', key: 'ml3', width: 6 },
      { header: 'Description', key: 'description', width: 50 },
      { header: 'Responsibility', key: 'responsibility', width: 22 },
      { header: 'Implementation', key: 'implementation', width: 18 },
      { header: 'Comments', key: 'comments', width: 35 },
    ],
  },
};

/**
 * @param {string} templateId
 * @returns {typeof CCM_JUNE_2026}
 */
export function getTemplateSchema(templateId) {
  if (templateId === TEMPLATE_SSP_ANNEX_JUNE_2026) {
    return SSP_ANNEX_JUNE_2026;
  }
  return CCM_JUNE_2026;
}

/**
 * Normalize header text for import column matching.
 * @param {string} value
 * @returns {string}
 */
export function normalizeHeader(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
