/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { afterEach, describe, expect, it } from '@jest/globals';
import { startLocalGuardianDemo } from '../../../scripts/local-guardian-oscal-demo.mjs';
import {
  assertPreviewMatchesCurrentDocument,
  validateAppliedDocument,
  validateAssessmentEnvelope,
  validatePreviewResponse,
} from '../../../frontend/src/services/guardianLocalContract.js';

let demo;

afterEach(async () => {
  if (demo) {
    await demo.close();
    demo = null;
  }
});

async function get(path, options) {
  return fetch(`${demo.baseUrl}${path}`, options);
}

async function json(response) {
  return response.json();
}

const selectedRun = {
  provider: 'cloudflare',
  runId: 'synthetic-run-001',
  targetId: 'SYNTHETIC_CF',
};

describe('local OSCAL ↔ Guardian integration', () => {
  it('loads only synthetic fixture data and returns a read-only assessment view', async () => {
    demo = await startLocalGuardianDemo({ port: 0 });
    const fixtureResponse = await get('/api/local-guardian/fixture');
    expect(fixtureResponse.status).toBe(200);
    expect(fixtureResponse.headers.get('cache-control')).toBe('no-store');
    const { ssp } = await json(fixtureResponse);

    const response = await get('/api/local-guardian/assessments/cloudflare/synthetic-run-001/SYNTHETIC_CF');
    expect(response.status).toBe(200);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    const body = await json(response);
    const result = validateAssessmentEnvelope(body, selectedRun, ssp);

    expect(result.canPreview).toBe(true);
    expect(result.controls.map(row => row.finding?.status || null)).toEqual([
      'Effective',
      'Ineffective',
      null,
    ]);
    expect(result.unmapped).toEqual([]);
    expect(JSON.stringify(body)).not.toContain('synthetic-access');
    expect(JSON.stringify(body)).not.toContain('Authorization');
    expect(JSON.stringify(body)).not.toContain('tokenForTest');
  });

  it('requires preview, checks the current document hash, and creates a separate new SSP', async () => {
    demo = await startLocalGuardianDemo({ port: 0 });
    const { ssp: sourceSsp } = await json(await get('/api/local-guardian/fixture'));
    const original = JSON.stringify(sourceSsp);
    const previewResponse = await get('/api/local-guardian/ssp/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...selectedRun, ssp: sourceSsp }),
    });
    expect(previewResponse.status).toBe(200);
    const preview = await validatePreviewResponse(await json(previewResponse), sourceSsp);

    const editedSsp = structuredClone(sourceSsp);
    editedSsp['system-security-plan']['control-implementation']['implemented-requirements'][0].description =
      'Synthetic edit after preview.';
    await expect(assertPreviewMatchesCurrentDocument(preview, editedSsp))
      .rejects.toThrow('The SSP changed after preview.');
    await assertPreviewMatchesCurrentDocument(preview, sourceSsp);

    const applyResponse = await get('/api/local-guardian/ssp/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        previewId: preview.previewId,
        inputHash: preview.inputHash,
        outputHash: preview.outputHash,
      }),
    });
    expect(applyResponse.status).toBe(200);
    const newSsp = await validateAppliedDocument(await json(applyResponse), preview);
    const requirements = newSsp['system-security-plan']['control-implementation']['implemented-requirements'];

    expect(JSON.stringify(sourceSsp)).toBe(original);
    expect(requirements[0].description).toBe('Synthetic user narrative: preserve.');
    expect(requirements[0].props.find(prop => prop.name === 'implementation-status').value).toBe('effective');
    expect(requirements[1].props.find(prop => prop.name === 'implementation-status').value).toBe('ineffective');
    expect(requirements[2].description).toBe('Synthetic unmapped narrative: preserve.');
    expect(requirements[2].props.find(prop => prop.name === 'implementation-status').value).toBe('effective');
  });

  it('rejects wrong selectors and non-local browser origins', async () => {
    demo = await startLocalGuardianDemo({ port: 0 });
    const wrongRun = await get('/api/local-guardian/assessments/cloudflare/another-run/SYNTHETIC_CF');
    expect(wrongRun.status).toBe(404);
    const wrongTarget = await get('/api/local-guardian/assessments/cloudflare/synthetic-run-001/ANOTHER_TARGET');
    expect(wrongTarget.status).toBe(404);

    const wrongOrigin = await get('/api/local-guardian/fixture', {
      headers: { Origin: 'https://attacker.example' },
    });
    expect(wrongOrigin.status).toBe(403);
  });

  it('does not render unknown statuses or incomplete coverage as applicable results', async () => {
    demo = await startLocalGuardianDemo({ port: 0 });
    const { ssp } = await json(await get('/api/local-guardian/fixture'));
    const response = await get('/api/local-guardian/assessments/cloudflare/synthetic-run-001/SYNTHETIC_CF');
    const body = await json(response);
    body.assessment.findings[0].status = 'All Good';
    body.assessment['snapshot-meta'].evaluationReliable = false;

    const result = validateAssessmentEnvelope(body, selectedRun, ssp);
    expect(result.canPreview).toBe(false);
    expect(result.unknownStatuses).toHaveLength(1);
    expect(result.reliable).toBe(false);
  });

  it('does not treat an empty findings list as a successful assessment', async () => {
    demo = await startLocalGuardianDemo({ port: 0 });
    const { ssp } = await json(await get('/api/local-guardian/fixture'));
    const response = await get('/api/local-guardian/assessments/cloudflare/synthetic-run-001/SYNTHETIC_CF');
    const body = await json(response);
    body.assessment.findings = [];

    const result = validateAssessmentEnvelope(body, selectedRun, ssp);
    expect(result.canPreview).toBe(false);
    expect(result.controls.every(row => row.finding === null)).toBe(true);
  });

  it('flags unmapped findings and rejects duplicate control identities', async () => {
    demo = await startLocalGuardianDemo({ port: 0 });
    const { ssp } = await json(await get('/api/local-guardian/fixture'));
    const response = await get('/api/local-guardian/assessments/cloudflare/synthetic-run-001/SYNTHETIC_CF');
    const body = await json(response);
    body.assessment.findings[0]['control-id'] = 'ism-4040';

    const unmapped = validateAssessmentEnvelope(body, selectedRun, ssp);
    expect(unmapped.canPreview).toBe(false);
    expect(unmapped.unmapped.map(finding => finding['control-id'])).toEqual(['ism-4040']);

    body.assessment.findings.push(structuredClone(body.assessment.findings[0]));
    expect(() => validateAssessmentEnvelope(body, selectedRun, ssp))
      .toThrow('Duplicate Guardian finding for ism-4040.');
  });
});
