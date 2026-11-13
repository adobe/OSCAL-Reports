/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 * Consumer browser tests use mocked provider responses, not live Guardian findings.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { addIntegrityHash } from '../../backend/integrityService.js';

test.use({ channel: process.env.OSCAL_BROWSER_CHANNEL });
let frontendServer;
let browserUrl = process.env.OSCAL_BROWSER_URL;
test.beforeAll(async () => {
  if (!browserUrl) {
    const { createServer } = await import('../../frontend/node_modules/vite/dist/node/index.js');
    frontendServer = await createServer({
      root: fileURLToPath(new URL('../../frontend', import.meta.url)),
      configFile: fileURLToPath(new URL('../../frontend/vite.config.js', import.meta.url)),
      server: { host: '127.0.0.1', port: 0, strictPort: true },
    });
    await frontendServer.listen();
    browserUrl = `http://127.0.0.1:${frontendServer.httpServer.address().port}/`;
  }
});
test.afterAll(async () => { if (frontendServer) { await frontendServer.close(); } });

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const selection = { provider: 'cloudflare', targetId: 'TEST_ONLY', runId: 'test-only-run' };
const report = process.env.GUARDIAN_ACCEPTANCE_REPORT
  ? JSON.parse(fs.readFileSync(process.env.GUARDIAN_ACCEPTANCE_REPORT, 'utf8'))
  : { 'system-security-plan': {
    uuid: '97c75fe9-0a0a-471d-b7ad-28d01b3c8713',
    metadata: { title: 'Test-only SSP', version: '1', 'oscal-version': '1.1.2' },
    'control-implementation': { description: 'Preserve implementation narrative',
      'implemented-requirements': [
        { 'control-id': 'ism-0001', description: 'Preserve source narrative',
          props: [{ name: 'implementation-status', value: 'not-assessed' }] },
        { 'control-id': 'ism-9999', description: 'Preserve unmatched narrative', props: [] },
      ] },
  } };
const rows = report['system-security-plan']['control-implementation']['implemented-requirements'];
const assessment = {
  tentacle: selection.provider, 'target-id': selection.targetId, 'run-id': selection.runId,
  'ssp-uuid': report['system-security-plan'].uuid,
  'snapshot-meta': { truncated: false, evaluationReliable: true },
  findings: [{ 'control-id': rows[0]['control-id'], status: 'Effective',
    title: 'TEST ONLY - mocked browser contract', evidence: ['Test-only browser fixture, not a real assessment'] }],
};

async function startLoadExisting(page, body = report, name = 'existing.json') {
  await page.goto(browserUrl);
  await page.getByRole('button', { name: 'Get Started with This Use Case' }).nth(1).click();
  await page.locator('#file-upload').setInputFiles({
    name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(body)),
  });
  await page.getByRole('button', { name: /Load Existing Report/ }).click();
  await expect(page.getByRole('dialog', { name: 'Fetch assessment data from Guardian Agent?' })).toBeVisible();
}
async function openGuardian(page, body = report, name = 'existing.json') {
  await startLoadExisting(page, body, name);
  await page.getByRole('button', { name: 'Yes, fetch from Guardian' }).click();
}

