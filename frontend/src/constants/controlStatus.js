/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Frontend accessor for the shared control-status source of truth
 * (config/constants/control-status.json), mirroring catalogues/sampleCatalogues.js.
 */
import controlStatus from '../../../config/constants/control-status.json';

export const CONTROL_STATUSES = controlStatus.statuses;

// Components style the badge via a CSS class `status-<value>`, so the historical
// `color` field equals the value. Shape preserved for existing consumers.
export const STATUS_OPTIONS = CONTROL_STATUSES.map((s) => ({
  value: s.value,
  label: s.label,
  color: s.value,
}));

/** value -> label, e.g. { 'not-assessed': 'Not Assessed', ... } (all 7). */
export const STATUS_LABELS = Object.fromEntries(
  CONTROL_STATUSES.map((s) => [s.value, s.label])
);
