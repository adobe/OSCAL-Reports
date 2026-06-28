/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Shared control text extraction for AI suggestion prompts (SSP, catalog, comparison).
 */

/**
 * @param {object} control
 * @returns {string}
 */
export function extractControlTitleForPrompt(control) {
  let title = (control?.catalogTitle || control?.title || control?.id || '').trim();
  if (title.toLowerCase().startsWith('control:')) {
    title = title.substring(8).trim();
  }
  return title || control?.id || 'Unknown';
}

/**
 * Collect catalog / statement text from all common OSCAL and app field shapes.
 * @param {object} control
 * @returns {string}
 */
export function extractControlDescriptionText(control) {
  if (!control || typeof control !== 'object') {
    return '';
  }

  const chunks = [];

  if (control.parts && Array.isArray(control.parts) && control.parts.length > 0) {
    const statementParts = control.parts.filter((p) =>
      p?.name === 'statement' || p?.name === 'objective' || p?.name === 'item'
    );
    const partsToUse = statementParts.length > 0 ? statementParts : control.parts;
    const fromParts = partsToUse
      .map((part) => (part?.prose || part?.title || '').trim())
      .filter((text) => text.length > 0)
      .join('\n\n');
    if (fromParts) {
      chunks.push(fromParts);
    }
  }

  for (const field of [
    'catalogDescription',
    'description',
    'consumerGuidance',
    'groupTitle',
  ]) {
    const value = control[field];
    if (typeof value === 'string' && value.trim().length > 0) {
      chunks.push(value.trim());
    }
  }

  if (control.statements && Array.isArray(control.statements)) {
    const fromStatements = control.statements
      .map((s) => (typeof s === 'string' ? s : s?.prose || s?.description || ''))
      .filter((t) => t && String(t).trim().length > 0)
      .join('\n\n');
    if (fromStatements) {
      chunks.push(fromStatements);
    }
  }

  const unique = [];
  const seen = new Set();
  for (const chunk of chunks) {
    const normalized = chunk.replace(/\s+/g, ' ').trim();
    if (normalized.length > 0 && !seen.has(normalized)) {
      seen.add(normalized);
      unique.push(chunk.trim());
    }
  }

  return unique.join('\n\n');
}

/**
 * Pick up to 3 implementation examples from different control families for style-only guidance.
 * @param {Array} existingControls
 * @returns {string[]}
 */
export function pickDiverseImplementationExamples(existingControls = []) {
  const examples = [];
  const familiesUsed = new Set();

  for (const c of existingControls || []) {
    const impl = (c?.implementation || c?.implementationDescription || '').trim();
    if (!impl || impl.length < 50) {
      continue;
    }
    const family = (c.id || '').split('-')[0] || 'unknown';
    if (familiesUsed.has(family) && examples.length >= 1) {
      continue;
    }
    examples.push(impl);
    familiesUsed.add(family);
    if (examples.length >= 3) {
      break;
    }
  }

  if (examples.length < 3) {
    for (const c of existingControls || []) {
      const impl = (c?.implementation || c?.implementationDescription || '').trim();
      if (!impl || impl.length < 50 || examples.includes(impl)) {
        continue;
      }
      examples.push(impl);
      if (examples.length >= 3) {
        break;
      }
    }
  }

  return examples;
}

/**
 * @param {string} controlId
 * @returns {string}
 */
export function controlFamilyFromId(controlId) {
  return (controlId || '').split('-')[0] || 'GENERAL';
}