test('mocked consumer contract: selects the supplied report, previews, persists a separate revision and populates the editor', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sessionToken', 'test-only-browser-session');
    localStorage.setItem('user', JSON.stringify({ id: 'guardian-browser-test', username: 'test-only', role: 'platform_admin' }));
  });
  const originalHash = hash(report);
  let output;
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    let data;
    switch (url.pathname) {
      case '/api/auth/session': data = { valid: true }; break;
      case '/api/settings/runtime': data = { databaseConfig: { enabled: false } }; break;
      case '/api/guardian/assessments/status':
        data = { ready: true, privileged: { provider: 'Generic SSO', groups: ['OSCAL_Platform Admin'] },
          targets: [{ ...selection, label: 'TEST ONLY target' }] }; break;
      case '/api/guardian/assessments/runs':
        data = { contractVersion: '1', runs: [{ ...selection, sspUuid: assessment['ssp-uuid'],
          generatedAt: '2026-11-10T00:00:00Z' }], nextToken: null }; break;
      case '/api/guardian/assessments/result':
        data = { contractVersion: '1', assessment, assessmentHash: hash(assessment),
          oscal: { 'assessment-results': { uuid: 'test-only-assessment' } } }; break;
      case '/api/guardian/assessments/preview': {
        const body = route.request().postDataJSON();
        expect(body.bindUnlinkedAssessment).toBe(false);
        expect(body.assessmentHash).toBe(hash(assessment));
        expect(body.returnPatch).toBe(true);
        const projectedRows = body.ssp['system-security-plan']['control-implementation']['implemented-requirements'];
        expect(projectedRows).toHaveLength(1);
        expect(Object.keys(projectedRows[0])).toEqual(['control-id', 'props']);
        expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(1024 * 1024);
        const projectedOutput = structuredClone(body.ssp);
        const row = projectedOutput['system-security-plan']['control-implementation']['implemented-requirements'][0];
        const before = structuredClone(row.props || []);
        row.props = [...before.filter(prop => prop.name !== 'implementation-status'),
          { name: 'implementation-status', value: 'effective' }];
        projectedOutput['system-security-plan'].metadata['last-modified'] = '2026-11-10T00:00:00Z';
        data = { contractVersion: '1', inputHash: hash(body.ssp), outputHash: hash(projectedOutput),
          assessmentHash: hash(assessment), updated: 1,
          metadataProps: { before: body.ssp['system-security-plan'].metadata.props,
            after: projectedOutput['system-security-plan'].metadata.props },
          metadataLastModified: { before: null, after: '2026-11-10T00:00:00Z' },
          changes: [{ controlId: row['control-id'], before, after: row.props }] };
        break;
      }
      case '/api/guardian/assessments/finalize':
        output = addIntegrityHash(route.request().postDataJSON().ssp);
        data = { ssp: output, documentHash: hash(output) }; break;
      case '/api/extract-catalog-from-ssp':
        data = { catalogUrl: 'https://example.test/catalog.json' }; break;
      default:
        return route.fulfill({ status: 404, json: { error: 'Test-only route not configured' } });
    }
    return route.fulfill({ status: 200, json: data });
  });

  await openGuardian(page);
  await expect(page.getByText(`Controls: ${rows.length}.`, { exact: false })).toBeVisible();
  await page.getByLabel('Authorized target').selectOption('cloudflare/TEST_ONLY');
  await page.getByRole('button', { name: 'Load assessment runs', exact: true }).click();
  await page.getByRole('combobox', { name: 'Assessment run', exact: true }).selectOption(selection.runId);
  await expect(page.getByText('You are operating this function as a privileged user', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fetch Guardian assessment', exact: true })).toBeDisabled();
  await page.getByLabel('I confirm report', { exact: false }).check();
  await page.getByRole('button', { name: 'Fetch Guardian assessment', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Read-only control assessments' })).toBeVisible();
  await page.getByRole('button', { name: 'Preview control changes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Review 1 control changes' })).toBeVisible();
  const confirmButton = page.getByRole('button', { name: 'Confirm and populate new report revision', exact: true });
  await expect(confirmButton).toBeDisabled();
  await page.getByLabel('I reviewed these changes', { exact: false }).check();
  await confirmButton.click();
  await expect(page.getByText('New revision saved in this browser', { exact: false })).toBeVisible();
  expect(hash(report)).toBe(originalHash);
  expect(output['system-security-plan']['control-implementation']['implemented-requirements']).toHaveLength(rows.length);

  await page.reload();
  await openGuardian(page);
  await expect(page.getByRole('heading', { name: 'Guardian revision for this report' })).toBeVisible();
  const applied = page.locator('strong', { hasText: 'Provider results applied so far:' });
  await expect(applied).toBeVisible();
  expect(await applied.evaluate(node => Number(getComputedStyle(node).fontWeight))).toBeGreaterThanOrEqual(600);
  await page.getByRole('button', { name: 'Continue with saved Guardian revision', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Select Compliance Framework Catalog' })).toBeVisible();
  expect(hash(report)).toBe(originalHash);
  if (process.env.GUARDIAN_ACCEPTANCE_REPORT) { expect(rows.length).toBeGreaterThan(0); }
});

test('disabled real provider remains visible and does not offer fixture results', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sessionToken', 'test-only-browser-session');
    localStorage.setItem('user', JSON.stringify({ id: 'disabled-guardian-test', username: 'test-only', role: 'platform_admin' }));
  });
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ status: 200, json: path === '/api/auth/session' ? { valid: true }
      : { ready: false, targets: [], message: 'Guardian assessment retrieval is disabled or not configured.' } });
  });
  await openGuardian(page);
  await expect(page.getByRole('alert')).toContainText('disabled or not configured');
  await expect(page.getByRole('button', { name: 'Load assessment runs', exact: true })).toBeDisabled();
  await expect(page.getByText('synthetic-run-001')).toHaveCount(0);
});

