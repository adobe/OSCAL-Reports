/**
 * Unit tests for per-user Multi-Report Comparison URL prefs (localStorage).
 *
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */

import { describe, test, expect, beforeEach } from '@jest/globals';
import {
  PREFS_KEY_PREFIX,
  loadComparisonReportPrefs,
  saveComparisonReportPrefs,
  saveComparisonUrlForSlot,
  clearComparisonReportPrefs,
  normalizeComparisonUrl,
  defaultSlotInputMode,
  sanitizePrefs,
  getPrefsStorageKey,
  loadComparisonWorkSession,
  saveComparisonWorkSession,
  mergeBaselineControlsFromSession,
} from '../../../frontend/src/utils/comparisonReportPrefs.js';

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  };
}

describe('comparisonReportPrefs', () => {
  let storage;

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  test('getPrefsStorageKey scopes by user id', () => {
    expect(getPrefsStorageKey('user-a', storage)).toBe(`${PREFS_KEY_PREFIX}user-a`);
    expect(getPrefsStorageKey('user-b', storage)).toBe(`${PREFS_KEY_PREFIX}user-b`);
    expect(getPrefsStorageKey('', storage)).toBeNull();
  });

  test('normalizeComparisonUrl rejects invalid and long URLs', () => {
    expect(normalizeComparisonUrl('https://example.com/a.json')).toBe('https://example.com/a.json');
    expect(normalizeComparisonUrl('not-a-url')).toBe('');
    expect(normalizeComparisonUrl(`https://x.com/${'a'.repeat(3000)}`)).toBe('');
  });

  test('save and load prefs per user without cross-user bleed', () => {
    saveComparisonUrlForSlot('alice', 'baseline', 'https://example.com/alice.json', storage);
    saveComparisonUrlForSlot('bob', 'baseline', 'https://example.com/bob.json', storage);

    const alice = loadComparisonReportPrefs('alice', storage);
    const bob = loadComparisonReportPrefs('bob', storage);

    expect(alice.baselineUrl).toBe('https://example.com/alice.json');
    expect(bob.baselineUrl).toBe('https://example.com/bob.json');
    expect(alice.csp1Url).toBe('');
  });

  test('saveComparisonReportPrefs merges report types', () => {
    saveComparisonReportPrefs('u1', {
      reportTypes: { baseline: 'SaaS', csp1: 'IaaS' },
    }, storage);
    saveComparisonUrlForSlot('u1', 'csp2', 'https://example.com/csp2.json', storage);

    const prefs = loadComparisonReportPrefs('u1', storage);
    expect(prefs.reportTypes.baseline).toBe('SaaS');
    expect(prefs.reportTypes.csp1).toBe('IaaS');
    expect(prefs.csp2Url).toBe('https://example.com/csp2.json');
  });

  test('clearComparisonReportPrefs removes user entry', () => {
    saveComparisonUrlForSlot('u1', 'baseline', 'https://example.com/x.json', storage);
    expect(clearComparisonReportPrefs('u1', storage)).toBe(true);
    const prefs = loadComparisonReportPrefs('u1', storage);
    expect(prefs.baselineUrl).toBe('');
  });

  test('defaultSlotInputMode prefers url when pref exists', () => {
    const prefs = sanitizePrefs({ csp1Url: 'https://example.com/c1.json' });
    expect(defaultSlotInputMode(prefs, 'csp1')).toBe('url');
    expect(defaultSlotInputMode(prefs, 'csp2')).toBe('file');
    expect(defaultSlotInputMode(null, 'baseline')).toBe('url');
  });

  test('mergeBaselineControlsFromSession overlays saved edits', () => {
    const api = { ac1: { id: 'ac1', status: 'implemented' } };
    const saved = { ac1: { id: 'ac1', status: 'partial', remarks: 'edited' } };
    const merged = mergeBaselineControlsFromSession(api, saved);
    expect(merged.ac1.status).toBe('partial');
    expect(merged.ac1.remarks).toBe('edited');
  });

  test('save and load work session with baseline control edits', () => {
    const controls = { ac1: { id: 'ac1', status: 'implemented', title: 'AC-1' } };
    const saveResult = saveComparisonWorkSession('u1', {
      baselineControls: controls,
      exportValidationOptions: { requiredFields: true, stringPatterns: true, enums: false, formats: false, lengthRestrictions: false, additionalProperties: false },
    }, storage);
    expect(saveResult.saved).toBe(true);
    const loaded = loadComparisonWorkSession('u1', storage);
    expect(loaded.baselineControls.ac1.status).toBe('implemented');
    expect(loaded.exportValidationOptions.stringPatterns).toBe(true);
  });
});
