/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
const ALLOWED_STATUSES = new Set([
  'Effective',
  'Ineffective',
  'Partially Effective',
  'Not Implemented',
  'Not Assessed',
  'Not Applicable',
]);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stringArray(value, name) {
  if (value === undefined) { return []; }
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`Guardian ${name} is invalid.`);
  }
  return value;
}

function controlRequirements(ssp) {
  const requirements = ssp?.['system-security-plan']?.['control-implementation']?.['implemented-requirements'];
  if (!Array.isArray(requirements)) { throw new Error('The selected SSP has no implemented requirements.'); }
  const controlIds = new Set();
  for (const requirement of requirements) {
    if (!isObject(requirement) || typeof requirement['control-id'] !== 'string' ||
      !requirement['control-id'].trim()) {
      throw new Error('The selected SSP contains an invalid control requirement.');
    }
    const key = requirement['control-id'].toLowerCase();
    if (controlIds.has(key)) { throw new Error(`The selected SSP contains duplicate control ${requirement['control-id']}.`); }
    controlIds.add(key);
    if (requirement.props !== undefined && (!Array.isArray(requirement.props) ||
      requirement.props.some(prop => !isObject(prop) || typeof prop.name !== 'string'))) {
      throw new Error(`The selected SSP contains invalid properties for ${requirement['control-id']}.`);
    }
  }
  return requirements;
}

export function mapAssessmentToSsp(assessment, ssp) {
  if (!Array.isArray(assessment?.findings)) { throw new Error('Guardian findings are invalid.'); }
  const requirements = controlRequirements(ssp);
  const byControl = new Map();
  for (const finding of assessment.findings) {
    if (!isObject(finding) || typeof finding['control-id'] !== 'string' || !finding['control-id'].trim()) {
      throw new Error('Guardian finding control identity is invalid.');
    }
    const key = finding['control-id'].toLowerCase();
    if (byControl.has(key)) { throw new Error(`Duplicate Guardian finding for ${finding['control-id']}.`); }
    byControl.set(key, finding);
  }

  const matched = new Set();
  const controls = requirements.map(requirement => {
    const controlId = requirement['control-id'];
    const finding = byControl.get(controlId.toLowerCase()) || null;
    if (finding) { matched.add(controlId.toLowerCase()); }
    return {
      controlId,
      existingStatus: requirement.props?.find(prop => prop.name === 'implementation-status')?.value || null,
      finding,
    };
  });
  const unmapped = assessment.findings.filter(finding => !matched.has(finding['control-id'].toLowerCase()));
  return { controls, unmapped };
}

export function validateAssessmentEnvelope(body, expected, ssp) {
  if (!isObject(body) || body.contractVersion !== '1' || !isObject(body.assessment)) {
    throw new Error('Guardian returned an unsupported assessment contract.');
  }
  const assessment = body.assessment;
  if (assessment.tentacle !== expected.provider || assessment['run-id'] !== expected.runId ||
    assessment['target-id'] !== expected.targetId) {
    throw new Error('Guardian assessment identity does not match the selected run and target.');
  }
  if (!Array.isArray(assessment.findings)) { throw new Error('Guardian findings are invalid.'); }
  for (const finding of assessment.findings) {
    if (!isObject(finding) || typeof finding['control-id'] !== 'string' || !finding['control-id'].trim() ||
      typeof finding.status !== 'string' || !finding.status.trim() ||
      (finding.title !== undefined && typeof finding.title !== 'string')) {
      throw new Error('Guardian finding is invalid.');
    }
    stringArray(finding.remarks, 'remarks');
    stringArray(finding.evidence, 'evidence');
    stringArray(finding.cloudflareCapabilities, 'capabilities');
  }

  const sspUuid = ssp?.['system-security-plan']?.uuid;
  const assessmentSspUuid = assessment['ssp-uuid'];
  if (assessmentSspUuid && sspUuid && assessmentSspUuid !== sspUuid) {
    throw new Error('Guardian assessment is linked to a different SSP.');
  }

  const mapped = mapAssessmentToSsp(assessment, ssp);
  const snapshot = assessment['snapshot-meta'];
  const reliable = isObject(snapshot) && snapshot.truncated === false && snapshot.evaluationReliable === true;
  const identityLinked = typeof assessmentSspUuid === 'string' && assessmentSspUuid.length > 0 &&
    assessmentSspUuid === sspUuid;
  const unknownStatuses = assessment.findings.filter(finding => !ALLOWED_STATUSES.has(finding.status));
  return {
    assessment,
    ...mapped,
    reliable,
    identityLinked,
    unknownStatuses,
    canPreview: assessment.findings.length > 0 && reliable && identityLinked &&
      unknownStatuses.length === 0 && mapped.unmapped.length === 0,
  };
}

export async function sha256Json(value) {
  if (!globalThis.crypto?.subtle) { throw new Error('SHA-256 is unavailable in this browser.'); }
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function assertPreviewMatchesCurrentDocument(preview, currentSsp, now = Date.now()) {
  if (!isObject(preview) || typeof preview.inputHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(preview.inputHash) || !Number.isFinite(Date.parse(preview.expiresAt)) ||
    Date.parse(preview.expiresAt) <= now) {
    throw new Error('Guardian preview is invalid or expired. Create a new preview.');
  }
  if (await sha256Json(currentSsp) !== preview.inputHash) {
    throw new Error('The SSP changed after preview. Review the current document and create a new preview.');
  }
}

export async function validatePreviewResponse(body, currentSsp) {
  if (!isObject(body) || body.contractVersion !== '1' ||
    typeof body.previewId !== 'string' || !body.previewId ||
    !/^[a-f0-9]{64}$/.test(body.inputHash || '') ||
    !/^[a-f0-9]{64}$/.test(body.outputHash || '') ||
    !Number.isInteger(body.updated) || body.updated < 0 ||
    !Array.isArray(body.changes) || body.changes.some(change =>
      !isObject(change) || typeof change.controlId !== 'string' ||
      !Array.isArray(change.before) || !Array.isArray(change.after) ||
      [...change.before, ...change.after].some(prop =>
        !isObject(prop) || typeof prop.name !== 'string' || typeof prop.value !== 'string')) ||
    !Number.isFinite(Date.parse(body.expiresAt)) || Date.parse(body.expiresAt) <= Date.now()) {
    throw new Error('Guardian returned an invalid preview.');
  }
  if (await sha256Json(currentSsp) !== body.inputHash) {
    throw new Error('The preview does not match the selected SSP. Create a new preview.');
  }
  return body;
}

export async function validateAppliedDocument(body, preview) {
  if (!isObject(body) || body.contractVersion !== '1' || !isObject(body.ssp) ||
    typeof body.outputHash !== 'string' || body.outputHash !== preview.outputHash ||
    await sha256Json(body.ssp) !== preview.outputHash) {
    throw new Error('Guardian returned an invalid new SSP revision.');
  }
  return body.ssp;
}