test.describe('Load Existing Report asks whether to fetch Guardian assessments', () => {
  async function openLoadExisting(page, extractCalls) {
    await page.addInitScript(() => {
      localStorage.setItem('sessionToken', 'test-only-browser-session');
      localStorage.setItem('user', JSON.stringify({ id: 'guardian-prompt-test', username: 'test-only', role: 'platform_admin' }));
    });
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/extract-catalog-from-ssp') { extractCalls.count++; }
      const data = path === '/api/auth/session' ? { valid: true }
        : path === '/api/extract-catalog-from-ssp' ? { catalogUrl: 'https://example.test/catalog.json' }
          : path === '/api/guardian/assessments/status' ? { ready: false, targets: [], message: 'Test-only: Guardian not configured.' }
            : { databaseConfig: { enabled: false } };
      return route.fulfill({ status: 200, json: data });
    });
    await startLoadExisting(page);
  }

  test('No continues the existing catalog sequence', async ({ page }) => {
    const calls = { count: 0 };
    await openLoadExisting(page, calls);
    expect(calls.count).toBe(0);
    await page.getByRole('button', { name: 'No, continue' }).click();
    await expect(page.getByRole('heading', { name: 'Select Compliance Framework Catalog' })).toBeVisible();
    expect(calls.count).toBe(1);
  });

  test('the Guardian page keeps the application header and can be left with Start Over', async ({ page }) => {
    const calls = { count: 0 };
    await openLoadExisting(page, calls);
    await page.getByRole('button', { name: 'Yes, fetch from Guardian' }).click();
    await expect(page.getByRole('heading', { name: 'Guardian Agent assessment' })).toBeVisible();
    await expect(page.locator('header.app-header')).toContainText("Keekar's OSCAL SOA/SSP/CCM Generator");
    const startOver = page.getByRole('button', { name: 'Start Over' });
    await expect(startOver).toBeVisible();
    // Declining the confirmation keeps the user on the page; accepting returns to the start.
    page.once('dialog', dialog => dialog.dismiss());
    await startOver.click();
    await expect(page.getByRole('heading', { name: 'Guardian Agent assessment' })).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await startOver.click();
    await expect(page.getByRole('heading', { name: 'Guardian Agent assessment' })).toHaveCount(0);
    await expect(page.getByText('Start New Report', { exact: false }).first()).toBeVisible();
    expect(calls.count).toBe(0);
  });

  test('Yes opens the Guardian workflow and skipping resumes the existing sequence', async ({ page }) => {
    const calls = { count: 0 };
    await openLoadExisting(page, calls);
    await page.getByRole('button', { name: 'Yes, fetch from Guardian' }).click();
    await expect(page.getByRole('heading', { name: 'Guardian Agent assessment' })).toBeVisible();
    await expect(page.getByText('Selected OSCAL report')).toHaveCount(0);
    // The page carries the same footer as every other page.
    await expect(page.locator('footer.app-footer')).toBeVisible();
    await expect(page.locator('footer.app-footer')).toContainText('Made with Passion by Mukesh Kesharwani');
    await expect(page.getByText('Using the report you just loaded', { exact: false })).toBeVisible();
    const characteristics = report['system-security-plan']['system-characteristics'] || {};
    const summary = page.locator('p', { hasText: 'Using the report you just loaded' });
    await expect(summary).toContainText('File Name: existing.json, Controls:');
    await expect(summary).toContainText(`UUID: ${report['system-security-plan'].uuid}, System ID: ${characteristics['system-ids']?.[0]?.id || 'not set'}, System Name: ${characteristics['system-name'] || 'not set'}`);
    expect(await summary.locator('br').count()).toBe(2);
    await expect(page.getByLabel('Authorized target')).toBeDisabled();
    // Layout: the two selectors share one row, and the legend is bold and 1.5pt (2px) larger than the form text.
    // Measured in one synchronous step so a scroll in progress cannot skew the two positions.
    const [target, run] = await page.evaluate(() => [...document.querySelectorAll('.guardian-assessment-fields select')]
      .slice(0, 2).map(node => { const box = node.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width }; }));
    expect(Math.abs(target.y - run.y)).toBeLessThan(4);
    expect(run.x).toBeGreaterThan(target.x + target.width - 1);
    const type = await page.evaluate(() => {
      const legend = document.querySelector('.guardian-assessment legend');
      const legendStyle = getComputedStyle(legend);
      return { weight: Number(legendStyle.fontWeight), size: parseFloat(legendStyle.fontSize),
        base: parseFloat(getComputedStyle(legend.parentElement).fontSize) };
    });
    expect(type.weight).toBeGreaterThanOrEqual(700);
    expect(type.size - type.base).toBeCloseTo(2, 1);
    // The five report labels are bold, and two blank lines separate the summary from the source group.
    const labels = await summary.locator('strong').allTextContents();
    expect(labels).toEqual(['Using the report you just loaded:', 'File Name:', 'Controls:', 'UUID:', 'System ID:', 'System Name:']);
    for (const weight of await summary.locator('strong').evaluateAll(nodes => nodes.map(node => Number(getComputedStyle(node).fontWeight)))) {
      expect(weight).toBeGreaterThanOrEqual(600);
    }
    // The two selector captions are bold too.
    for (const caption of ['Authorized target', 'Assessment run']) {
      const weight = await page.locator('.guardian-assessment-fields label strong', { hasText: caption })
        .evaluate(node => Number(getComputedStyle(node).fontWeight));
      expect(weight).toBeGreaterThanOrEqual(600);
    }
    const gap = await page.evaluate(() => {
      const fieldset = document.querySelector('.guardian-assessment fieldset');
      const summaryBox = [...document.querySelectorAll('.guardian-assessment p')].find(node => node.textContent.includes('Using the report'));
      // The summary is three text lines, so one line is a third of its height.
      const line = summaryBox.getBoundingClientRect().height / 3;
      return { space: fieldset.getBoundingClientRect().top - summaryBox.getBoundingClientRect().bottom, line };
    });
    expect(gap.space).toBeGreaterThanOrEqual(gap.line * 2 - 1);
    // One extra blank line after the "selectors stay disabled" note (the default paragraph gap was one line).
    const noteGap = await page.evaluate(() => {
      const note = document.querySelector('.guardian-assessment-disabled-note');
      const next = [...document.querySelectorAll('.guardian-assessment p')].find(node => node.textContent.includes('Using the report'));
      const line = next.getBoundingClientRect().height / 3;
      return { space: next.getBoundingClientRect().top - note.getBoundingClientRect().bottom, line };
    });
    expect(noteGap.space).toBeGreaterThanOrEqual(noteGap.line * 2 - 1);
    await expect(page.getByText('selectors below stay disabled', { exact: false })).toBeVisible();
    expect(calls.count).toBe(0);
    await page.getByRole('button', { name: 'Skip Guardian and continue loading report' }).click();
    await expect(page.getByRole('heading', { name: 'Select Compliance Framework Catalog' })).toBeVisible();
    expect(calls.count).toBe(1);
  });
});

