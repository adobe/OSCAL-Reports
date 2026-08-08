/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Mandatory release gate: live fetch of every preset and custom OSCAL catalogue URL.
 * Requires outbound HTTPS (GitHub raw). Skipped when OSCAL_SKIP_CATALOGUE_FETCH=1.
 */

import { describe, test, expect, jest } from '@jest/globals';
import {
  getDefinedCatalogues,
  getCustomCatalogueUrls,
} from '../../../backend/utils/sampleCatalogues.js';
import { fetchCatalogueFromUrl } from '../../../backend/utils/fetchCatalogueFromUrl.js';
import { getSsrfValidationOptions } from '../../../backend/utils/securityConfig.js';

const skipLiveFetch = ['1', 'true', 'yes'].includes(
  String(process.env.OSCAL_SKIP_CATALOGUE_FETCH || '').toLowerCase()
);

jest.setTimeout(180000);

const describeLive = skipLiveFetch ? describe.skip : describe;

const urlOptions = getSsrfValidationOptions('strictCatalogueFetch');
urlOptions.timeoutMs = 120000;

async function assertCatalogueFetch(entry, category) {
  const minControls = entry.minControls ?? 1;
  const result = await fetchCatalogueFromUrl(entry.url, urlOptions);

  expect(result).toHaveProperty('catalogue');
  expect(result).toHaveProperty('controls');
  expect(Array.isArray(result.controls)).toBe(true);
  expect(result.controls.length).toBeGreaterThanOrEqual(minControls);

  const hasMetadata = result.metadata != null
    || result.catalogue?.catalog?.metadata != null
    || result.catalogue?.metadata != null;
  expect(hasMetadata).toBe(true);

  const firstControl = result.controls[0];
  expect(firstControl).toHaveProperty('id');
  expect(String(firstControl.id).length).toBeGreaterThan(0);

  if (entry.expectedControlIdPattern) {
    const pattern = new RegExp(entry.expectedControlIdPattern);
    const match = result.controls.some((c) => pattern.test(String(c.id)));
    expect(match).toBe(true);
  }

  return { category, name: entry.name, controlCount: result.controls.length };
}

describeLive('OSCAL catalogue fetch release gate (live)', () => {
  describe('defined preset catalogues', () => {
    test.each(getDefinedCatalogues().map((c) => [c.name, c]))(
      'fetches preset: %s',
      async (_name, entry) => {
        await assertCatalogueFetch(entry, 'defined');
      }
    );
  });

  describe('custom URL catalogues', () => {
    test.each(getCustomCatalogueUrls().map((c) => [c.name, c]))(
      'fetches custom: %s',
      async (_name, entry) => {
        await assertCatalogueFetch(entry, 'custom');
      }
    );
  });
});

if (skipLiveFetch) {
  test('catalogue fetch release gate skipped (OSCAL_SKIP_CATALOGUE_FETCH set)', () => {
    expect(true).toBe(true);
  });
}
