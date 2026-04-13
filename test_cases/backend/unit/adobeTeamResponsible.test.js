/**
 * @jest-environment node
 */

import { describe, test, expect } from '@jest/globals';
import { normalizeAdobeTeamResponsibleSlots } from '../../../backend/utils/adobeTeamResponsible.js';

describe('normalizeAdobeTeamResponsibleSlots', () => {
  test('returns three empty strings for null', () => {
    expect(normalizeAdobeTeamResponsibleSlots(null)).toEqual(['', '', '']);
  });

  test('parses JSON array string', () => {
    expect(normalizeAdobeTeamResponsibleSlots('["A","B","C"]')).toEqual(['A', 'B', 'C']);
  });

  test('pads and trims array input', () => {
    expect(normalizeAdobeTeamResponsibleSlots([' x ', 'y'])).toEqual(['x', 'y', '']);
  });

  test('invalid JSON yields empty slots', () => {
    expect(normalizeAdobeTeamResponsibleSlots('not-json')).toEqual(['', '', '']);
  });
});