test('Guardian has no standalone entry point on the landing page or editor', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('sessionToken', 'test-only-browser-session');
    localStorage.setItem('user', JSON.stringify({ id: 'guardian-entry-test', username: 'test-only', role: 'platform_admin' }));
  });
  await page.route('**/api/**', route => route.fulfill({ status: 200,
    json: new URL(route.request().url()).pathname === '/api/auth/session' ? { valid: true } : { databaseConfig: { enabled: false } } }));
  await page.goto(browserUrl);
  await expect(page.getByRole('button', { name: 'Get Started with This Use Case' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardian Agent assessment' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Get Started with This Use Case' }).first().click();
  await expect(page.getByRole('button', { name: 'Guardian Agent assessment' })).toHaveCount(0);
});

// ---- Multi-provider accumulation, report-specific revisions and download names (mocked Guardian) ----
const smallReport = uuid => ({ 'system-security-plan': {
  uuid, metadata: { title: `Small report ${uuid.slice(0, 4)}`, version: '1', 'oscal-version': '1.1.2' },
  'system-characteristics': { 'system-name': 'Small System', 'system-ids': [{ id: 'SYS-1' }] },
  'control-implementation': { description: 'd', 'implemented-requirements': [
    { 'control-id': 'ism-0001', description: 'narrative one', props: [{ name: 'implementation-status', value: 'not-assessed' }] },
    { 'control-id': 'ism-0002', description: 'narrative two', props: [{ name: 'implementation-status', value: 'not-assessed' }] },
    { 'control-id': 'ism-9999', description: 'unmatched', props: [] },
  ] },
} });
const targets = [
  { provider: 'cloudflare', targetId: 'CF_T', label: 'Cloudflare test', control: 'ism-0001', status: 'Effective', normalized: 'effective' },
  { provider: 'okta', targetId: 'OK_T', label: 'Okta test', control: 'ism-0002', status: 'Ineffective', normalized: 'ineffective' },
];

