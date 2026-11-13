/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * Real cached evidence with test-only signed identities; never a production-auth proof.
 * Two passes: an Okta-shaped delegated token, then an Authentik-shaped Generic SSO token through OSCAL's privileged path.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { generateKeyPairSync } from 'node:crypto';
import { SignJWT } from '../../backend/node_modules/jose/dist/webapi/index.js';
import { createGuardianService } from '../../backend/guardianService.js';
import { createGuardianAssessmentService, registerLocalDevAuthorization } from '../../backend/guardianAssessments.js';
import { recordIdpIdentity } from '../../backend/auth/idpIdentity.js';
import { extractControlsFromSSP } from '../../backend/sspComparisonV3.js';
import { revokeDelegatedToken } from '../../backend/auth/delegatedTokens.js';
import { calculateIntegrityHash, INTEGRITY_PROPERTY_NAMESPACE } from '../../backend/integrityService.js';
import { projectGuardianReport, validateGuardianAssessment, validateGuardianPatch,
  validateFinalizedGuardianRevision } from '../../frontend/src/services/guardianAssessmentContract.js';
import { sha256Json } from '../../frontend/src/services/guardianLocalContract.js';

const check = (condition, message) => { if (!condition) { throw new Error(message); } };

// Two-provider rules (owner decision 2026-11-13, implemented by Guardian's shared merge): for a control assessed by more
// than one provider, the most negative ASSESSED status wins, and Evidence and Testing Method keep every provider.
const STATUS_RANK = { 'not-implemented': 4, ineffective: 3, 'partially-effective': 2, effective: 1 };
const PROVIDER_LABEL = { okta: 'Okta', cloudflare: 'Cloudflare' };
const kebab = value => String(value).toLowerCase().trim().replace(/\s+/g, '-');
// Latest assessment-history entry per provider other than `provider`, as the report held it before this apply.
const historyOthers = (row, provider) => {
  let history = [];
  try { history = JSON.parse((row?.props || []).find(prop => prop.name === 'api-data-history')?.value || '[]'); } catch { history = []; }
  const latest = new Map();
  for (const entry of Array.isArray(history) ? history : []) {
    const name = String(entry?.provider || '').toLowerCase();
    if (name && name !== provider) { latest.set(name, entry); }
  }
  return [...latest].map(([name, entry]) => ({ provider: name, targetId: entry.targetId, status: entry.status ? kebab(entry.status) : null }));
};
const worstAssessed = statuses => statuses.filter(status => STATUS_RANK[status])
  .sort((left, right) => STATUS_RANK[right] - STATUS_RANK[left])[0];

