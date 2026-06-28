/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */

import { describe, test, expect } from '@jest/globals';
import {
  extractCatalogUrlFromSsp,
  isValidCatalogHref,
} from '../../../backend/utils/extractCatalogUrlFromSsp.js';

const CATALOG_URL =
  'https://raw.githubusercontent.com/AustralianCyberSecurityCentre/ism-oscal/refs/tags/v2025.10.8/ISM_NON_CLASSIFIED-baseline-resolved-profile_catalog.json';
const PROFILE_XML_URL =
  'https://www.cyber.gov.au/ism/oscal/v2025.10.8/artifacts/ISM_NON_CLASSIFIED-baseline_profile.xml';

describe('extractCatalogUrlFromSsp', () => {
  test('isValidCatalogHref rejects placeholders and accepts HTTPS URLs', () => {
    expect(isValidCatalogHref(CATALOG_URL)).toBe(true);
    expect(isValidCatalogHref('#')).toBe(false);
    expect(isValidCatalogHref('No_Input_Recorded')).toBe(false);
    expect(isValidCatalogHref('')).toBe(false);
    expect(isValidCatalogHref('not-a-url')).toBe(false);
  });

  test('prefers import-profile href over metadata source-profile XML link', () => {
    const sspData = {
      'system-security-plan': {
        'import-profile': { href: CATALOG_URL },
        metadata: {
          links: [{ href: PROFILE_XML_URL, rel: 'source-profile' }],
        },
      },
    };
    expect(extractCatalogUrlFromSsp(sspData)).toBe(CATALOG_URL);
  });

  test('uses metadata source-catalog link when import-profile is a placeholder', () => {
    const sspData = {
      'system-security-plan': {
        'import-profile': { href: '#' },
        metadata: {
          links: [{ href: CATALOG_URL, rel: 'source-catalog' }],
        },
      },
    };
    expect(extractCatalogUrlFromSsp(sspData)).toBe(CATALOG_URL);
  });

  test('falls back to top-level catalogueUrl extension field', () => {
    const sspData = {
      'system-security-plan': {
        'import-profile': { href: 'No_Input_Recorded' },
      },
      catalogueUrl: CATALOG_URL,
    };
    expect(extractCatalogUrlFromSsp(sspData)).toBe(CATALOG_URL);
  });

  test('returns null when no valid URL is present', () => {
    const sspData = {
      'system-security-plan': {
        'import-profile': { href: '#' },
        metadata: {
          links: [{ href: PROFILE_XML_URL, rel: 'source-profile' }],
        },
      },
    };
    expect(extractCatalogUrlFromSsp(sspData)).toBeNull();
  });
});
