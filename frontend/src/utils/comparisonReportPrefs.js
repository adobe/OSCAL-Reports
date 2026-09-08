/**
 * Per-user Multi-Report Comparison URL preferences (browser localStorage only).
 *
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */

import { DEFAULT_SERVICE_MODELS } from '../constants/serviceModels.js';

export const PREFS_KEY_PREFIX = 'oscal_mrc_prefs_v1_';
export const WORK_SESSION_KEY_PREFIX = 'oscal_mrc_work_v1_';
export const MAX_URL_LENGTH = 2048;
/** Stay under typical ~5MB localStorage quota per origin. */
export const MAX_WORK_SESSION_BYTES = 4_500_000;

const DEFAULT_REPORT_TYPES = { ...DEFAULT_SERVICE_MODELS };

const DEFAULT_REPORT_NAMES = {
  baseline: 'Assessment Subject Report',
  csp1: 'Cloud Service Provider Report 1',
  csp2: 'Cloud Service Provider Report 2',
};

const SLOT_KEYS = ['baseline', 'csp1', 'csp2'];

/**
 * @returns {Storage | null}
 */
export function getDefaultStorage() {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch {
    /* private mode / SSR */
  }
  return null;
}

/**
 * @param {string} userId
 * @param {Storage | null} [storage]
 */
export function getPrefsStorageKey(userId, storage = getDefaultStorage()) {
  if (!userId || typeof userId !== 'string') {
    return null;
  }
  if (!storage) {
    return null;
  }
  return `${PREFS_KEY_PREFIX}${userId}`;
}

/**
 * @param {string} url
 * @returns {string}
 */
export function normalizeComparisonUrl(url) {
  if (typeof url !== 'string') {
    return '';
  }
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) {
    return '';
  }
  try {
    // eslint-disable-next-line no-new
    new URL(trimmed);
    return trimmed;
  } catch {
    return '';
  }
}

/**
 * @param {unknown} raw
 * @returns {{ baselineUrl: string, csp1Url: string, csp2Url: string, reportTypes: object, updatedAt: string | null }}
 */
export function sanitizePrefs(raw) {
  const reportTypes = { ...DEFAULT_REPORT_TYPES };
  if (raw && typeof raw === 'object' && raw.reportTypes && typeof raw.reportTypes === 'object') {
    for (const key of SLOT_KEYS) {
      if (typeof raw.reportTypes[key] === 'string' && raw.reportTypes[key]) {
        reportTypes[key] = raw.reportTypes[key];
      }
    }
  }
  return {
    baselineUrl: normalizeComparisonUrl(raw?.baselineUrl ?? ''),
    csp1Url: normalizeComparisonUrl(raw?.csp1Url ?? ''),
    csp2Url: normalizeComparisonUrl(raw?.csp2Url ?? ''),
    reportTypes,
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : null,
  };
}

/**
 * @param {string} userId
 * @param {Storage | null} [storage]
 * @returns {ReturnType<typeof sanitizePrefs> | null}
 */
export function loadComparisonReportPrefs(userId, storage = getDefaultStorage()) {
  const key = getPrefsStorageKey(userId, storage);
  if (!key) {
    return null;
  }
  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return sanitizePrefs(null);
    }
    return sanitizePrefs(JSON.parse(raw));
  } catch {
    return sanitizePrefs(null);
  }
}

/**
 * @param {string} userId
 * @param {Partial<{ baselineUrl?: string, csp1Url?: string, csp2Url?: string, reportTypes?: object }>} partial
 * @param {Storage | null} [storage]
 * @returns {boolean}
 */
