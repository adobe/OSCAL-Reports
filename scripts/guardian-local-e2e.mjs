/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 *
 * LOCAL END-TO-END ONLY. Starts Guardian's development assessment gateway (real
 * cached Cloudflare/Okta assessments, test-only token issuer) and the normal OSCAL
 * backend in this one process, wired together on the loopback interface.
 * This is NOT real authentication and refuses to run with NODE_ENV=production.
 * The test token stays in this process and is never printed or sent to the browser.
 *
 *   npm run dev:guardian-local        (then, in another terminal: npm run dev:frontend)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { localGuardianEnv } from './lib/localGuardianEnv.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.env.NODE_ENV === 'production') { throw new Error('Local Guardian E2E mode cannot run in production.'); }

const checkout = process.env.GUARDIAN_CHECKOUT || path.resolve(root, '..', 'GuardianAgent');
const runsDir = process.env.GUARDIAN_ASSESSMENT_RUNS_DIR || path.join(checkout, 'data', 'guardian_s3_runs');
const gatewayModule = path.join(checkout, 'scripts', 'guardian-assessment-dev-gateway.mjs');
if (!fs.existsSync(gatewayModule) || !fs.existsSync(runsDir)) {
  throw new Error(`Guardian checkout or cached runs not found. Set GUARDIAN_CHECKOUT (looked for ${gatewayModule} and ${runsDir}).`);
}

const group = (process.env.OSCAL_GUARDIAN_PRIVILEGED_GROUPS || 'OSCAL_Platform Admin').split(',')[0].trim();
const grants = (process.env.GUARDIAN_LOCAL_TARGETS || 'cloudflare#PROD_AEMGovAu,okta#AEMGovAu').split(',');
const { startDevAssessmentGateway } = await import(pathToFileURL(gatewayModule).href);
const dev = await startDevAssessmentGateway({ runsDir, targets: grants, acknowledgeNonProduction: true, port: 0, authentikGroup: group });

Object.assign(process.env, localGuardianEnv({ baseUrl: dev.baseUrl, grants, group }));

process.chdir(path.join(root, 'backend'));
const { registerLocalDevAuthorization } = await import(pathToFileURL(path.join(root, 'backend', 'guardianAssessments.js')).href);
registerLocalDevAuthorization(async () => ({ token: dev.authentikTokenForTest(), payload: { groups: [group] } }));

console.warn('\n*** LOCAL GUARDIAN E2E MODE: real cached assessments, TEST-ONLY authentication. Not for shared environments. ***\n');
process.on('SIGINT', () => { dev.close().finally(() => process.exit(0)); });
await import(pathToFileURL(path.join(root, 'backend', 'server.js')).href);
