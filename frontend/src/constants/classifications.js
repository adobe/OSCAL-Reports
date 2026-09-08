/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Frontend accessor for config/constants/classification-levels.json (shared source):
 * per-framework classification levels + URL→framework detection.
 */
import data from '../../../config/constants/classification-levels.json';

export const CLASSIFICATION_LEVELS = data.byFramework;

/** Detect the framework key ('ACSC' | 'NIST' | 'Singapore' | 'default') from a catalogue URL. */
export function detectFramework(url) {
  if (!url) return 'default';
  const u = String(url).toLowerCase();
  for (const rule of data.frameworkDetection) {
    if (rule.patterns.some((p) => u.includes(p))) return rule.framework;
  }
  return 'default';
}