export function saveComparisonReportPrefs(userId, partial, storage = getDefaultStorage()) {
  const key = getPrefsStorageKey(userId, storage);
  if (!key) {
    return false;
  }
  const existing = loadComparisonReportPrefs(userId, storage) || sanitizePrefs(null);
  const next = sanitizePrefs({
    baselineUrl: partial.baselineUrl !== undefined
      ? normalizeComparisonUrl(partial.baselineUrl)
      : existing.baselineUrl,
    csp1Url: partial.csp1Url !== undefined
      ? normalizeComparisonUrl(partial.csp1Url)
      : existing.csp1Url,
    csp2Url: partial.csp2Url !== undefined
      ? normalizeComparisonUrl(partial.csp2Url)
      : existing.csp2Url,
    reportTypes: partial.reportTypes ?? existing.reportTypes,
    updatedAt: new Date().toISOString(),
  });
  try {
    storage.setItem(key, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

/**
 * Persist URL for one slot after a successful load from URL.
 * @param {string} userId
 * @param {'baseline'|'csp1'|'csp2'} slot
 * @param {string} url
 * @param {Storage | null} [storage]
 */
export function saveComparisonUrlForSlot(userId, slot, url, storage = getDefaultStorage()) {
  const normalized = normalizeComparisonUrl(url);
  if (!normalized || !SLOT_KEYS.includes(slot)) {
    return false;
  }
  return saveComparisonReportPrefs(userId, { [`${slot}Url`]: normalized }, storage);
}

/**
 * @param {string} userId
 * @param {{ baseline?: string, csp1?: string, csp2?: string }} reportTypes
 * @param {Storage | null} [storage]
 */
export function saveComparisonReportTypes(userId, reportTypes, storage = getDefaultStorage()) {
  if (!reportTypes || typeof reportTypes !== 'object') {
    return false;
  }
  const current = loadComparisonReportPrefs(userId, storage) || sanitizePrefs(null);
  return saveComparisonReportPrefs(userId, {
    reportTypes: { ...current.reportTypes, ...reportTypes },
  }, storage);
}

/**
 * @param {string} userId
 * @param {Storage | null} [storage]
 */
export function clearComparisonReportPrefs(userId, storage = getDefaultStorage()) {
  const key = getPrefsStorageKey(userId, storage);
  if (!key) {
    return false;
  }
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/**
 * Default input mode per slot when prefs have no URL for that slot.
 * @param {ReturnType<typeof sanitizePrefs> | null} prefs
 * @param {'baseline'|'csp1'|'csp2'} slot
 * @returns {'url'|'file'}
 */
export function defaultSlotInputMode(prefs, slot) {
  const urlKey = `${slot}Url`;
  if (prefs && prefs[urlKey]) {
    return 'url';
  }
  return slot === 'baseline' ? 'url' : 'file';
}

/**
 * @param {unknown} value
 * @returns {number}
 */
export function estimateJsonBytes(value) {
  try {
    return new Blob([JSON.stringify(value)]).size;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

/**
 * @param {string} userId
 * @param {Storage | null} [storage]
 * @returns {string | null}
 */
export function getWorkSessionStorageKey(userId, storage = getDefaultStorage()) {
  if (!userId || typeof userId !== 'string' || !storage) {
    return null;
  }
  return `${WORK_SESSION_KEY_PREFIX}${userId}`;
}

const DEFAULT_EXPORT_VALIDATION_OPTIONS = {
  requiredFields: true,
  stringPatterns: false,
  enums: false,
  formats: false,
  lengthRestrictions: false,
  additionalProperties: false,
};

/**
 * Sanitize persisted comparison work session (browser-only; no secrets).
 * @param {unknown} raw
 */
export function sanitizeWorkSession(raw) {
  const exportValidationOptions = { ...DEFAULT_EXPORT_VALIDATION_OPTIONS };
  if (raw?.exportValidationOptions && typeof raw.exportValidationOptions === 'object') {
    for (const key of Object.keys(DEFAULT_EXPORT_VALIDATION_OPTIONS)) {
      if (typeof raw.exportValidationOptions[key] === 'boolean') {
        exportValidationOptions[key] = raw.exportValidationOptions[key];
      }
    }
  }

  const reportNames = { ...DEFAULT_REPORT_NAMES };
  if (raw?.reportNames && typeof raw.reportNames === 'object') {
    for (const key of SLOT_KEYS) {
      if (typeof raw.reportNames[key] === 'string' && raw.reportNames[key].trim()) {
        reportNames[key] = raw.reportNames[key].trim().slice(0, 256);
      }
    }
  }

  const reportTypes = { ...DEFAULT_REPORT_TYPES };
  if (raw?.reportTypes && typeof raw.reportTypes === 'object') {
    for (const key of SLOT_KEYS) {
      if (typeof raw.reportTypes[key] === 'string' && raw.reportTypes[key]) {
        reportTypes[key] = raw.reportTypes[key];
      }
    }
  }

  const baselineControls = {};
  if (raw?.baselineControls && typeof raw.baselineControls === 'object' && !Array.isArray(raw.baselineControls)) {
    for (const [id, control] of Object.entries(raw.baselineControls)) {
      if (typeof id === 'string' && id && control && typeof control === 'object') {
        baselineControls[id] = control;
      }
    }
  }

  return {
    baselineControls,
    exportValidationOptions,
    reportNames,
    reportTypes,
    updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : null,
  };
}

/**
 * Load saved comparison edits and export options for this user (browser localStorage only).
 * @param {string} userId
 * @param {Storage | null} [storage]
 */
export function loadComparisonWorkSession(userId, storage = getDefaultStorage()) {
  const key = getWorkSessionStorageKey(userId, storage);
  if (!key) {
    return sanitizeWorkSession(null);
  }
  try {
    const raw = storage.getItem(key);
    if (!raw) {
      return sanitizeWorkSession(null);
    }
    return sanitizeWorkSession(JSON.parse(raw));
  } catch {
    return sanitizeWorkSession(null);
  }
}

/**
 * Persist comparison edits and export options (browser-only; never sent to server).
 * @param {string} userId
 * @param {object} partial
 * @param {Storage | null} [storage]
 * @returns {{ saved: boolean, reason?: string }}
 */
export function saveComparisonWorkSession(userId, partial, storage = getDefaultStorage()) {
  const key = getWorkSessionStorageKey(userId, storage);
  if (!key) {
    return { saved: false, reason: 'no_storage' };
  }

  const existing = loadComparisonWorkSession(userId, storage);
  const next = sanitizeWorkSession({
    baselineControls: partial.baselineControls ?? existing.baselineControls,
    exportValidationOptions: partial.exportValidationOptions ?? existing.exportValidationOptions,
    reportNames: partial.reportNames ?? existing.reportNames,
    reportTypes: partial.reportTypes ?? existing.reportTypes,
    updatedAt: new Date().toISOString(),
  });

  const bytes = estimateJsonBytes(next);
  if (bytes > MAX_WORK_SESSION_BYTES) {
    return { saved: false, reason: 'too_large' };
  }

  try {
    storage.setItem(key, JSON.stringify(next));
    return { saved: true };
  } catch {
    return { saved: false, reason: 'quota' };
  }
}

/**
 * Overlay saved control edits onto API-derived baseline controls map.
 * @param {Record<string, object>} apiMap
 * @param {Record<string, object>} savedMap
 */
export function mergeBaselineControlsFromSession(apiMap, savedMap) {
  if (!savedMap || typeof savedMap !== 'object') {
    return apiMap;
  }
  const merged = { ...apiMap };
  for (const [id, saved] of Object.entries(savedMap)) {
    if (merged[id] && saved && typeof saved === 'object') {
      merged[id] = { ...merged[id], ...saved, id };
    }
  }
  return merged;
}
