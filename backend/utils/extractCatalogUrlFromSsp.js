/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Resolve the OSCAL catalogue JSON URL stored in an exported SSP for re-import.
 */

const INVALID_HREFS = new Set(['#', '', 'No_Input_Recorded', 'Unknown']);

/**
 * @param {unknown} href
 * @returns {boolean}
 */
export function isValidCatalogHref(href) {
  if (href == null || typeof href !== 'string') {
    return false;
  }
  const trimmed = href.trim();
  if (!trimmed || INVALID_HREFS.has(trimmed)) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * @param {object} ssp
 * @returns {string|null}
 */
function hrefFromImportProfile(ssp) {
  const importProfile = ssp?.['import-profile'];
  if (!importProfile) {
    return null;
  }
  const href = importProfile.href || importProfile['#']?.href;
  return isValidCatalogHref(href) ? href.trim() : null;
}

/**
 * @param {object} ssp
 * @returns {string|null}
 */
function hrefFromMetadataLinks(ssp) {
  const links = ssp?.metadata?.links;
  if (!Array.isArray(links)) {
    return null;
  }

  const catalogLink = links.find(
    (link) =>
      link?.href
      && isValidCatalogHref(link.href)
      && (link.rel === 'source-catalog' || link.rel === 'catalog')
  );
  if (catalogLink) {
    return catalogLink.href.trim();
  }

  return null;
}

/**
 * Extract the catalogue JSON URL from SSP JSON (root or system-security-plan wrapper).
 * Prefers import-profile.href (written by this tool), then metadata source-catalog links.
 *
 * @param {object} sspData
 * @returns {string|null}
 */
export function extractCatalogUrlFromSsp(sspData) {
  if (!sspData || typeof sspData !== 'object') {
    return null;
  }

  const ssp = sspData['system-security-plan'] || sspData;

  const fromImport = hrefFromImportProfile(ssp);
  if (fromImport) {
    return fromImport;
  }

  const fromMetadata = hrefFromMetadataLinks(ssp);
  if (fromMetadata) {
    return fromMetadata;
  }

  if (isValidCatalogHref(sspData.catalogueUrl)) {
    return sspData.catalogueUrl.trim();
  }

  return null;
}