async function mockGuardian(page, uuid, outputs) {
  await page.addInitScript(() => {
    localStorage.setItem('sessionToken', 'test-only-browser-session');
    localStorage.setItem('user', JSON.stringify({ id: 'guardian-multi-test', username: 'test-only', role: 'platform_admin' }));
  });
  const assessmentFor = (provider, targetId, runId) => {
    const t = targets.find(item => item.provider === provider);
    return { tentacle: provider, 'target-id': targetId, 'run-id': runId, 'ssp-uuid': uuid,
      'snapshot-meta': { truncated: false, evaluationReliable: true },
      findings: [{ 'control-id': t.control, status: t.status, title: 'TEST ONLY', evidence: ['Test-only evidence'],
        ...(provider === 'okta' ? { oktaApplicabilityTier: 'core_okta' } : {}) }] };
  };
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const q = Object.fromEntries(url.searchParams);
    let data;
    switch (url.pathname) {
      case '/api/auth/session': data = { valid: true }; break;
      case '/api/settings/runtime': data = { databaseConfig: { enabled: false } }; break;
      case '/api/guardian/assessments/status':
        data = { ready: true, targets: targets.map(({ provider, targetId, label }) => ({ provider, targetId, label })) }; break;
      case '/api/guardian/assessments/runs':
        data = { contractVersion: '1', runs: [{ provider: q.provider, runId: `run-${q.provider}`, targetId: q.targetId,
          sspUuid: uuid, generatedAt: '2026-11-10T00:00:00Z' }], nextToken: null }; break;
      case '/api/guardian/assessments/result': {
        const assessment = assessmentFor(q.provider, q.targetId, q.runId);
        data = { contractVersion: '1', assessment, assessmentHash: hash(assessment), oscal: { 'assessment-results': { uuid: 'x' } } };
        break;
      }
      case '/api/guardian/assessments/preview': {
        const body = route.request().postDataJSON();
        const out = structuredClone(body.ssp);
        const rowsOut = out['system-security-plan']['control-implementation']['implemented-requirements'];
        const t = targets.find(item => item.provider === body.provider);
        const changes = rowsOut.map(row => {
          const before = structuredClone(row.props || []);
          row.props = [...before.filter(prop => !['implementation-status', 'testing-procedure'].includes(prop.name)),
            { name: 'implementation-status', value: t.normalized }, { name: 'testing-procedure', value: `marker-${body.provider}` }];
          return { controlId: row['control-id'], before, after: row.props };
        });
        out['system-security-plan'].metadata['last-modified'] = '2026-11-10T00:00:00Z';
        data = { contractVersion: '1', inputHash: hash(body.ssp), outputHash: hash(out), assessmentHash: body.assessmentHash,
          updated: changes.length,
          metadataProps: { before: body.ssp['system-security-plan'].metadata.props, after: out['system-security-plan'].metadata.props },
          metadataLastModified: { before: null, after: '2026-11-10T00:00:00Z' }, changes };
        break;
      }
      case '/api/guardian/assessments/finalize': {
        const output = addIntegrityHash(route.request().postDataJSON().ssp);
        outputs.push(output);
        data = { ssp: output, documentHash: hash(output) };
        break;
      }
      default: return route.fulfill({ status: 404, json: { error: 'Test-only route not configured' } });
    }
    return route.fulfill({ status: 200, json: data });
  });
}

