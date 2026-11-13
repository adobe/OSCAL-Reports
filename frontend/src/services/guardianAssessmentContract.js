/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { sha256Json, validateAssessmentEnvelope } from './guardianLocalContract.js';

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const integrityNamespace = 'https://oscal-report-generator.adobe.com/ns/integrity';
const integrityProperty = prop => prop.ns === integrityNamespace &&
  ['file-integrity-hash', 'file-integrity-timestamp'].includes(prop.name);
const validProps = props => Array.isArray(props) && props.every(prop => prop &&
  typeof prop.name === 'string' && typeof prop.value === 'string' &&
  (prop.ns === undefined || typeof prop.ns === 'string'));

export function projectGuardianReport(source, assessment) {
  const full = source?.['system-security-plan'];
  const findings = assessment.tentacle === 'okta'
    ? assessment.findings.filter(finding => finding.excludedFromOktaProbe !== true &&
      ['core_okta', 'partial_okta'].includes(finding.oktaApplicabilityTier))
    : assessment.findings;
  const ids = new Set(findings.map(finding => finding['control-id'].toLowerCase()));
  const requirements = full?.['control-implementation']?.['implemented-requirements'];
  if (!Array.isArray(requirements) || !findings.length) { throw new Error('No eligible Guardian findings are available for this report.'); }
  const matched = requirements.filter(row => ids.has(row['control-id'].toLowerCase()));
  if (matched.length !== ids.size) { throw new Error('Eligible Guardian findings do not uniquely map to this report.'); }
  return { 'system-security-plan': {
    uuid: full.uuid,
    metadata: { props: full.metadata?.props || [] },
    'control-implementation': { 'implemented-requirements': matched.map(row => ({
      'control-id': row['control-id'], ...(row.props ? { props: row.props } : {}),
    })) },
  } };
}

export async function validateGuardianPatch(body, source, assessment, assessmentHash) {
  const projection = projectGuardianReport(source, assessment);
  if (body?.contractVersion !== '1' || body.assessmentHash !== assessmentHash ||
    !digest(body.inputHash) || !digest(body.outputHash) ||
    await sha256Json(projection) !== body.inputHash || !Number.isInteger(body.updated) || body.updated <= 0 ||
    !Array.isArray(body.changes) || body.changes.length !== body.updated ||
    !validProps(body.metadataProps?.before) || !validProps(body.metadataProps?.after) ||
    !same(body.metadataProps.before, projection['system-security-plan'].metadata.props) ||
    body.metadataLastModified?.before !== null ||
    !Number.isFinite(Date.parse(body.metadataLastModified?.after))) {
    throw new Error('Guardian patch does not match the retained source and assessment.');
  }
  const projectedOutput = globalThis.structuredClone(projection);
  const projectedRows = projectedOutput['system-security-plan']['control-implementation']['implemented-requirements'];
  const byId = new Map(projectedRows.map(row => [row['control-id'].toLowerCase(), row]));
  const used = new Set();
  for (const change of body.changes) {
    const id = typeof change?.controlId === 'string' ? change.controlId.toLowerCase() : '';
    const row = byId.get(id);
    if (!row || used.has(id) || !validProps(change.after) || !same(change.before, row.props || [])) {
      throw new Error('Guardian patch contains an unknown, duplicate or unreviewed control change.');
    }
    row.props = change.after;
    used.add(id);
  }
  const mutableMetadata = prop => integrityProperty(prop) ||
    prop.ns?.startsWith('https://guardian.keekar.au/ns/') || prop.name === 'guardian-findings-merge';
  if (!same(body.metadataProps.before.filter(prop => !mutableMetadata(prop)),
    body.metadataProps.after.filter(prop => !mutableMetadata(prop)))) {
    throw new Error('Guardian patch changed unrelated report metadata.');
  }
  projectedOutput['system-security-plan'].metadata.props = body.metadataProps.after;
  projectedOutput['system-security-plan'].metadata['last-modified'] = body.metadataLastModified.after;
  if (await sha256Json(projectedOutput) !== body.outputHash) { throw new Error('Guardian patch output hash is invalid.'); }
  const ssp = globalThis.structuredClone(source);
  const changes = new Map(body.changes.map(change => [change.controlId.toLowerCase(), change.after]));
  for (const row of ssp['system-security-plan']['control-implementation']['implemented-requirements']) {
    const props = changes.get(row['control-id'].toLowerCase());
    if (props) { row.props = globalThis.structuredClone(props); }
  }
  ssp['system-security-plan'].metadata.props = globalThis.structuredClone(body.metadataProps.after);
  ssp['system-security-plan'].metadata['last-modified'] = body.metadataLastModified.after;
  return { ...body, ssp, sourceHash: await sha256Json(source) };
}