// Fetches, previews, validates and applies each target in turn to a copy of the source report.
// Returns the receipts and the final candidate; the source is never modified.
async function runTargets(service, session, targets, source) {
  let current = globalThis.structuredClone(source);
  const receipts = [];
  // Controls already applied by an earlier provider: controlId -> [{ provider, targetId, runId, status }]
  const earlier = new Map();
  for (const target of targets) {
    const runs = [];
    let nextToken;
    const seen = new Set();
    do {
      const page = await service.runs(session, { ...target, ...(nextToken ? { nextToken } : {}) });
      runs.push(...page.runs);
      nextToken = page.nextToken;
      check(!nextToken || !seen.has(nextToken), 'Guardian pagination repeated a cursor.');
      if (nextToken) { seen.add(nextToken); }
    } while (nextToken);
    runs.sort((a, b) => Date.parse(b.generatedAt) - Date.parse(a.generatedAt));
    check(runs.length > 0, 'No real cached per-control assessment was available for a required target.');
    const selection = { provider: target.provider, targetId: target.targetId, runId: runs[0].runId };
    const fetched = await service.assessment(session, selection);
    const result = await validateGuardianAssessment(fetched, selection, current);
    const projection = projectGuardianReport(current, result.assessment);
    const request = { ...selection, ssp: projection, assessmentHash: result.assessmentHash,
      bindUnlinkedAssessment: !result.identityLinked, returnPatch: true };
    const preview = await service.preview(session, request);
    const validated = await validateGuardianPatch(preview, current, result.assessment, result.assessmentHash);
    const finalized = await service.finalize(session, { ssp: validated.ssp });
    const candidate = await validateFinalizedGuardianRevision(finalized, validated.ssp);
    check(candidate['system-security-plan']['control-implementation']['implemented-requirements'].length ===
      source['system-security-plan']['control-implementation']['implemented-requirements'].length,
    'A real-data preview changed the complete control set.');
    const sourceRows = current['system-security-plan']['control-implementation']['implemented-requirements'];
    const candidateRows = candidate['system-security-plan']['control-implementation']['implemented-requirements'];
    const changed = new Set(preview.changes.map(change => change.controlId.toLowerCase()));
    const rowsBefore = new Map(sourceRows.map(row => [row['control-id'].toLowerCase(), row]));
    for (let index = 0; index < sourceRows.length; index++) {
      check(sourceRows[index].description === candidateRows[index].description, 'A real-data preview changed a narrative.');
      if (!changed.has(sourceRows[index]['control-id'].toLowerCase())) {
        check(JSON.stringify(sourceRows[index]) === JSON.stringify(candidateRows[index]), 'A real-data preview changed an unmatched control.');
      }
    }
    const integrity = candidate['system-security-plan'].metadata.props.find(prop =>
      prop.ns === INTEGRITY_PROPERTY_NAMESPACE && prop.name === 'file-integrity-hash');
    check(integrity?.value === calculateIntegrityHash(candidate), 'Full-document canonical integrity did not verify.');
    // What the report editor will show: Guardian's status, evidence and Testing tab fields must reach every updated control.
    const editor = new Map(extractControlsFromSSP(candidate).map(control => [String(control.id).toLowerCase(), control]));
    const findingFor = new Map(result.assessment.findings.map(finding => [String(finding['control-id']).toLowerCase(), finding]));
    for (const change of preview.changes) {
      const key = change.controlId.toLowerCase();
      const control = editor.get(key);
      const finding = findingFor.get(key);
      check(control && finding, `Updated control ${change.controlId} is missing from the editor view or the assessment.`);
      check(control.evidence.includes(change.controlId), `${change.controlId}: evidence was not populated.`);
      check(control.testingProcedure.includes(selection.runId) && control.testingProcedure.includes(selection.targetId),
        `${change.controlId}: testing procedure does not name the run and target.`);
      const applied = (earlier.get(key) || []).filter(entry => entry.provider !== target.provider);
      // Other providers' latest results: those applied earlier in this run, and those the report already held in its history.
      const fromHistory = historyOthers(rowsBefore.get(key), target.provider).filter(entry => !applied.some(a => a.provider === entry.provider));
      const others = [...applied, ...fromHistory];
      for (const other of fromHistory) {
        check(control.evidence.includes(`=== ${PROVIDER_LABEL[other.provider] || other.provider} (`),
          `${change.controlId}: evidence has no labelled section for the provider already in the report history.`);
      }
      for (const other of applied) {
        // Amended, not replaced: the other provider's data must still be there next to this provider's.
        check(control.evidence.includes(`=== ${PROVIDER_LABEL[other.provider]} (target ${other.targetId}, run `) &&
          control.evidence.includes(`=== ${PROVIDER_LABEL[target.provider]} (target ${target.targetId}, run `),
        `${change.controlId}: evidence does not hold a labelled section for each provider.`);
        check(control.testingProcedure.includes(other.targetId) && control.testingProcedure.includes(target.targetId),
          `${change.controlId}: testing method does not keep both providers.`);
      }
      check(control.testingFrequency.trim() !== '' && control.lastTestDate.trim() !== '', `${change.controlId}: test frequency or date is empty.`);
      check(String(control.apiDataHistory.at(-1)?.source || '').includes(selection.runId),
        `${change.controlId}: the newest API data history entry is not from this run.`);
      // An assessed status is the most negative of the providers' latest assessed results (for one provider, its own).
      // Not Assessed never beats an assessed status. Not Applicable is never written: the report's own value, or another
      // provider's assessed status, stands (the cached data currently holds no Not Applicable result).
      const own = kebab(finding.status);
      const existing = (rowsBefore.get(key)?.props || []).find(prop => prop.name === 'implementation-status')?.value;
      const otherAssessed = worstAssessed(others.map(entry => entry.status));
      if (STATUS_RANK[own]) {
        const expected = worstAssessed([own, ...others.map(entry => entry.status)]);
        check(control.status === expected, `${change.controlId}: status ${control.status} is not the most negative assessed status (${expected}).`);
      } else if (own === 'not-applicable') {
        const expected = otherAssessed || (existing ? kebab(existing) : 'not-assessed');
        check(control.status === expected, `${change.controlId}: Not Applicable changed the status (${control.status}; the report's value ${expected} must win).`);
      } else if (own === 'not-assessed' && otherAssessed) {
        check(control.status === otherAssessed, `${change.controlId}: Not Assessed overrode an assessed status.`);
      }
    }
    for (const change of preview.changes) {
      const key = change.controlId.toLowerCase();
      earlier.set(key, [...(earlier.get(key) || []).filter(entry => entry.provider !== target.provider),
        { provider: target.provider, targetId: target.targetId, runId: selection.runId, status: kebab(findingFor.get(key).status) }]);
    }
    receipts.push({ provider: target.provider, runId: selection.runId, findings: result.assessment.findings.length,
      eligibleControls: projection['system-security-plan']['control-implementation']['implemented-requirements'].length,
      updated: preview.updated, editorFieldsVerified: preview.changes.length, requestBytes: Buffer.byteLength(JSON.stringify(request)),
      responseBytes: Buffer.byteLength(JSON.stringify(preview)) });
    current = candidate;
  }
  return { receipts, current };
}

