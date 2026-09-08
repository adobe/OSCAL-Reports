/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Backend accessor for the shared reference data in config/constants/*.json —
 * the single source of truth shared with the frontend. Mirrors the loader
 * pattern in backend/utils/sampleCatalogues.js (cached fs read + JSON.parse).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONSTANTS_DIR = path.resolve(__dirname, '../../config/constants');

const cache = {};

function loadJson(name) {
  if (cache[name]) return cache[name];
  const raw = fs.readFileSync(path.join(CONSTANTS_DIR, `${name}.json`), 'utf8');
  cache[name] = JSON.parse(raw);
  return cache[name];
}

// ---- Control implementation status --------------------------------------

/** @returns {Array<{value,label,emoji,hex,oscalStatus,oscalImplementation}>} */
export function getControlStatuses() {
  return loadJson('control-status').statuses;
}

/** value -> human label (e.g. "Not Assessed"). */
export function getControlStatusLabelMap() {
  return Object.fromEntries(getControlStatuses().map((s) => [s.value, s.label]));
}

/** value -> hex colour (for PDF etc.). */
export function getControlStatusColorMap() {
  return Object.fromEntries(getControlStatuses().map((s) => [s.value, s.hex]));
}

/**
 * OSCAL finding target for a control status.
 * @returns {{status: 'satisfied'|'not-satisfied', implementation: string}}
 */
export function getOscalTargetForStatus(status) {
  const entry = getControlStatuses().find((s) => s.value === status);
  if (entry) {
    return { status: entry.oscalStatus, implementation: entry.oscalImplementation };
  }
  // Legacy value used by older reports.
  if (status === 'implemented') {
    return { status: 'satisfied', implementation: 'implemented' };
  }
  return { status: 'not-satisfied', implementation: 'planned' };
}

// ---- System lifecycle status --------------------------------------------

export function getSystemStatusOptions() {
  return loadJson('system-status').options;
}

export function getSystemStatusLabelMap() {
  return Object.fromEntries(getSystemStatusOptions().map((o) => [o.value, o.label]));
}

export function getDefaultSystemStatus() {
  return loadJson('system-status').default;
}

// ---- Roles ---------------------------------------------------------------

/** @returns {{PLATFORM_ADMIN:string, USER:string, ASSESSOR:string}} */
export function getRoles() {
  return loadJson('roles').roles;
}