export async function validateFinalizedGuardianRevision(body, candidate) {
  const withoutIntegrity = document => {
    const copy = globalThis.structuredClone(document);
    copy['system-security-plan'].metadata.props = copy['system-security-plan'].metadata.props
      .filter(prop => !integrityProperty(prop));
    return copy;
  };
  if (!body?.ssp?.['system-security-plan'] || !digest(body.documentHash) ||
    await sha256Json(body.ssp) !== body.documentHash || !same(withoutIntegrity(candidate), withoutIntegrity(body.ssp))) {
    throw new Error('Guardian revision finalization changed unreviewed report content.');
  }
  return body.ssp;
}

export async function validateGuardianAssessment(body, selection, ssp) {
  const result = validateAssessmentEnvelope(body, selection, ssp);
  if (!digest(body.assessmentHash) || await sha256Json(body.assessment) !== body.assessmentHash ||
    !body.oscal?.['assessment-results']) {
    throw new Error('Guardian assessment hash or OSCAL assessment-results export is invalid.');
  }
  return { ...result, reliable: assessmentIsReliable(body.assessment), assessmentHash: body.assessmentHash, oscal: body.oscal };
}

// Same rule Guardian enforces when serving an assessment: coverage must be explicitly complete (truncated === false)
// and never flagged unreliable. Production run files carry no evaluationReliable field, so absence is accepted;
// recorded probe errors or zones scanned short of the zones total are not.
function assessmentIsReliable(assessment) {
  const meta = assessment?.['snapshot-meta'];
  return Boolean(meta && typeof meta === 'object' && meta.truncated === false && meta.evaluationReliable !== false &&
    (meta.errorCount === undefined || meta.errorCount === 0) &&
    (meta.zonesScanned === undefined || meta.zonesScanned === meta.zonesTotal));
}

export async function validateGuardianPreview(body, source, assessmentHash) {
  if (body?.contractVersion !== '1' || !digest(body.inputHash) || !digest(body.outputHash) ||
    body.assessmentHash !== assessmentHash || !Number.isInteger(body.updated) || body.updated <= 0 ||
    !Array.isArray(body.changes) || body.changes.length !== body.updated ||
    !body.ssp?.['system-security-plan'] ||
    await sha256Json(source) !== body.inputHash || await sha256Json(body.ssp) !== body.outputHash) {
    throw new Error('Guardian preview does not match the selected report and assessment.');
  }
  const before = source['system-security-plan'];
  const after = body.ssp['system-security-plan'];
  const beforeRows = before['control-implementation']?.['implemented-requirements'];
  const afterRows = after['control-implementation']?.['implemented-requirements'];
  if (!Array.isArray(beforeRows) || !Array.isArray(afterRows) || beforeRows.length !== afterRows.length) {
    throw new Error('Guardian preview changed the report control set.');
  }
  const changes = new Map();
  for (const change of body.changes) {
    if (typeof change?.controlId !== 'string' || changes.has(change.controlId.toLowerCase()) ||
      !Array.isArray(change.before) || !Array.isArray(change.after)) {
      throw new Error('Guardian preview contains invalid or duplicate changes.');
    }
    changes.set(change.controlId.toLowerCase(), change);
  }
  for (let index = 0; index < beforeRows.length; index++) {
    const { props: beforeProps = [], ...beforeOther } = beforeRows[index];
    const { props: afterProps = [], ...afterOther } = afterRows[index];
    const change = changes.get(String(beforeOther['control-id']).toLowerCase());
    if (!same(beforeOther, afterOther) || (change
      ? !same(change.before, beforeProps) || !same(change.after, afterProps)
      : !same(beforeProps, afterProps))) {
      throw new Error('Guardian preview changed a narrative, unrelated control, or unreviewed property.');
    }
    if (change) { changes.delete(String(beforeOther['control-id']).toLowerCase()); }
  }
  if (changes.size) { throw new Error('Guardian preview contains a control outside the selected report.'); }
  const { metadata: oldMetadata, 'control-implementation': oldImplementation, ...oldOther } = before;
  const { metadata: newMetadata, 'control-implementation': newImplementation, ...newOther } = after;
  const { 'implemented-requirements': _oldRows, ...oldImplementationOther } = oldImplementation;
  const { 'implemented-requirements': _newRows, ...newImplementationOther } = newImplementation;
  const { props: _oldProps, 'last-modified': _oldModified, ...oldMetadataOther } = oldMetadata || {};
  const { props: _newProps, 'last-modified': _newModified, ...newMetadataOther } = newMetadata || {};
  const { 'system-security-plan': _sourcePlan, ...sourceOther } = source;
  const { 'system-security-plan': _outputPlan, ...outputOther } = body.ssp;
  if (!same(oldOther, newOther) || !same(oldImplementationOther, newImplementationOther) ||
    !same(oldMetadataOther, newMetadataOther) || !same(sourceOther, outputOther)) {
    throw new Error('Guardian preview changed report identity or unrelated document fields.');
  }
  return body;
}
