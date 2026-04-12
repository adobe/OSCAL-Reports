/**
 * Build a clear message from export API error payloads (JSON or blob-wrapped JSON).
 */

export function formatExportApiBody(data, fallback) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return fallback;
  const parts = [data.error, data.message].filter(Boolean);
  if (data.limit != null && data.received != null) {
    parts.push(`received ${data.received}, limit ${data.limit}`);
  }
  return parts.length ? parts.join(' — ') : fallback;
}

/** @param {unknown} err */
export async function exportErrorMessage(err, fallback) {
  const d = err.response?.data;
  if (d instanceof Blob) {
    try {
      const j = JSON.parse(await d.text());
      return formatExportApiBody(j, fallback);
    } catch {
      return fallback;
    }
  }
  const fromBody = formatExportApiBody(d, '');
  if (fromBody) return fromBody;
  const msg = err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
    ? err.message
    : '';
  return msg || fallback;
}
