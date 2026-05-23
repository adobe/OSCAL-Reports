/**
 * Copyright 2025 Adobe. All rights reserved.
 * Copyright (c) 2025 Mukesh Kesharwani
 *
 * Licensed under the MIT License. See LICENSE file for details.
 */
import { describe, test, expect } from '@jest/globals';
import { extractControlsFromSSP, compareWithExistingSSP } from '../../../backend/sspComparisonV3.js';

function ir(controlId, props) {
  return {
    'control-id': controlId,
    props: props || []
  };
}

describe('extractControlsFromSSP — adobe-team-responsible', () => {
  test('reads OSCAL prop into adobeTeamResponsible', () => {
    const ssp = {
      'system-security-plan': {
        'control-implementation': {
          'implemented-requirements': [
            ir('ac-1', [
              { name: 'responsible-party', value: 'Implemented By Adobe' },
              { name: 'adobe-team-responsible', value: '["Adobe Corporate","Adobe SoC",""]' }
            ])
          ]
        }
      }
    };
    const controls = extractControlsFromSSP(ssp);
    expect(controls).toHaveLength(1);
    expect(controls[0].id).toBe('ac-1');
    expect(controls[0].adobeTeamResponsible).toEqual(['Adobe Corporate', 'Adobe SoC', '']);
  });
});

describe('compareWithExistingSSP — adobeTeamResponsible merge', () => {
  test('merges T1–T3 from existing SSP onto catalog controls', () => {
    const existingSSP = {
      'system-security-plan': {
        'control-implementation': {
          'implemented-requirements': [
            ir('ism-0001', [{ name: 'adobe-team-responsible', value: '["T1","T2","T3"]' }])
          ]
        }
      }
    };
    const catalogControls = [{ id: 'ism-0001', title: 'Catalog title', description: 'Desc' }];
    const { controls } = compareWithExistingSSP(catalogControls, existingSSP, null);
    expect(controls[0].adobeTeamResponsible).toEqual(['T1', 'T2', 'T3']);
  });

  test('new catalog control gets empty adobeTeamResponsible slots', () => {
    const existingSSP = {
      'system-security-plan': {
        'control-implementation': {
          'implemented-requirements': []
        }
      }
    };
    const catalogControls = [{ id: 'new-1', title: 'N', description: 'D' }];
    const { controls } = compareWithExistingSSP(catalogControls, existingSSP, null);
    expect(controls[0].changeStatus).toBe('new');
    expect(controls[0].adobeTeamResponsible).toEqual(['', '', '']);
  });
});
