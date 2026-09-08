/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Preset OSCAL catalogues for the UI — sourced from config/catalogues/sample-catalogues.json.
 */

import catalogueManifest from '../../../config/catalogues/sample-catalogues.json';

export const SAMPLE_CATALOGUES = [...catalogueManifest.defined].sort((a, b) =>
  a.name.localeCompare(b.name)
);

// Friendly family labels for publisher codes used in the manifest. Kept here (one
// place) so the "supported catalogues" summary below stays derived, never hardcoded.
const PUBLISHER_LABELS = {
  ACSC: 'Australian ISM',
  NIST: 'NIST SP 800-53',
  CCCS: 'Canadian CCCS',
  BSI: 'BSI Grundschutz++',
  FedRAMP: 'FedRAMP',
  CMS: 'CMS ARS',
  'GovTech SG': 'Singapore IM8',
};

/**
 * Derives the "supported catalogues" summary from the manifest so on-screen copy
 * can never drift from the actual list. Returns e.g.
 * "Australian ISM (5), BSI Grundschutz++ (1), … plus custom OSCAL catalogs".
 */
export function getSupportedCatalogueSummary() {
  const counts = {};
  for (const c of SAMPLE_CATALOGUES) {
    counts[c.publisher] = (counts[c.publisher] || 0) + 1;
  }
  const parts = Object.keys(counts)
    .sort((a, b) => (PUBLISHER_LABELS[a] || a).localeCompare(PUBLISHER_LABELS[b] || b))
    .map((p) => `${PUBLISHER_LABELS[p] || p} (${counts[p]})`);
  return `${parts.join(', ')}, plus custom OSCAL catalogs`;
}