async function applyProvider(page, index) {
  const t = targets[index];
  await page.getByLabel('Authorized target').selectOption(`${t.provider}/${t.targetId}`);
  await page.getByRole('button', { name: 'Load assessment runs', exact: true }).click();
  await page.getByRole('combobox', { name: 'Assessment run', exact: true }).selectOption(`run-${t.provider}`);
  await page.getByRole('button', { name: 'Fetch Guardian assessment', exact: true }).click();
  await page.getByRole('button', { name: 'Preview control changes', exact: true }).click();
  await page.getByLabel('I reviewed these changes', { exact: false }).check();
  await page.getByRole('button', { name: 'Confirm and populate new report revision', exact: true }).click();
  await expect(page.getByText('New revision saved in this browser', { exact: false })).toBeVisible();
}

const propValue = (output, controlId, name) => output['system-security-plan']['control-implementation']['implemented-requirements']
  .find(row => row['control-id'] === controlId)?.props?.find(prop => prop.name === name)?.value;

test('a second provider is added to the first revision instead of replacing it', async ({ page }) => {
  const uuid = '11111111-1111-4111-8111-111111111111';
  const outputs = [];
  await mockGuardian(page, uuid, outputs);
  await openGuardian(page, smallReport(uuid), 'my-input-report-file.json');
  await applyProvider(page, 0);
  await applyProvider(page, 1);
  expect(outputs).toHaveLength(2);
  const final = outputs.at(-1);
  expect(propValue(final, 'ism-0001', 'testing-procedure')).toBe('marker-cloudflare');
  expect(propValue(final, 'ism-0001', 'implementation-status')).toBe('effective');
  expect(propValue(final, 'ism-0002', 'testing-procedure')).toBe('marker-okta');
  expect(propValue(final, 'ism-0002', 'implementation-status')).toBe('ineffective');
  await expect(page.locator('li', { hasText: 'cloudflare / CF_T' })).toBeVisible();
  await expect(page.locator('li', { hasText: 'okta / OK_T' })).toBeVisible();
});

