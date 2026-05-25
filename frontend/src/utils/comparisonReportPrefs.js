/**
 * Per-user Multi-Report Comparison URL preferences (browser localStorage only).
 *
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */

export const PREFS_KEY_PREFIX = 'oscal_mrc_prefs_v1_';
export const MAX_URL_LENGTH = 2048;

const DEFAULT_REPORT_TYPES = {
  baseline: 'PaaS',
  csp1: 'IaaS',
  csp2: 'SaaS',
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
