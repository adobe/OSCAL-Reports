/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { describe, test, expect } from '@jest/globals';
import {
  extractControlDescriptionText,
  extractControlTitleForPrompt,
  pickDiverseImplementationExamples,
} from '../../../backend/utils/controlPromptContext.js';
import { buildPrompt } from '../../../backend/gemmaService.js';

describe('controlPromptContext', () => {
  test('extracts catalogDescription from SSP-shaped controls', () => {
    const text = extractControlDescriptionText({
      id: 'AC-2',
      title: 'Account Management',
      catalogDescription: 'The organization manages information system accounts.',
    });
    expect(text).toContain('manages information system accounts');
  });

  test('prefers catalogTitle over raw id for prompt title', () => {
    expect(extractControlTitleForPrompt({
      id: 'AC-2',
      catalogTitle: 'Account Management',
      title: 'Control: Account Management',
    })).toBe('Account Management');
  });

  test('picks examples from different control families when possible', () => {
    const examples = pickDiverseImplementationExamples([
      { id: 'AC-1', implementation: 'A'.repeat(60) },
      { id: 'AC-2', implementation: 'B'.repeat(60) },
      { id: 'AU-1', implementation: 'C'.repeat(60) },
      { id: 'SC-1', implementation: 'D'.repeat(60) },
    ]);
    expect(examples).toHaveLength(3);
    expect(examples[0]).not.toBe(examples[1]);
  });
});

describe('buildPrompt', () => {
  test('includes catalog statement in the prompt', () => {
    const prompt = buildPrompt({
      id: 'IA-5',
      catalogTitle: 'Authenticator Management',
      catalogDescription: 'The organization manages system authenticators.',
    });
    expect(prompt).toContain('IA-5');
    expect(prompt).toContain('Authenticator Management');
    expect(prompt).toContain('manages system authenticators');
    expect(prompt).not.toContain('No description available');
  });
});
