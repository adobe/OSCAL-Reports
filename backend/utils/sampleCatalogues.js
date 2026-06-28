/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Single source of truth for preset and release-gate custom OSCAL catalogue URLs.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOGUE_MANIFEST_PATH = path.resolve(__dirname, '../../config/catalogues/sample-catalogues.json');

let cachedManifest = null;

/**
 * @returns {{ version: number, defined: Array, custom: Array }}
 */
export function loadCatalogueManifest() {
  if (cachedManifest) {
    return cachedManifest;
  }
  const raw = fs.readFileSync(CATALOGUE_MANIFEST_PATH, 'utf8');
  cachedManifest = JSON.parse(raw);
  return cachedManifest;
}

/** Preset catalogues shown in the UI dropdown (sorted by name). */
export function getDefinedCatalogues() {
  const { defined } = loadCatalogueManifest();
  return [...defined].sort((a, b) => a.name.localeCompare(b.name));
}

/** Additional URLs exercised by the release gate (custom URL input workflow). */
export function getCustomCatalogueUrls() {
  const { custom } = loadCatalogueManifest();
  return [...custom];
}

/** All catalogue URLs that must pass before a version release. */
export function getReleaseGateCatalogues() {
  return [...getDefinedCatalogues(), ...getCustomCatalogueUrls()];
}

/** @param {Array<{ url: string }>} entries */
export function assertUniqueCatalogueUrls(entries) {
  const seen = new Set();
  for (const entry of entries) {
    if (!entry?.url) {
      throw new Error('Catalogue entry missing url');
    }
    if (seen.has(entry.url)) {
      throw new Error(`Duplicate catalogue URL: ${entry.url}`);
    }
    seen.add(entry.url);
  }
}