const controlRows = report => report['system-security-plan']['control-implementation']['implemented-requirements'];

// Authentik (Generic SSO) pass: OSCAL's real assessment service with a privileged Generic_OIDC session calls Guardian's
// development gateway with an Authentik-shaped token (space-delimited scope, aud = client id, no cid, namespaced groups).
// Authentication is TEST-ONLY: it exercises the shapes and denials, not real Authentik tokens or the real issuer.
async function authentikPass(checkout, source, oktaCandidate) {
  const gatewayModule = path.resolve(checkout, 'scripts/guardian-assessment-dev-gateway.mjs');
  const { startDevAssessmentGateway } = await import(pathToFileURL(gatewayModule).href);
  const grants = ['cloudflare#PROD_AEMGovAu', 'okta#AEMGovAu'];
  const group = 'OSCAL_Platform Admin';
  const dev = await startDevAssessmentGateway({
    runsDir: process.env.GUARDIAN_CACHE_DIR || path.join(checkout, 'data/guardian_s3_runs'),
    targets: grants, acknowledgeNonProduction: true, port: 0, authentikGroup: group,
  });
  try {
    check(typeof dev.authentikTokenForTest === 'function', 'The Guardian checkout has no authentikTokenForTest(); update it first.');
    const targets = grants.map(grant => {
      const [provider, targetId] = grant.split('#');
      return { provider, targetId, label: `${provider} ${targetId}`, groups: [group] };
    });
    let tokenOverrides = {};
    registerLocalDevAuthorization(async () => ({ token: dev.authentikTokenForTest(tokenOverrides), payload: { groups: [group] } }));
    const url = `${dev.baseUrl}/v1/guardian`;
    const service = createGuardianAssessmentService({ readConfig: () => ({ local: true, url, genericUrl: url, targets }) });
    const session = { userId: 'test-only-authentik-identity', createdAt: Date.now() };
    recordIdpIdentity(session, { provider: 'Generic_OIDC', groups: [group] });

    const status = await service.status(session);
    check(status.ready && status.privileged?.groups.includes(group), 'Authentik-shaped capabilities were not ready for a privileged session.');

    // OSCAL's own gate refuses a Generic SSO session outside the privileged group before any Guardian call.
    const outsider = { userId: 'test-only-outsider', createdAt: Date.now() };
    recordIdpIdentity(outsider, { provider: 'Generic_OIDC', groups: ['Other'] });
    check((await service.status(outsider)).code === 'guardian_not_privileged', 'A non-privileged Generic SSO session was not refused.');

    // Guardian's own enforcement: OSCAL's gate passes (the session is privileged), so the denial is Guardian's.
    const denials = [];
    for (const [name, overrides, expected] of [
      ['no custom scope', { scope: 'openid profile' }, 401],
      ['non-member group', { groups: ['Other'] }, 403],
    ]) {
      tokenOverrides = overrides;
      let status;
      try { await service.runs(session, { ...targets[0] }); } catch (error) { status = error.status; }
      check(status === expected, `Authentik-shaped token with ${name} expected ${expected}, got ${status ?? 'no error'}.`);
      denials.push({ case: name, status });
    }
    tokenOverrides = {};

    const result = await runTargets(service, session, targets, source);
    for (const receipt of result.receipts) {
      check(receipt.updated === receipt.eligibleControls, `Authentik-shaped ${receipt.provider} updated count differs from eligible controls.`);
    }
    check(result.receipts[0].eligibleControls === result.receipts[0].findings, 'Not every Cloudflare finding was eligible.');
    check(JSON.stringify(controlRows(result.current)) === JSON.stringify(controlRows(oktaCandidate)),
      'Authentik-shaped and Okta-shaped passes produced different controls.');
    return { receipts: result.receipts, denials };
  } finally {
    registerLocalDevAuthorization(null);
    await dev.close();
  }
}

