/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Classify ISM catalogue entries as principles vs controls for ACSC worksheets.
 */

const PRINCIPLE_ID_PATTERN = /^(GOV|ID|PR|DE|RS|RC|GV|IDAM|PRAC|DEAE|RSMA|RCRP)-\d+/i;
const ISM_CONTROL_ID_PATTERN = /^ISM-\d+/i;

/**
 * @param {Object} control
 * @returns {boolean}
 */
export function isIsmPrinciple(control) {
  if (!control) return false;

  const id = String(control.id || '').trim();
  const cls = String(control.class || '').toLowerCase();
  const groupTitle = String(control.groupTitle || '').toLowerCase();

  if (cls.includes('principle')) {
    return true;
  }
  if (groupTitle.includes('principle') && !groupTitle.includes('control')) {
    return true;
  }
  if (PRINCIPLE_ID_PATTERN.test(id)) {
    return true;
  }
  if (ISM_CONTROL_ID_PATTERN.test(id)) {
    return false;
  }

  // ISM function-style IDs without ISM- prefix (e.g. GOV-01)
  if (/^[A-Z]{2,10}-\d+$/i.test(id) && !id.toUpperCase().startsWith('ISM-')) {
    return true;
  }

  return false;
}

/**
 * @param {Array<Object>} controls
 * @returns {{ principles: Array<Object>, controls: Array<Object> }}
 */
export function splitPrinciplesAndControls(controls) {
  const principles = [];
  const ismControls = [];

  for (const control of controls || []) {
    if (isIsmPrinciple(control)) {
      principles.push(control);
    } else {
      ismControls.push(control);
    }
  }

  return { principles, controls: ismControls };
}
