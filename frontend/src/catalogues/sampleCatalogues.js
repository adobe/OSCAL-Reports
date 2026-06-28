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
