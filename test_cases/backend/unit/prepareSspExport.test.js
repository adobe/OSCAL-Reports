/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { describe, test, expect } from '@jest/globals';
import {
  buildCatalogControlsForExport,
  applyMrcControlEdits,
  prepareSspExportPayload,
} from '../../../backend/sspComparisonV3.js';

const sampleSsp = {
  'system-security-plan': {
    metadata: { title: 'Test SSP', version: '2.0' },
    'import-profile': { href: 'https://example.com/catalog.json' },
    'system-characteristics': {
      'system-name': 'Acme System',
      'system-ids': [{ id: 'sys-1' }],
      description: 'System description',
      'security-sensitivity-level': 'high',
      props: [
        { name: 'organization', value: 'Acme Org' },
        { name: 'csp-paas', value: 'AWS' },
      ],
    },
    'control-implementation': {
      'implemented-requirements': [
        {
          uuid: '11111111-1111-1111-1111-111111111111',
          'control-id': 'ac-1',
          description: 'Original implementation text',
          parts: [{ name: 'statement', prose: 'Catalog statement prose' }],
          params: [{ id: 'ac-1_prm_1', label: 'organization-defined' }],
          props: [
            { name: 'catalog-control-title', value: 'Access Control Policy' },
            { name: 'catalog-control-description', value: 'Develop an access control policy' },
            { name: 'implementation-status', value: 'effective' },
            { name: 'risk-rating', value: 'Low' },
          ],
        },
      ],
    },
  },
};

describe('prepareSspExportPayload', () => {
  test('preserves parts and params from implemented-requirements', () => {
    const catalogControls = buildCatalogControlsForExport(sampleSsp);
    expect(catalogControls).toHaveLength(1);
    expect(catalogControls[0].parts).toHaveLength(1);
    expect(catalogControls[0].params).toHaveLength(1);
  });

  test('merges MRC edits and extracts full systemInfo', () => {
    const payload = prepareSspExportPayload(sampleSsp, {
      'ac-1': {
        implementation: 'Updated implementation from MRC',
        status: 'effective',
        riskRating: 'Medium',
      },
    });
    expect(payload.systemInfo.systemName).toBe('Acme System');
    expect(payload.systemInfo.organization).toBe('Acme Org');
    expect(payload.systemInfo.cspPaaS).toBe('AWS');
    expect(payload.systemInfo.catalogueUrl).toBe('https://example.com/catalog.json');
    expect(payload.metadata.title).toBe('Test SSP');
    const ac1 = payload.controls.find((c) => c.id === 'ac-1');
    expect(ac1).toBeDefined();
    expect(ac1.implementation).toBe('Updated implementation from MRC');
    expect(ac1.parts).toHaveLength(1);
    expect(ac1.riskRating).toBe('Medium');
  });

  test('applyMrcControlEdits maps catalogTitle to title', () => {
    const merged = applyMrcControlEdits(
      [{ id: 'ac-2', title: 'Old', parts: [{ name: 'statement', prose: 'x' }] }],
      { 'ac-2': { catalogTitle: 'New Title', implementation: 'impl' } },
    );
    expect(merged[0].title).toBe('New Title');
    expect(merged[0].parts).toHaveLength(1);
  });
});
