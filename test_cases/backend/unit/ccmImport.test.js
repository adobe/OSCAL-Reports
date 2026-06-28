/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { describe, test, expect } from '@jest/globals';
import { generateCCMExport } from '../../../backend/ccmExport.js';
import { generateSSPAnnexExport } from '../../../backend/sspAnnexExport.js';
import { parseCCMExcel } from '../../../backend/ccmImport.js';
import { enrichControlWithCatalogProps, extractControlsWithIsmMetadata } from '../../../backend/utils/acscCatalogProps.js';

const sampleControls = [
  {
    id: 'GOV-01',
    title: 'Executive cyber security accountability',
    function: 'Govern',
    status: 'not-assessed',
    parts: [{ prose: 'Board accountability.' }],
    responsibleParty: 'CISO',
  },
  {
    id: 'ISM-1997',
    title: 'Embedding cyber security',
    guideline: 'Guidelines for cyber security roles',
    section: 'Board of directors and executive committee',
    status: 'effective',
    implementation: 'Governance policy in place.',
    remarks: 'Verified Q1.',
    controlOwner: 'Cloud Service Provider',
    evidence: 'Confluence/wiki/governance',
    riskRating: 'Low',
    props: [{ name: 'revision', value: '2' }, { name: 'nc', value: 'Yes' }],
  },
];

describe('ccmImport', () => {
  test('round-trips CCM export preserving identifiers, status, and Info sheet metadata', async () => {
    const systemInfo = {
      systemName: 'Round Trip CSP',
      systemId: 'csp-001',
      organization: 'Adobe',
      securityLevel: 'Protected',
      catalogueUrl: 'https://example.com/catalog.json',
    };
    const workbook = await generateCCMExport(sampleControls, systemInfo);
    const buffer = await workbook.xlsx.writeBuffer();
    const parsed = await parseCCMExcel(buffer);

    expect(parsed.controls.length).toBeGreaterThanOrEqual(2);
    const gov = parsed.controls.find((c) => c.id === 'GOV-01');
    const ism = parsed.controls.find((c) => c.id === 'ISM-1997');
    expect(gov).toBeTruthy();
    expect(ism).toBeTruthy();
    expect(ism.status).toBe('effective');
    expect(ism.evidence).toBe('Confluence/wiki/governance');
    expect(ism.riskRating).toBe('Low');
    expect(parsed.systemInfo.systemName).toBe('Round Trip CSP');
    expect(parsed.systemInfo.systemId).toBe('csp-001');
    expect(parsed.systemInfo.organization).toBe('Adobe');
    expect(parsed.systemInfo.securityLevel).toBe('Protected');
    expect(parsed.systemInfo.catalogueUrl).toBe('https://example.com/catalog.json');
  });

  test('round-trips SSP Annex export', async () => {
    const workbook = await generateSSPAnnexExport(sampleControls, { systemName: 'Org System' });
    const buffer = await workbook.xlsx.writeBuffer();
    const parsed = await parseCCMExcel(buffer);

    expect(parsed.templateType).toBe('ssp-annex');
    const ism = parsed.controls.find((c) => c.id === 'ISM-1997');
    expect(ism).toBeTruthy();
    expect(ism.controlOwner).toBe('Cloud Service Provider');
  });
});

describe('acscCatalogProps', () => {
  test('enrichControlWithCatalogProps reads catalog props', () => {
    const control = enrichControlWithCatalogProps({
      id: 'ISM-1000',
      title: 'Sample',
      props: [
        { name: 'revision', value: '3' },
        { name: 'ml1', value: 'No' },
      ],
      groupTitle: 'Access control',
    });
    expect(control.revision).toBe('3');
    expect(control.ml1).toBe('No');
    expect(control.guideline).toBe('Access control');
  });

  test('extractControlsWithIsmMetadata processes catalogue groups', () => {
    const catalogue = {
      catalog: {
        groups: [
          {
            id: 'g1',
            title: 'Govern',
            controls: [
              {
                id: 'GOV-01',
                title: 'Accountability',
                props: [{ name: 'function', value: 'GOVERN' }],
                parts: [{ name: 'statement', prose: 'Statement text.' }],
              },
            ],
          },
        ],
      },
    };
    const controls = extractControlsWithIsmMetadata(catalogue);
    expect(controls).toHaveLength(1);
    expect(controls[0].id).toBe('GOV-01');
    expect(controls[0].function).toBe('GOVERN');
  });
});
