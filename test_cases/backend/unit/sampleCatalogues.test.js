/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */

import { describe, test, expect } from '@jest/globals';
import {
  getDefinedCatalogues,
  getCustomCatalogueUrls,
  getReleaseGateCatalogues,
  assertUniqueCatalogueUrls,
  loadCatalogueManifest,
} from '../../../backend/utils/sampleCatalogues.js';

describe('sampleCatalogues manifest', () => {
  test('defines preset and custom catalogue URL lists', () => {
    const manifest = loadCatalogueManifest();
    expect(manifest.version).toBeGreaterThanOrEqual(1);
    expect(getDefinedCatalogues().length).toBeGreaterThanOrEqual(15);
    expect(getCustomCatalogueUrls().length).toBeGreaterThanOrEqual(1);
  });

  test('all release-gate URLs are unique HTTPS endpoints', () => {
    const all = getReleaseGateCatalogues();
    assertUniqueCatalogueUrls(all);
    for (const entry of all) {
      expect(entry.url).toMatch(/^https:\/\//);
      expect(entry.name).toBeTruthy();
      expect(entry.minControls ?? 1).toBeGreaterThanOrEqual(1);
    }
  });

  test('custom URLs are not duplicated in the preset dropdown list', () => {
    const definedUrls = new Set(getDefinedCatalogues().map((c) => c.url));
    for (const custom of getCustomCatalogueUrls()) {
      expect(definedUrls.has(custom.url)).toBe(false);
    }
  });
});