async function main() {
  const checkout = process.env.GUARDIAN_CHECKOUT;
  const sourcePath = process.env.GUARDIAN_ACCEPTANCE_REPORT;
  check(checkout && sourcePath, 'Set GUARDIAN_CHECKOUT and GUARDIAN_ACCEPTANCE_REPORT; no fixture fallback is used.');
  const load = relative => import(pathToFileURL(path.resolve(checkout, relative)).href);
  const [{ createFileAssessmentStore }, { createAssessmentHandler }, { createVerifier }, { createGuard },
    { startAssessmentGateway }] = await Promise.all([
    load('scripts/lib/guardian-assessment-store.mjs'), load('scripts/lib/guardian-assessment-api.mjs'),
    load('infra/guardian/lambda-ssp/lib/auth.mjs'), load('infra/guardian/lambda-ssp/lib/guard.mjs'),
    load('scripts/guardian-assessment-gateway.mjs'),
  ]);
  const originalBytes = await fs.readFile(sourcePath);
  const source = JSON.parse(originalBytes);
  const originalHash = await sha256Json(source);
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...pair.publicKey.export({ format: 'jwk' }), kid: 'oscal-local-test', alg: 'RS256', use: 'sig' };
  const identity = {
    issuer: 'https://oscal-contract.example.test/oauth2/test', audience: 'test-guardian-resource',
    jwksUrl: 'https://oscal-contract.example.test/oauth2/test/keys',
    clientId: 'test-oscal-client', scopes: ['test:assessment'],
  };
  const contract = {
    tokenFormat: 'jwt', tokenFlow: 'delegated-user', issuer: identity.issuer,
    audience: identity.audience, jwksUrl: identity.jwksUrl, jwksHost: 'oscal-contract.example.test',
    algorithms: ['RS256'], maxTokenAgeSeconds: 600, clockToleranceSeconds: 0,
    scopeClaim: 'scp', scopeFormat: 'array', requiredScopes: identity.scopes,
    groupsClaim: 'groups', groupsFormat: 'array', writeGroup: 'TEST-ASSESSORS',
    tokenRule: { location: 'claim', name: 'tokenClass', value: 'test-only-access' },
    clientRestriction: 'required', clientClaim: 'cid', clientIds: [identity.clientId],
  };
  const env = {
    GUARDIAN_ASSESSMENT_API_ENABLED: 'true', SSP_APPLY_ENABLED: 'true', SSP_APPLY_APPROVED: 'true',
    SSP_APPLY_AUTH_CONTRACT: JSON.stringify(contract),
    GUARDIAN_ASSESSMENT_PLAN_HREF: 'urn:uuid:22222222-2222-4222-8222-222222222222',
  };
  const store = await createFileAssessmentStore(process.env.GUARDIAN_CACHE_DIR || path.join(checkout, 'data/guardian_s3_runs'));
  const handler = createAssessmentHandler({ store, env,
    guard: createGuard(createVerifier(async () => ({ keys: [jwk] })), env),
    getTargetGrant: async key => ['cloudflare#PROD_AEMGovAu', 'okta#AEMGovAu'].includes(key)
      ? { allowed_group_ids: ['TEST-TARGET'], allowed_user_subs: [] } : null,
    logger: { warn() {}, error() {} },
  });
  const gateway = await startAssessmentGateway({ port: 0, handler });
  const session = { userId: 'test-only-local-identity', createdAt: Date.now() };
  try {
    const bearer = await new SignJWT({
      cid: identity.clientId, scp: identity.scopes, groups: ['TEST-ASSESSORS', 'TEST-TARGET'],
      tokenClass: 'test-only-access',
    }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).setIssuer(identity.issuer)
      .setAudience(identity.audience).setSubject('test-only-local-identity').setIssuedAt()
      .setExpirationTime('5m').sign(pair.privateKey);
    const auth = createGuardianService({ readConfig: () => null, readAssessmentIdentity: () => identity,
      keys: async () => pair.publicKey });
    await auth.retain(session, { access_token: bearer, token_type: 'Bearer', expires_in: 300 });
    const targets = [
      { provider: 'cloudflare', targetId: 'PROD_AEMGovAu', label: 'Cloudflare', groups: ['TEST-TARGET'] },
      { provider: 'okta', targetId: 'AEMGovAu', label: 'Okta', groups: ['TEST-TARGET'] },
    ];
    const service = createGuardianAssessmentService({
      readConfig: () => ({ ...identity, local: true, url: `${gateway.baseUrl}/v1/guardian`, targets }),
      authorize: (user, config) => auth.authorize(user, config),
    });
    check((await service.status(session)).ready, 'Real-cache gateway capabilities were not ready.');
    const okta = await runTargets(service, session, targets, source);
    const { receipts } = okta;
    const current = okta.current;
    const authentik = await authentikPass(checkout, source, okta.current);
    check(await sha256Json(source) === originalHash && (await fs.readFile(sourcePath)).equals(originalBytes),
      'The original user-supplied report was changed.');
    if (process.env.GUARDIAN_ACCEPTANCE_OUTPUT) {
      check(path.resolve(process.env.GUARDIAN_ACCEPTANCE_OUTPUT) !== path.resolve(sourcePath), 'Output must not overwrite the source report.');
      await fs.writeFile(process.env.GUARDIAN_ACCEPTANCE_OUTPUT, JSON.stringify(current, null, 2) + '\n', { flag: 'wx' });
    }
    console.info(JSON.stringify({ verification: 'real-cached-evidence-test-only-auth', sourceControls:
      source['system-security-plan']['control-implementation']['implemented-requirements'].length,
    originalUnchanged: true, receipts }));
    console.info(JSON.stringify({ verification: 'real-cached-evidence-authentik-shaped-test-only-auth', sourceControls:
      source['system-security-plan']['control-implementation']['implemented-requirements'].length,
    originalUnchanged: true, matchesOktaShapedResult: true, receipts: authentik.receipts, denials: authentik.denials }));
  } finally {
    revokeDelegatedToken(session);
    await gateway.close();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Real-cache verification failed.');
  process.exitCode = 1;
});
