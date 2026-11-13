/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';

export default function GuardianApply() {
  const { getAuthConfig } = useAuth();
  const [status, setStatus] = useState(null);
  const [targetId, setTargetId] = useState('');
  const [document, setDocument] = useState(null);
  const [fileName, setFileName] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState('');
  const selection = useRef(0);

  useEffect(() => {
    const controller = new window.AbortController();
    axios.get('/api/guardian/status', { ...getAuthConfig(), signal: controller.signal })
      .then(({ data }) => { setStatus(data); setTargetId(''); setConfirmed(false); })
      .catch(() => {
        if (!controller.signal.aborted) { setStatus({ ready: false, message: 'Guardian status could not be loaded.' }); }
      });
    return () => controller.abort();
  }, [getAuthConfig]);

  async function selectFile(event) {
    const id = ++selection.current;
    setDocument(null);
    setConfirmed(false);
    setSubmitted(false);
    setMessage('');
    const file = event.target.files?.[0];
    setFileName(file?.name || '');
    if (!file) { return; }
    if (file.size > 2 * 1024 * 1024) {
      setMessage('Select an SSP JSON file no larger than 2 MiB.');
      return;
    }
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed?.['system-security-plan'] || Array.isArray(parsed)) { throw new Error('Invalid document'); }
      if (id === selection.current) { setDocument(parsed); }
    } catch {
      if (id === selection.current) { setMessage('Select a valid OSCAL system-security-plan JSON file.'); }
    }
  }

  async function apply(event) {
    event.preventDefault();
    if (!document || !targetId || !confirmed || busy || submitted || !status?.ready) { return; }
    setBusy(true);
    setSubmitted(true);
    setMessage('');
    try {
      const { data } = await axios.post('/api/guardian/apply', {
        targetId, ssp: document, confirmed: true,
      }, { ...getAuthConfig(), timeout: 30000 });
      setMessage(`${data.message} Reference: ${data.operationId}`);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Result unconfirmed. Check Guardian before retrying.');
    } finally {
      setBusy(false);
      setConfirmed(false);
    }
  }

  const target = status?.targets?.find(item => item.id === targetId);
  return (
    <section className="validation-section" aria-labelledby="guardian-apply-heading">
      <h4 id="guardian-apply-heading">Apply SSP to Guardian</h4>
      {!status && <p role="status">Checking Guardian access…</p>}
      {status && !status.ready && <p role="status">{status.message}</p>}
      {status?.ready && status.targets.length === 0 && <p>No Guardian targets are authorized for your account.</p>}
      {status?.ready && status.targets.length > 0 && (
        <form onSubmit={apply}>
          <p>Export your SSP first, then upload that document here. Guardian independently checks permission and validates the request.</p>
          <label htmlFor="guardian-target">Guardian target</label>
          <select id="guardian-target" className="form-control" value={targetId} disabled={busy}
            onChange={event => { setTargetId(event.target.value); setConfirmed(false); setSubmitted(false); setMessage(''); }}>
            <option value="">Select an authorized target</option>
            {status.targets.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <label htmlFor="guardian-ssp-file">OSCAL SSP JSON (maximum 2 MiB)</label>
          <input id="guardian-ssp-file" type="file" accept=".json,application/json" onChange={selectFile} disabled={busy} />
          {document && <p>Selected: {fileName}. Document UUID: {String(document['system-security-plan'].uuid || 'missing')}. Target: {target?.label || 'not selected'}.</p>}
          <label className="checkbox-label">
            <input type="checkbox" checked={confirmed} disabled={!document || !targetId || busy || submitted}
              onChange={event => setConfirmed(event.target.checked)} />
            I reviewed this SSP and target and authorize this write. I will check Guardian before retrying an unconfirmed request.
          </label>
          <button type="submit" className="btn btn-primary" disabled={!confirmed || busy || submitted || !document || !targetId}>
            {busy ? 'Submitting to Guardian…' : 'Confirm and apply SSP'}
          </button>
        </form>
      )}
      {message && <p role="status" aria-live="polite">{message}</p>}
    </section>
  );
}