test('a revision saved for a different report is not offered for the report just loaded', async ({ page }) => {
  const first = '22222222-2222-4222-8222-222222222222';
  const second = '33333333-3333-4333-8333-333333333333';
  await mockGuardian(page, first, []);
  await openGuardian(page, smallReport(first), 'first-report.json');
  await applyProvider(page, 0);
  await page.reload();
  await mockGuardian(page, second, []);
  await openGuardian(page, smallReport(second), 'second-report.json');
  await expect(page.getByRole('heading', { name: 'Guardian revision for this report' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue with saved Guardian revision' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Download populated SSP' })).toHaveCount(0);
  await expect(page.getByText('belongs to a different report', { exact: false })).toBeVisible();
  await page.reload();
  await mockGuardian(page, first, []);
  await openGuardian(page, smallReport(first), 'first-report.json');
  await expect(page.getByRole('heading', { name: 'Guardian revision for this report' })).toBeVisible();
});

test('Download populated SSP is named from the first 16 characters of the input file plus a date-time number', async ({ page }) => {
  const uuid = '44444444-4444-4444-8444-444444444444';
  await mockGuardian(page, uuid, []);
  await openGuardian(page, smallReport(uuid), 'DigitalSovereignEDSAustralia_ComplianceReport.json');
  await applyProvider(page, 0);
  const [download] = await Promise.all([page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download populated SSP' }).click()]);
  const now = new Date();
  const day = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  expect(download.suggestedFilename()).toMatch(/^DigitalSovereign_GAD-Input_\d{14}\.json$/);
  expect(download.suggestedFilename().slice('DigitalSovereign_GAD-Input_'.length)).toMatch(new RegExp(`^${day}`));
});

// ---- Generic SSO sign-in failures are reported as what actually failed (mocked API; real login page) ----
test.describe('login page reports the real Generic SSO failure', () => {
  async function openLogin(page, query) {
    await page.route('**/api/**', route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/auth/sso/login-providers') {
        return route.fulfill({ status: 200, json: { providers: [{ id: 'Generic_OIDC', displayName: 'Generic SSO', authorizeUrl: '/api/auth/oidc/generic-oidc/authorize' }] } });
      }
      return route.fulfill({ status: 401, json: { error: 'Authentication required' } });
    });
    await page.goto(`${browserUrl}${query}`);
  }

  test('an unreachable SSO server names the host and the system error, not "not configured"', async ({ page }) => {
    await openLogin(page, '?error=generic_oidc_unreachable&host=sso.example.test&detail=EHOSTUNREACH');
    await expect(page.getByText('Could not reach the SSO server sso.example.test', { exact: false })).toBeVisible();
    await expect(page.getByText('no route to the host (EHOSTUNREACH)', { exact: false })).toBeVisible();
    await expect(page.getByText('not configured', { exact: false })).toHaveCount(0);
    await expect(page.getByText('redirect URI is not allowed', { exact: false })).toHaveCount(0);
  });

  test('a missing setting and a refused callback address each say so', async ({ page }) => {
    await openLogin(page, '?error=generic_oidc_not_configured&missing=client-secret');
    await expect(page.getByText('the client secret is missing or could not be read', { exact: false })).toBeVisible();
    await openLogin(page, '?error=generic_oidc_redirect_not_allowed&redirect=http%3A%2F%2Fevil.example.test%3A3021%2Fauth%2Fcallback');
    await expect(page.getByText('http://evil.example.test:3021/auth/callback is not in the allowed redirect list', { exact: false })).toBeVisible();
  });

  test('hostile values in the address are never shown', async ({ page }) => {
    await openLogin(page, '?error=generic_oidc_unreachable&host=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E&detail=%3Cscript%3E');
    await expect(page.getByText('Could not reach the SSO server', { exact: false })).toBeVisible();
    expect(await page.content()).not.toContain('<img src=x');
    expect(await page.locator('img[src="x"]').count()).toBe(0);
  });
});
