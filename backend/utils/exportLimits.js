/**
 * Export generation payload limits (OWASP API4 — avoid unbounded resource use).
 * Override with environment variables on large-catalog deployments.
 *
 * OSCAL_EXPORT_MAX_CONTROLS — default 10000, clamped 100–50000
 * OSCAL_EXPORT_MAX_METADATA_BYTES — default 512KB, clamped 10KB–5MB
 */

function clampInt(value, min, max, fallback) {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

export function getExportMaxControls() {
  return clampInt(
    process.env.OSCAL_EXPORT_MAX_CONTROLS,
    100,
    50000,
    10000
  );
}

export function getExportMaxMetadataBytes() {
  return clampInt(
    process.env.OSCAL_EXPORT_MAX_METADATA_BYTES,
    10 * 1024,
    5 * 1024 * 1024,
    512 * 1024
  );
}

/**
 * @param {unknown} controls - array of controls
 * @param {unknown} metadata - catalog/metadata object (optional)
 * @returns {null | { status: number, body: object }}
 */
export function validateExportGenerationLimits(controls, metadata) {
  const maxControls = getExportMaxControls();
  const list = Array.isArray(controls) ? controls : [];
  if (list.length > maxControls) {
    return {
      status: 400,
      body: {
        error: 'Request too large',
        message: `Maximum ${maxControls} controls per export request (set OSCAL_EXPORT_MAX_CONTROLS up to 50000 if needed)`,
        limit: maxControls,
        received: list.length
      }
    };
  }

  const maxMeta = getExportMaxMetadataBytes();
  const metadataSize = JSON.stringify(metadata ?? {}).length;
  if (metadataSize > maxMeta) {
    return {
      status: 400,
      body: {
        error: 'Metadata too large',
        message: `Metadata must be less than ${Math.round(maxMeta / 1024)}KB (set OSCAL_EXPORT_MAX_METADATA_BYTES if needed)`,
        limitBytes: maxMeta,
        receivedBytes: metadataSize
      }
    };
  }

  return null;
}
