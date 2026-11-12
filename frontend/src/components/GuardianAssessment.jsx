/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { useEffect, useRef, useState } from 'react';
import axios from '../utils/safeAxios.js';
import { useAuth } from '../contexts/AuthContext';
import { sha256Json } from '../services/guardianLocalContract.js';
import { projectGuardianReport, validateGuardianAssessment, validateGuardianPatch,
  validateFinalizedGuardianRevision } from '../services/guardianAssessmentContract.js';
import { loadGuardianRevision, saveGuardianRevision, guardianDownloadName } from '../utils/guardianRevisions.js';
import { downloadJsonFile } from '../utils/exportSsp.js';
import './GuardianAssessment.css';

const MAX_FILE_BYTES = 16 * 1024 * 1024;
const errorMessage = error => error.response?.data?.error || error.message || 'Guardian request failed.';

// Same locations the report generator reads when it loads an SSP.
const systemId = report => {
  const first = report['system-security-plan']['system-characteristics']?.['system-ids']?.[0];
  return first?.id || first?.identifier || '';
};
const systemName = report => report['system-security-plan']['system-characteristics']?.['system-name'] || '';

export default function GuardianAssessment({ initialReport = null, initialFileName = '', onAdopt, onBack,
  adoptLabel = 'Use saved revision in report editor', backLabel = 'Back to report workflow' }) {
  const { user, getAuthConfig } = useAuth();
  // `original` is the report exactly as loaded; `report` is the working copy that provider results are added to.
  const [original, setOriginal] = useState(initialReport);
  const [report, setReport] = useState(initialReport);
  const [loadedHash, setLoadedHash] = useState('');
  const [fileName, setFileName] = useState(initialFileName);
  const [status, setStatus] = useState(null);
  const [targetKey, setTargetKey] = useState('');
  const [runs, setRuns] = useState([]);
  const [nextToken, setNextToken] = useState(null);
  const [runId, setRunId] = useState('');
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [bindUnlinked, setBindUnlinked] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [privilegedAck, setPrivilegedAck] = useState(false);
  const [saved, setSaved] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const generation = useRef(0);
  const adoptedFor = useRef('');
  const scrollToSaved = useRef(false);
  const savedRef = useRef(null);
  const target = status?.targets?.find(item => `${item.provider}/${item.targetId}` === targetKey);
  const selection = target && { provider: target.provider, targetId: target.targetId, runId };
  // The saved revision belongs to this report when it was built on it, or is the file that was loaded.
  const continuing = Boolean(saved && (report === saved.ssp ||
    (report === original && loadedHash && loadedHash === saved.revisionHash)));
  const savedMatchesLoaded = Boolean(saved && (continuing ||
    (loadedHash && (loadedHash === saved.sourceHash || loadedHash === saved.revisionHash))));
  const appliedSoFar = continuing ? saved.applied || [] : [];

  useEffect(() => {
    const controller = new window.AbortController();
    axios.get('/api/guardian/assessments/status', { ...getAuthConfig(), signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) { setStatus(data); } })
      .catch(error => {
        if (!controller.signal.aborted) { setStatus({ ready: false, message: errorMessage(error) }); }
      });
    return () => { controller.abort(); generation.current++; };
  }, [getAuthConfig]);

  useEffect(() => {
    let active = true;
    loadGuardianRevision(user?.id)
      .then(revision => { if (active) { setSaved(revision); } })
      .catch(error => { if (active) { setMessage(error.message); } });
    return () => { active = false; };
  }, [user?.id]);

  useEffect(() => {
    let active = true;
    setLoadedHash('');
    if (original) { sha256Json(original).then(hash => { if (active) { setLoadedHash(hash); } }); }
    return () => { active = false; };
  }, [original]);

  // Open on top of the revision already saved for this report so a later provider adds to it.
  useEffect(() => {
    if (saved && loadedHash && loadedHash === saved.sourceHash && report === original && adoptedFor.current !== loadedHash) {
      adoptedFor.current = loadedHash;
      setReport(saved.ssp);
      setMessage('Continuing from the revision already saved for this report. New provider results are added to it.');
    }
  }, [saved, loadedHash, report, original]);

  useEffect(() => {
    if (scrollToSaved.current && savedRef.current) {
      scrollToSaved.current = false;
      savedRef.current.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }
  }, [saved]);

  function invalidate() {
    generation.current++;
    setResult(null);
    setPreview(null);
    setBindUnlinked(false);
    setConfirmed(false);
    setPrivilegedAck(false);
    setMessage('');
  }

  async function perform(action) {
    const id = generation.current;
    setBusy(true);
    setMessage('');
    try {
      await action(() => generation.current === id);
    } catch (error) {
      if (generation.current === id) { setMessage(errorMessage(error)); }
    } finally {
      if (generation.current === id) { setBusy(false); }
    }
  }

  async function selectFile(event) {
    const file = event.target.files?.[0];
    if (!file) { return; }
    invalidate();
    setOriginal(null);
    setReport(null);
    setFileName(file.name);
    await perform(async current => {
      if (file.size > MAX_FILE_BYTES) { throw new Error('Select an SSP JSON file no larger than 16 MiB.'); }
      const document = JSON.parse(await file.text());
      const ssp = document?.['system-security-plan'];
      if (!ssp || typeof ssp.uuid !== 'string' ||
        !Array.isArray(ssp['control-implementation']?.['implemented-requirements'])) {
        throw new Error('Select an OSCAL system-security-plan with a UUID and implemented requirements.');
      }
      if (current()) { setOriginal(document); setReport(document); }
    });
  }

  async function loadRuns(append = false) {
    setPreview(null);
    setResult(null);
    setRunId('');
    setConfirmed(false);
    await perform(async current => {
      const { data } = await axios.get('/api/guardian/assessments/runs', {
        ...getAuthConfig(), params: { provider: target.provider, targetId: target.targetId,
          ...(append ? { nextToken } : {}) },
      });
      if (current()) {
        setRuns(previous => append ? [...previous, ...data.runs] : data.runs);
        setNextToken(data.nextToken);
        if (!data.runs.length) { setMessage('No per-control Guardian assessment runs are available for this target. Aggregate metrics cannot populate a report.'); }
      }
    });
  }

  async function fetchAssessment() {
    setPreview(null);
    setConfirmed(false);
    setResult(null);
    await perform(async current => {
      const { data } = await axios.get('/api/guardian/assessments/result', { ...getAuthConfig(), params: selection });
      const validated = await validateGuardianAssessment(data, selection, report);
      if (current()) { setResult(validated); }
    });
  }

  async function createPreview() {
    setPreview(null);
    setConfirmed(false);
    await perform(async current => {
      const { data } = await axios.post('/api/guardian/assessments/preview', {
        ...selection, ssp: projectGuardianReport(report, result.assessment), assessmentHash: result.assessmentHash,
        bindUnlinkedAssessment: bindUnlinked, returnPatch: true,
      }, { ...getAuthConfig(), timeout: 30000 });
      const validated = await validateGuardianPatch(data, report, result.assessment, result.assessmentHash);
      if (current()) { setPreview(validated); }
    });
  }

  async function confirmRevision() {
    await perform(async current => {
      if (!confirmed || !preview || await sha256Json(report) !== preview.sourceHash) {
        throw new Error('The selected report changed. Fetch and preview again before confirming.');
      }
      const validated = await validateGuardianPatch(preview, report, result.assessment, result.assessmentHash);
      const { data } = await axios.post('/api/guardian/assessments/finalize', { ssp: validated.ssp }, getAuthConfig());
      const finalized = await validateFinalizedGuardianRevision(data, validated.ssp);
      if (!current()) { throw new Error('The active report session changed. Review the report again before saving.'); }
      const savedAt = new Date().toISOString();
      const revision = {
        source: continuing ? saved.source : original, ssp: finalized, selection,
        assessmentHash: result.assessmentHash, savedAt, fileName: fileName || saved?.fileName || '',
        sourceHash: continuing ? saved.sourceHash : loadedHash || await sha256Json(original),
        revisionHash: await sha256Json(finalized),
        applied: [...appliedSoFar, { provider: selection.provider, targetId: selection.targetId, runId: selection.runId, savedAt }],
      };
      await saveGuardianRevision(user.id, revision);
      if (current()) {
        scrollToSaved.current = true;
        setSaved(revision);
        setReport(finalized);
        setResult(null);
        setPreview(null);
        setConfirmed(false);
        setMessage('New revision saved in this browser for your account. The source file and Guardian were not changed. ' +
          'Use "Continue with saved Guardian revision" below to open it, download it, or fetch another provider to add to it.');
      }
    });
  }

  return (
    <section className="guardian-assessment" aria-labelledby="guardian-assessment-title">
      <button type="button" className="btn btn-secondary" onClick={onBack} disabled={busy}>{backLabel}</button>
      <h2 id="guardian-assessment-title">Guardian Agent assessment</h2>
      <p>Fetch an existing real assessment, review proposed control changes, then explicitly save a new SSP revision.</p>
      {!initialReport && <p>Choose the current exported report if you have unsaved editor changes. Using a saved revision replaces the editor with that reviewed document.</p>}
      {!status && <p role="status">Checking Guardian assessment access...</p>}
      {status?.privileged && <div role="alert" className="guardian-privileged-warning">
        <strong>Privileged access.</strong> You are operating this function as a privileged user
        ({status.privileged.provider} group: {status.privileged.groups.join(', ')}). Every Guardian request is audit-logged
        with your identity. Make sure you are picking up the right report from the right Guardian target and run
        before you fetch or apply anything.
      </div>}
      {status && !status.ready && <>
        <p role="alert">{status.message}</p>
        {status.identity && <p>Detected sign-in: {status.identity.signedInWith}. Groups received from the identity provider:
          {' '}{status.identity.groups.length ? status.identity.groups.join(', ') : 'none'}.</p>}
        {import.meta.env.DEV && status.code === 'guardian_assessments_unavailable' && <p>
          Local testing: stop the running dev servers and start <code>npm run dev:local-guardian-e2e</code>, then sign in with
          Generic SSO as a member of the privileged group.
        </p>}
        <p>The target and run selectors below stay disabled until Guardian assessment access is configured on the backend and you are signed in through an approved path (Generic SSO as a privileged group member, or the approved Okta delegation).</p>
      </>}
      {!initialReport && <label>Selected OSCAL report (maximum 16 MiB)
        <input type="file" accept=".json,application/json" disabled={busy} onChange={selectFile} />
      </label>}
      {report && <p>{initialReport ? 'Using the report you just loaded: ' : 'Report: '}{report['system-security-plan'].metadata?.title || 'Selected SSP'}.<br />
        File Name: {fileName || 'not available'}, Controls: {report['system-security-plan']['control-implementation']['implemented-requirements'].length}.<br />
        UUID: {report['system-security-plan'].uuid}, System ID: {systemId(report) || 'not set'}, System Name: {systemName(report) || 'not set'}</p>}
      <fieldset disabled={busy || !status?.ready || !report}>
        <legend className="guardian-assessment-legend">Guardian assessment source</legend>
        <div className="guardian-assessment-fields">
          <label>Authorized target
            <select value={targetKey} onChange={event => {
              invalidate(); setTargetKey(event.target.value); setRuns([]); setRunId(''); setNextToken(null);
            }}>
              <option value="">Select a target</option>
              {status?.targets?.map(item => <option key={`${item.provider}/${item.targetId}`}
                value={`${item.provider}/${item.targetId}`}>{item.label} ({item.provider} / {item.targetId})</option>)}
            </select>
          </label>
          <label>Assessment run
            <select value={runId} onChange={event => { invalidate(); setRunId(event.target.value); }}>
              <option value="">Select an existing run</option>
              {runs.map(run => <option key={run.runId} value={run.runId}>{run.runId} - {run.generatedAt}</option>)}
            </select>
          </label>
        </div>
        {status?.ready && !status.targets.length && <p>No assessment targets are authorized for your account.</p>}
        {status?.privileged && target && runId && <label className="guardian-privileged-ack">
          <input type="checkbox" checked={privilegedAck} onChange={event => setPrivilegedAck(event.target.checked)} />
          {' '}I confirm report "{report?.['system-security-plan']?.metadata?.title || 'Selected SSP'}"
          (UUID {report?.['system-security-plan']?.uuid}) is the correct report for
          {' '}{target.label} ({target.provider} / {target.targetId}), run {runId}.
        </label>}
        <div className="guardian-assessment-actions">
          <button type="button" className="btn btn-primary" disabled={!target} onClick={() => loadRuns()}>Load assessment runs</button>
          {nextToken && <button type="button" className="btn btn-secondary" onClick={() => loadRuns(true)}>Load more runs</button>}
          <button type="button" className="btn btn-primary" disabled={!runId || (status?.privileged && !privilegedAck)} onClick={fetchAssessment}>Fetch Guardian assessment</button>
        </div>
      </fieldset>
      {result && (
        <section>
          <h3>Read-only control assessments</h3>
          <p>Unmatched controls retain their existing data. Fetching does not modify the SSP.</p>
          <button type="button" className="btn btn-secondary" onClick={() => downloadJsonFile(result.oscal, 'guardian-assessment-results.json')}>
            Download OSCAL assessment results
          </button>
          <div className="guardian-assessment-rows">
            {result.controls.filter(row => row.finding).map(({ controlId, existingStatus, finding }) => (
              <article key={controlId}>
                <h4>{controlId}: {finding.title}</h4>
                <p>Current: {existingStatus || 'not set'}; Guardian: <strong>{finding.status}</strong></p>
                {finding.remarks?.map((text, index) => <p key={`remark-${index}`}>{text}</p>)}
                {finding.evidence?.map((text, index) => <p key={`evidence-${index}`}>Evidence: {text}</p>)}
              </article>
            ))}
          </div>
          {result.unmapped.length > 0 && <p role="alert">{result.unmapped.length} Guardian findings are outside this report and cannot be populated.</p>}
          {!result.reliable && <p role="alert">Guardian has not affirmatively established complete, reliable assessment coverage. Preview is disabled.</p>}
          {result.unknownStatuses.length > 0 && <p role="alert">Unknown assessment statuses prevent preview.</p>}
          {!result.identityLinked && <label>
            <input type="checkbox" checked={bindUnlinked} disabled={busy} onChange={event => {
              setBindUnlinked(event.target.checked); setPreview(null); setConfirmed(false);
            }} />
            This assessment has no SSP linkage. I authorize linking this selected report to the displayed target, subject to Guardian account/org and existing-binding checks.
          </label>}
          <button type="button" className="btn btn-primary" onClick={createPreview}
            disabled={busy || !result.reliable || result.unknownStatuses.length > 0 ||
              !result.assessment.findings.length || (!result.identityLinked && !bindUnlinked)}>
            Preview control changes
          </button>
        </section>
      )}
      {preview && <section>
        <h3>Review {preview.updated} control changes</h3>
        <div className="guardian-assessment-rows">
          {preview.changes.map(change => <article key={change.controlId}>
            <h4>{change.controlId}</h4>
            <p>Before</p><pre>{JSON.stringify(change.before, null, 2)}</pre>
            <p>After</p><pre>{JSON.stringify(change.after, null, 2)}</pre>
          </article>)}
        </div>
        <label><input type="checkbox" checked={confirmed} disabled={busy}
          onChange={event => setConfirmed(event.target.checked)} />
          I reviewed these changes and authorize saving a new SSP revision. The source file will not be overwritten.
        </label>
        <button type="button" className="btn btn-primary" disabled={busy || !confirmed} onClick={confirmRevision}>
          Confirm and populate new report revision
        </button>
      </section>}
      {report && original && report !== original && <p>Working on a saved revision with the results below applied.
        <button type="button" className="btn btn-secondary" disabled={busy}
          onClick={() => { invalidate(); setReport(original); }}>Start again from the original report</button></p>}
      {saved && loadedHash && !savedMatchesLoaded && <p>A saved Guardian revision from {saved.savedAt} {saved.sourceHash
        ? 'belongs to a different report and is not used here.'
        : 'was saved by an earlier version and cannot be matched to this report, so it is not used here.'}</p>}
      {saved && savedMatchesLoaded && <section ref={savedRef}>
        <h3>Guardian revision for this report</h3>
        <p>Saved {saved.savedAt}. Stored locally in this browser for your account, not in Guardian or the shared database.</p>
        {(saved.applied || []).length > 0 && <>
          <p>Provider results applied so far:</p>
          <ul>{saved.applied.map(item => <li key={`${item.provider}/${item.targetId}/${item.runId}/${item.savedAt}`}>
            {item.provider} / {item.targetId}, run {item.runId}</li>)}</ul></>}
        <button type="button" className="btn btn-primary" disabled={busy}
          onClick={() => perform(async () => { await onAdopt(saved.ssp); })}>{adoptLabel}</button>
        <button type="button" className="btn btn-secondary"
          onClick={() => downloadJsonFile(saved.ssp, guardianDownloadName(saved.fileName || fileName))}>Download populated SSP</button>
        <button type="button" className="btn btn-secondary"
          onClick={() => downloadJsonFile(saved.source, 'guardian-original-ssp.json')}>Download unchanged source SSP</button>
      </section>}
      {busy && <p role="status">Working...</p>}
      {message && <p role="status" aria-live="polite">{message}</p>}
    </section>
  );
}
