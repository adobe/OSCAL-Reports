/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import React, { useEffect, useState } from 'react';
import { downloadJsonFile } from '../utils/exportSsp.js';
import {
  assertPreviewMatchesCurrentDocument,
  validateAppliedDocument,
  validateAssessmentEnvelope,
  validatePreviewResponse,
} from '../services/guardianLocalContract.js';
import './GuardianLocalIntegrationDemo.css';

const selection = Object.freeze({
  provider: 'cloudflare',
  runId: 'synthetic-run-001',
  targetId: 'SYNTHETIC_CF',
});

async function requestJson(path, options = {}) {
  const response = await fetch(`/api/local-guardian${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    signal: AbortSignal.timeout(10000),
  });
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error('Local Guardian demo returned invalid JSON.');
  }
  if (!response.ok) {
    const error = new Error(typeof body.message === 'string' ? body.message : 'Local Guardian request failed.');
    error.status = response.status;
    throw error;
  }
  return body;
}

function ResultRows({ result }) {
  if (!result) { return <p>Assessment results have not been loaded.</p>; }
  return (
    <div className="guardian-local-results">
      {result.controls.map(({ controlId, existingStatus, finding }) => (
        <article className="guardian-local-result" key={controlId}>
          <h3>{controlId}</h3>
          <p>Current SSP status: {existingStatus || 'not set'}</p>
          {finding ? (
            <>
              <p>Guardian assessment status: <strong>{finding.status}</strong></p>
              {finding.title && <p>{finding.title}</p>}
              {finding.remarks?.map((remark, index) => <p key={`remark-${index}`}>{remark}</p>)}
              {finding.evidence?.map((item, index) => <p key={`evidence-${index}`}>Evidence: {item}</p>)}
            </>
          ) : <p>No Guardian result for this control; the SSP value is unchanged.</p>}
        </article>
      ))}
      {result.unmapped.map(finding => (
        <article className="guardian-local-result guardian-local-warning" key={`unmapped-${finding['control-id']}`}>
          <h3>{finding['control-id']}</h3>
          <p>Guardian finding is not present in the selected SSP; it cannot be applied.</p>
          <p>Assessment status: {finding.status}</p>
        </article>
      ))}
      {!result.reliable && <p className="guardian-local-warning" role="alert">Coverage is incomplete or reliability was not affirmatively established. Applying is disabled.</p>}
      {!result.identityLinked && <p className="guardian-local-warning" role="alert">Guardian did not verify linkage to this SSP UUID. Applying is disabled.</p>}
      {result.assessment.findings.length === 0 && (
        <p className="guardian-local-warning" role="alert">Guardian returned no findings; no status is inferred and applying is disabled.</p>
      )}
      {result.unknownStatuses.map(finding => (
        <p className="guardian-local-warning" role="alert" key={`unknown-${finding['control-id']}`}>
          Unknown Guardian status for {finding['control-id']}: {finding.status}. Applying is disabled.
        </p>
      ))}
    </div>
  );
}

export default function GuardianLocalIntegrationDemo() {
  const [sourceSsp, setSourceSsp] = useState(null);
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [appliedSsp, setAppliedSsp] = useState(null);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Loading synthetic SSP fixture…');
  const currentSsp = sourceSsp;

  useEffect(() => {
    let active = true;
    requestJson('/fixture')
      .then(({ ssp }) => {
        if (!ssp || !active) { return; }
        setSourceSsp(ssp);
        setMessage('Synthetic SSP loaded. Select “Load existing assessment” to inspect results.');
      })
      .catch(error => { if (active) { setMessage(error.message); } });
    return () => { active = false; };
  }, []);

  async function loadAssessment() {
    setBusy(true);
    setMessage('');
    setPreview(null);
    setConfirmed(false);
    try {
      const path = `/assessments/${selection.provider}/${selection.runId}/${selection.targetId}`;
      const body = await requestJson(path);
      setResult(validateAssessmentEnvelope(body, selection, currentSsp));
      setMessage('Assessment loaded as a read-only view. SSP controls were not changed.');
    } catch (error) {
      setResult(null);
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function createPreview() {
    if (!currentSsp || !result?.canPreview || busy || outcomeUnknown) { return; }
    setBusy(true);
    setMessage('');
    setAppliedSsp(null);
    setConfirmed(false);
    try {
      const currentResult = validateAssessmentEnvelope({
        contractVersion: '1',
        assessment: result.assessment,
      }, selection, currentSsp);
      if (!currentResult.canPreview) {
        throw new Error('Current SSP linkage or assessment coverage is not eligible for preview.');
      }
      const body = await requestJson('/ssp/preview', {
        method: 'POST',
        body: JSON.stringify({ ...selection, ssp: currentSsp }),
      });
      setPreview(await validatePreviewResponse(body, currentSsp));
      setMessage('Review the proposed changes. Nothing has been applied yet.');
    } catch (error) {
      setPreview(null);
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  function simulateSourceEdit() {
    if (!currentSsp || !preview) { return; }
    const edited = structuredClone(currentSsp);
    const firstRequirement = edited['system-security-plan']['control-implementation']['implemented-requirements'][0];
    firstRequirement.description = 'Synthetic edit after preview.';
    setSourceSsp(edited);
    setConfirmed(false);
    setMessage('Synthetic source edit made. Applying the previous preview must now be rejected.');
  }

  async function applyPreview() {
    if (!preview || !confirmed || busy || !currentSsp) { return; }
    setBusy(true);
    setMessage('');
    let applySent = false;
    try {
      await assertPreviewMatchesCurrentDocument(preview, currentSsp);
      applySent = true;
      const body = await requestJson('/ssp/apply', {
        method: 'POST',
        body: JSON.stringify({
          previewId: preview.previewId,
          inputHash: preview.inputHash,
          outputHash: preview.outputHash,
        }),
      });
      const newSsp = await validateAppliedDocument(body, preview);
      setAppliedSsp(newSsp);
      setOutcomeUnknown(false);
      setPreview(null);
      setConfirmed(false);
      setMessage('A new SSP revision is ready. The source document remains unchanged.');
    } catch (error) {
      if (applySent && (!Number.isInteger(error.status) || error.status >= 500)) {
        setOutcomeUnknown(true);
      }
      setPreview(null);
      setConfirmed(false);
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="guardian-local-demo">
      <header>
        <h1>OSCAL ↔ Guardian local integration</h1>
        <p className="guardian-local-warning">
          Synthetic laptop-only demonstration. Not an AWS API Gateway, production provider, or real OAuth flow.
        </p>
        <p>Selected existing run: {selection.provider} / {selection.runId} / {selection.targetId}</p>
      </header>

      <section aria-labelledby="guardian-local-assessment-heading">
        <h2 id="guardian-local-assessment-heading">Read-only assessment results</h2>
        <p>Results are displayed separately. Unknown, incomplete, unlinked, or unmapped data is never treated as a pass.</p>
        <button type="button" className="btn btn-primary" onClick={loadAssessment} disabled={busy || !currentSsp}>
          Load existing assessment
        </button>
        <ResultRows result={result} />
      </section>

      <section aria-labelledby="guardian-local-ssp-heading">
        <h2 id="guardian-local-ssp-heading">Synthetic source SSP</h2>
        <p>This view contains only the provider’s synthetic fixture.</p>
        <pre className="guardian-local-source">{JSON.stringify(currentSsp, null, 2)}</pre>
        <button type="button" className="btn btn-secondary" onClick={simulateSourceEdit}
          disabled={!preview || busy}>
          Simulate source edit after preview
        </button>
      </section>

      <section aria-labelledby="guardian-local-preview-heading">
        <h2 id="guardian-local-preview-heading">Preview and explicitly apply to a new SSP copy</h2>
        <button type="button" className="btn btn-primary" onClick={createPreview}
          disabled={busy || outcomeUnknown || !currentSsp || !result?.canPreview}>
          Preview changes
        </button>
        {preview && (
          <div className="guardian-local-preview">
            <p>Preview expires: {preview.expiresAt}</p>
            <p>Matched controls changed: {preview.changes.length}</p>
            {preview.changes.map(change => (
              <article key={change.controlId}>
                <h3>{change.controlId}</h3>
                <p>Before: <code>{JSON.stringify(change.before)}</code></p>
                <p>After: <code>{JSON.stringify(change.after)}</code></p>
              </article>
            ))}
            <label>
              <input type="checkbox" checked={confirmed} disabled={busy}
                onChange={event => setConfirmed(event.target.checked)} />
              I reviewed the preview and authorize creating a new SSP copy. The source will not be overwritten.
            </label>
            <button type="button" className="btn btn-primary" onClick={applyPreview}
              disabled={busy || !confirmed}>
              Confirm and create new SSP revision
            </button>
          </div>
        )}
        {appliedSsp && (
          <button type="button" className="btn btn-primary"
            onClick={() => downloadJsonFile(appliedSsp, 'guardian-local-new-ssp-revision.json')}>
            Download new SSP revision
          </button>
        )}
      </section>
      {outcomeUnknown && (
        <p className="guardian-local-warning" role="alert">
          The apply response was not conclusive. Do not retry this operation; reload the local demo to begin a fresh synthetic run.
        </p>
      )}
      {message && <p role="status" aria-live="polite">{message}</p>}
    </main>
  );
}
