/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { describe, test, expect } from '@jest/globals';
import { isIsmPrinciple, splitPrinciplesAndControls } from '../../../backend/utils/acscControlClassifier.js';

describe('acscControlClassifier', () => {
  test('classifies GOV-01 as principle', () => {
    expect(isIsmPrinciple({ id: 'GOV-01', title: 'Executive accountability' })).toBe(true);
  });

  test('classifies ISM-1997 as control', () => {
    expect(isIsmPrinciple({ id: 'ISM-1997', title: 'Embedding cyber security' })).toBe(false);
  });

  test('uses group title fallback for principles', () => {
    expect(isIsmPrinciple({ id: 'custom-1', groupTitle: 'ISM Principles' })).toBe(true);
  });

  test('splitPrinciplesAndControls separates entries', () => {
    const controls = [
      { id: 'GOV-01', title: 'Principle A' },
      { id: 'ISM-1997', title: 'Control A' },
      { id: 'GOV-02', title: 'Principle B' },
    ];
    const { principles, controls: ismControls } = splitPrinciplesAndControls(controls);
    expect(principles).toHaveLength(2);
    expect(ismControls).toHaveLength(1);
    expect(ismControls[0].id).toBe('ISM-1997');
  });
});
