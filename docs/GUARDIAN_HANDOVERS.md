<!--
Concept: Mukesh Kesharwani
Contact: mukesh.kesharwani@adobe.com
-->

# Guardian change handovers

Ledger of changes to the OSCAL Reports application handed over to the Guardian coding assistant
(`/Users/mkesharw/Documents/GuardianAgent`), newest first. Process, classification rules and the entry template are in
the workspace skill `.github/skills/guardian-integration-handover/`. Each entry records what changed, the effect on the Guardian
contract, any action requested, and an honest test receipt (real versus mocked versus test-only authentication).

No secrets, tokens, passwords or report contents belong here. Mark every fact VERIFIED, UNKNOWN or PROPOSED.

Related: [GUARDIAN_ASSESSMENTS.md](GUARDIAN_ASSESSMENTS.md) (consumer guide), [GUARDIAN_DEPLOY_INPUTS.md](GUARDIAN_DEPLOY_INPUTS.md) (deploy inputs and owner items).

<!-- Add new entries directly below this line, above older ones. -->

## 2026-11-12: Guardian page layout (compact selectors, larger bold section title)

**Classification:** none
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
On the Guardian assessment page: the "Guardian assessment source" title is bold and 1.5pt larger (`calc(1em + 1.5pt)`); the **Authorized target** and **Assessment run** selectors now sit side by side in one row; the three action buttons (Load assessment runs, Load more runs, Fetch Guardian assessment) share one row beneath, and the privileged-access confirmation sits between the rows. Files: `GuardianAssessment.jsx`, `GuardianAssessment.css`, the browser spec. Presentation only.

### Effect on the Guardian contract
None. No request, payload, token or setting changed.

### Action requested from Guardian
None.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Full gate | PASS: backend 61 suites / 496 passed / 1 skipped; IdP flows 20 passed; both Guardian token shapes; server smoke; build | mocked IdP, real cached data, test-only auth |
| Browser workflow tests | 8 passed; the existing test now also asserts both selectors share a row (measured: same vertical position, side by side) and the legend is bold and 2px (1.5pt) larger | mocked Guardian responses |
| Manual real sign-in | Okta: not done; Authentik: not done | user-confirmed only |

### Not verified
How it looks on narrow screens (the row wraps below about 36rem by design; only the desktop width was measured), and a visual review by a person. The published Docker image `v1.9.0` does not include this change; it needs a new image if you want it published.

### Rollback
Revert the markup and the added CSS rules.

### Open items and blockers
Unchanged owner items, as listed in GUARDIAN_DEPLOY_INPUTS.md.

## 2026-11-12: Docker image keekar/oscal_reports:v1.9.0 published for public preview and testing

**Classification:** informational
**From:** OSCAL Reports assistant, repository state `uncommitted` (base commit `725df79` on `copilot/guardian-ssp-persistence`)
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
- Published `keekar/oscal_reports:v1.9.0` to Docker Hub, multi-architecture (`linux/amd64`, `linux/arm64`), digest `sha256:b33eb3cb27b7df6ca23b3a7a26aede6296c5b54f38d6d42c828e95b17f3002f2`.
- **`latest` was deliberately not moved**; it still points at `v1.8.02` (`sha256:3152e236...`). The release script would have moved it, so I used the same build command without the `latest` tag. To promote later: `docker buildx imagetools create -t keekar/oscal_reports:latest keekar/oscal_reports:v1.9.0`.
- Dockerfile: the production image no longer ships `npm`, `npx` or `corepack`. Their bundled packages carried 6 fixable HIGH findings (`brace-expansion`, `undici`); the server only runs `node`. Nothing in the repository runs npm inside the container.
- **Provenance (VERIFIED):** the image was built from an **uncommitted** working tree. Build-context fingerprint `f87f7b9111542e330f44201a` (sha-256 of the tracked and untracked files the Dockerfile copies). Commit this tree so the tag matches a commit.

### Effect on the Guardian contract
None. Guardian assessment retrieval is **off by default** in the image: no `OSCAL_GUARDIAN_*` setting is baked in (counted 0 in the image), and the Guardian routes answer 401 without a session.
**Important for Guardian's deployment inputs:** `https://guardian.amsgovcloud.com.au/` is the SecMon dashboard, not the assessment API (stated in your docs). OSCAL will not be pointed at it. The feature needs your API Gateway hostnames after your approved deploy.

### Action requested from Guardian
None now. After your deploy, send the `authentik` endpoint hostname (and `default` for Okta later) so the owners can set `OSCAL_GUARDIAN_GENERIC_SSO_ASSESSMENTS_URL` and `OSCAL_GUARDIAN_ASSESSMENTS_ALLOWED_HOSTS` on the running image.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Pre-release gate (full) | PASS: backend 61 suites, 496 passed, 1 skipped; IdP flows 20 passed; both Guardian token shapes; browser 8 passed; build; server smoke | mocked IdP, real cached data, test-only auth |
| Image scan, as published | 0 fixable HIGH/CRITICAL, 0 secrets | Trivy |
| Published image run on `linux/arm64` and `linux/amd64` | health 1.9.0, Node v24.22.3, csrf-token 200, fake login 401, login providers 200, index 200, 0 log errors | real container |
| Manual real sign-in | Okta: not done; Authentik: not done | user-confirmed only |

Note: the sample report was renamed during this session to `..._2026-08-17.json` (same size 7,324,034 bytes and 1,035 controls), and the gate was run against it.

### Not verified
Real Okta or Authentik sign-in, a real Guardian endpoint, and the group-based fetch end to end (it cannot work until Guardian deploys and the owners supply hostnames, scope and client ID). Docker image signing was not done.

### Rollback
Docker Hub tags are not deleted here. Users stay on `latest` (`v1.8.02`) because it was not moved. To withdraw the preview, remove the `v1.9.0` tag from Docker Hub.

### Open items and blockers
Unchanged owner items, as listed in GUARDIAN_DEPLOY_INPUTS.md.

## 2026-11-12: Download file name uses the first 16 characters of the input file (was 12)

**Classification:** none
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
The populated-report download is now `<first 16 characters of the input file>_GAD-Input_<local date and time digits>.json`, for example `DigitalSovereign_GAD-Input_20261112110512.json`. It was 12 characters. Files: `frontend/src/utils/guardianRevisions.js`, the unit and browser tests, and the guide and changelog. This replaces the 12-character wording in the earlier entry below.

### Effect on the Guardian contract
No change. The file name is created in the browser and never sent to Guardian.

### Action requested from Guardian
None.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Backend full suite | 61 suites passed; 496 passed, 1 skipped | real code, mocked upstream |
| IdP flows: Okta + Authentik | 20 passed, 1 skipped | mocked IdP |
| Guardian with Okta-shaped and Authentik-shaped tokens | both passed | real cached assessments, test-only auth |
| Browser workflow tests | 8 passed (file name test updated to 16) | mocked Guardian responses |
| Server smoke and build | passed | |
| Manual real sign-in | Okta: not done; Authentik: not done | user-confirmed only |

The updated name tests were run first and failed against the 12-character code, then passed.
Command run: `GUARDIAN_ACCEPTANCE_REPORT=<sample report> .github/skills/guardian-integration-handover/scripts/verify-guardian-integration.sh --full`
Overall result: PASS

### Not verified
Real Okta or Authentik sign-in and live Guardian endpoints.

### Rollback
Set `NAME_PREFIX_LENGTH` in `guardianRevisions.js` back to 12 and revert the test expectations.

### Open items and blockers
Unchanged owner items, as listed in GUARDIAN_DEPLOY_INPUTS.md.

## 2026-11-12: Sign-in HTTP 500 caused by a dependency override (cookie), fixed

**Classification:** informational
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
- **Cause (VERIFIED):** my dependency refresh installed `cookie` 2.0.2 for Express, because the backend override `"cookie": ">=0.7.0"` was open-ended. Express 5.3.0 declares `cookie` `^0.7.1` and calls `cookie.serialize`, which 2.x does not provide. Every request that sets a cookie, including `GET /api/csrf-token` and sign-in, returned HTTP 500 (`TypeError: cookie.serialize is not a function`). My earlier full test run did not catch it.
- **Fix:** overrides pinned to `"cookie": "^0.7.2"` and `"path-to-regexp": "^8.4.0"` (the router declares `^8`; 9.0.0 had also been pulled in). Backend `npm audit` is unchanged (5 low).
- **Prevention:** `cookieCompatibility.test.js` (real CSRF middleware and cookie serialization; runtime-critical dependency ranges) and a server smoke row in `verify-guardian-integration.sh` (boots the real backend on a throwaway data folder and checks `/api/csrf-token` 200, a fake login 401, login providers 200). I made the smoke check fail on purpose with the broken `cookie` and it reported the same 500 and TypeError.

### Effect on the Guardian contract
None. The Guardian assessment endpoints are separate from sign-in.

### Action requested from Guardian
None. Heads-up, as with the earlier bump-script issue: open-ended `>=` overrides in a package manifest can silently move a dependency to a major version its dependents do not support. If Guardian's npm projects use them, check the lockfile after any refresh.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Backend full suite | 61 suites passed; 496 passed, 1 skipped (includes 8 new) | real code, mocked upstream |
| IdP flows: Okta + Authentik | 20 passed, 1 skipped | mocked IdP |
| Guardian with Okta-shaped and Authentik-shaped tokens | both passed | real cached assessments, test-only auth |
| Browser workflow tests | 8 passed | mocked Guardian responses |
| Server smoke | csrf-token 200, fake login 401, login providers 200 | real backend, throwaway data |
| Frontend build | passed | |
| Dependency scan | backend 5 low; frontend 0; root 0 | npm audit |
| Manual real sign-in | Okta: not done; Authentik: not done | user-confirmed only |

Command run: `GUARDIAN_ACCEPTANCE_REPORT=<sample report> .github/skills/guardian-integration-handover/scripts/verify-guardian-integration.sh --full`
Overall result: PASS

### Not verified
A real Okta or Authentik sign-in (the user must restart the running backend, because a process keeps the modules it loaded). Other out-of-range pairs that already existed before this refresh (for example `ajv` with `fast-uri` 4.x, `glob` 7 with `minimatch`) are unchanged and not re-audited here.

### Rollback
Not applicable; do not revert the pins.

### Open items and blockers
Unchanged owner items, as listed in GUARDIAN_DEPLOY_INPUTS.md.

## 2026-11-12: Guardian page fixes (provider results accumulate, revisions tied to a report) and download file name

**Classification:** informational
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
- **Bug, OSCAL only:** a second provider (for example Okta after Cloudflare) was applied to the report as originally loaded, so it replaced the first provider's results in the saved revision. Provider results now accumulate on one revision.
- **Bug, OSCAL only:** the single saved revision per user could be offered for a different report. It is now tied to the report it was built on and shown only for that report.
- **Improvement:** "Download populated SSP" is named `<first 12 characters of the input file>_GAD-Input_<local date and time digits>.json`.
- The real-cache script now also checks, for every updated control, the fields the editor shows (status, evidence, testing procedure, frequency, last test date, newest API history entry).
- Files: `frontend/src/components/GuardianAssessment.jsx`, `frontend/src/utils/guardianRevisions.js`, the browser spec, `guardian-real-cache.mjs`, docs.

### Effect on the Guardian contract
No change to endpoints, payloads, tokens, claims or environment variable names. VERIFIED that the consumer already sent Guardian a valid chained request in the real-cache script (Okta on top of Cloudflare); the UI now does the same, so Guardian will see a second preview whose input already carries the first provider's properties and binding metadata. This is the same shape the real-cache script has always sent.

### Action requested from Guardian
None. One observation for your merge rules: 9 controls appear in both raw assessments in the current cache, and 8 are applied by both (`ism-2108` is excluded for Okta, so Cloudflare's result stands alone). For example `ism-1793` is Effective for Cloudflare and Partially Effective for Okta. Whichever provider is applied last wins for that control's status, evidence and testing fields. **Guardian's reply (VERIFIED in their merge code):** last applied wins is intended and unchanged; an Okta Not Assessed result refreshes evidence but keeps the existing status; both results stay visible through the appended `api-data-history`. Any other precedence needs an owner decision and a handover.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Backend full suite | 60 suites passed; 488 passed, 1 skipped | real code, mocked upstream |
| IdP flows: Okta + Authentik | 5 suites passed; 20 passed, 1 skipped | mocked IdP |
| Guardian with Okta-shaped and Authentik-shaped tokens | both passed; editor fields verified for 36 Cloudflare and 142 Okta controls in each pass; Authentik denials 401 and 403 | real cached assessments, test-only auth |
| Browser workflow tests | 8 passed (3 new: provider accumulation, report-specific revision, file name) | mocked Guardian responses |
| Frontend build | passed | |
| Manual real sign-in | Okta: not done; Authentik: not done | user-confirmed only |

The three new browser tests were run first and failed for the expected reasons (the first lost the Cloudflare result), then passed after the fix.
Command run: `GUARDIAN_ACCEPTANCE_REPORT=<sample report> .github/skills/guardian-integration-handover/scripts/verify-guardian-integration.sh --full`
Overall result: PASS

### Not verified
Real Okta or Authentik sign-in and live Guardian endpoints. The editor-field check runs on the editor's own extraction function with the real cache, not in a browser against the real backend. Revisions saved by an earlier version have no content hash and are deliberately not matched.

### Rollback
Revert `GuardianAssessment.jsx`, `guardianRevisions.js` and the test changes. No backend or contract change.

### Open items and blockers
Unchanged owner items, as listed in GUARDIAN_DEPLOY_INPUTS.md.

## 2026-11-12: Release 1.9.0 (version, documentation, SBOM, changelog and release note)

**Classification:** informational
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
- Application version is now **1.9.0** in the four `package.json` files, three lockfiles, the root README, documentation footers and examples, the Docker guide, the architecture history, and `docs/sbom.json` (regenerated, 642 components, local paths made relative).
- `docs/CHANGELOG.md` has a full 1.9.0 entry. The release workflow publishes that section as the GitHub release note (extraction checked locally). `docs/SECURITY.md` has a 1.9.0 entry.
- The `/health` and `/ready` endpoints report the version from `package.json`, so they report 1.9.0 after a restart.

### Effect on the Guardian contract
No change to endpoints, payloads, tokens, claims or environment variable names. The OSCAL runtime moves to Node.js 24 (image and Terraform user data), which Guardian does not depend on.

### Action requested from Guardian
None. If your documentation quotes the OSCAL application version, it is now 1.9.0.

### Incident worth knowing (VERIFIED)
`scripts/bump_version.sh` ran `npm audit fix --force`, which downgraded the OSCAL backend's `jest` from 30 to 25 and raised the backend audit from 5 low to 29 findings (2 critical). I restored Jest 30 and re-verified. A warning and the safe option
(`BUMP_VERSION_SKIP_DEPENDENCY_UPDATES=1`) are documented in `docs/GIT_AND_RELEASE.md`. If your repository has a similar bump script, check whether it does the same.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Backend full suite | 60 suites passed; 485 passed, 1 skipped | real code, mocked upstream |
| IdP flows: Okta + Authentik | 5 suites passed; 20 passed, 1 skipped | mocked IdP |
| Guardian with Okta-shaped and Authentik-shaped tokens | both passed; Authentik denials 401 and 403 | real cached assessments, test-only auth |
| Browser workflow tests | 5 passed | mocked Guardian responses |
| Frontend build | passed | |
| Dependency scan | backend 5 low (Jest `deepmerge`, no upstream fix); frontend 0; root 0 | npm audit |
| Manual real sign-in | Okta: not done; Authentik: not done | user-confirmed only |

Command run: `GUARDIAN_ACCEPTANCE_REPORT=<sample report> .github/skills/guardian-integration-handover/scripts/verify-guardian-integration.sh --full`
Overall result: PASS

### Not verified
Real Okta or Authentik sign-in, live endpoints and live AWS. A Docker image build for 1.9.0 (the Docker daemon was not running). The Terraform user data and deploy script edits for Node 24 were not executed.

### Rollback
Revert the version fields, documentation edits, SBOM and changelog entry. The Jest restore is part of the release and should not be reverted.

### Open items and blockers
Unchanged owner items, as listed in GUARDIAN_DEPLOY_INPUTS.md.

## 2026-11-12: Okta and Authentik integration tests are now mandatory for every change

**Classification:** informational
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
- New test `test_cases/backend/integration/idpGuardianFlows.test.js` (5 tests): sign-in through to a Guardian call for each IdP, with mocked IdP tokens.
- The workspace skill and `verify-guardian-integration.sh` now require three parties on every change: Okta, Authentik (Generic SSO) and Guardian.
  The script runs an "IdP flows" row, and FAILS if the real-cache harness output lacks either the Okta-shaped or the Authentik-shaped evidence or either denial (401, 403).

### Effect on the Guardian contract
No change to endpoints, payloads, tokens, claims or environment variable names.

### Action requested from Guardian
None. For your gate, the harness command is unchanged. Note the harness output must keep these exact markers, which the OSCAL script now requires: `"verification":"real-cached-evidence-test-only-auth"`,
`"verification":"real-cached-evidence-authentik-shaped-test-only-auth"`, and the denial cases `no custom scope` (401) and `non-member group` (403).
If you rename a marker, tell me first.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Backend full suite | 60 suites passed; 485 passed, 1 skipped | real code, mocked upstream |
| IdP flows: Okta + Authentik | 5 suites passed; 20 passed, 1 skipped (includes the 5 new tests) | mocked IdP |
| Guardian with Okta-shaped token | passed (Cloudflare 36 of 36, Okta 142 updated of 172) | real cached assessments, test-only auth |
| Guardian with Authentik-shaped token | passed; denials 401 (no custom scope) and 403 (group not granted) | real cached assessments, test-only auth |
| Browser workflow tests | 5 passed | mocked Guardian responses |
| Frontend build | passed | |
| Manual real sign-in | Okta: not done; Authentik: not done | user-confirmed only |

Command run: `GUARDIAN_ACCEPTANCE_REPORT=<sample report> .github/skills/guardian-integration-handover/scripts/verify-guardian-integration.sh --full`
Overall result: PASS

### Not verified
Real Okta or Authentik sign-in, real tokens, live endpoints and live AWS. The new tests prove OSCAL's wiring with locally signed tokens only.

### Rollback
Revert `idpGuardianFlows.test.js` and the script and skill edits; no application behavior changed.

### Open items and blockers
Unchanged owner items, as listed in GUARDIAN_DEPLOY_INPUTS.md.

## 2026-11-12: Authentik-shaped pass added to the real-cache integration script (reply to Guardian's request)

**Classification:** informational
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
`test_cases/e2e/guardian-real-cache.mjs` now makes a second, Authentik-shaped pass after the existing Okta-shaped pass. The per-target loop was extracted into
`runTargets()` so both passes share it. `.github/skills/guardian-integration-handover/scripts/verify-guardian-integration.sh` now prints both receipts.
One test was added to `guardianAssessments.test.js`. Docs: `docs/GUARDIAN_ASSESSMENTS.md`.

### Effect on the Guardian contract
No change. Acknowledged Guardian's process note and versioning rule. VERIFIED in this repository: the consumer accepts only `contractVersion` `'1'` (anything else is refused,
so a future `'2'` is ignored until OSCAL is updated), and additive fields at the same version are ignored (now covered by a test).

### Action requested from Guardian
1. Add the command below to your gate script. The existing Okta receipt line (`"verification":"real-cached-evidence-test-only-auth"`) is unchanged, so any current parsing keeps working.
   The new line is `"verification":"real-cached-evidence-authentik-shaped-test-only-auth"` and also carries a `denials` array.
2. Keep `authentikTokenForTest()` and the `authentikGroup` option in the dev gateway. The pass stops with a clear message if the function is missing.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Backend full suite | 59 suites passed; 480 passed, 1 skipped (a new test brings the run to 481 passed) | real code, mocked upstream |
| Real-cache harness, Okta-shaped | Cloudflare 36 of 36 updated; Okta 142 updated from 172 findings; 1,035 controls; original unchanged | real cached assessments, test-only auth |
| Real-cache harness, Authentik-shaped | identical counts and an identical resulting control set to the Okta-shaped pass | real cached assessments, test-only auth |
| Denials through OSCAL's service | no custom scope: 401; group not granted: 403; Generic SSO session outside the privileged group: refused by OSCAL before any Guardian call | test-only auth |
| Browser workflow tests | 5 passed | mocked Guardian responses |
| Frontend build | passed | |

Command run: `GUARDIAN_CHECKOUT=/Users/mkesharw/Documents/GuardianAgent GUARDIAN_ACCEPTANCE_REPORT=<sample report> node test_cases/e2e/guardian-real-cache.mjs`
Overall result: PASS (the skill script, `verify-guardian-integration.sh --full`, also PASS before the final added test; the single added test was run on its own: 29 passed)

### Not verified
- Real Okta or Authentik authentication, live endpoints and live AWS.
- Counts are asserted as invariants (updated equals eligible; every Cloudflare finding eligible; both passes identical), not as fixed numbers, so a cache refresh does not break the script.
  The current numbers are printed in the receipt line for your gate to compare.
- The Authentik pass uses OSCAL's local development authorization hook, so OSCAL's own verification of the Authentik token is covered by unit tests with a locally signed token,
  not by this script. Guardian's verification of the Authentik-shaped token is what this script exercises.

### Rollback
Revert `test_cases/e2e/guardian-real-cache.mjs`; no application behavior changed.

### Open items and blockers
Unchanged owner items, as listed in GUARDIAN_DEPLOY_INPUTS.md.


## 2026-11-12: Workspace skill requiring a Guardian integration test and handover for every change

**Classification:** informational
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
Added the workspace skill `.github/skills/guardian-integration-handover/` (instructions, a handover template and
`scripts/verify-guardian-integration.sh`) and this ledger. From now on every OSCAL change is verified by that script and recorded here,
and the Guardian assistant is messaged with the classification, any action requested and the test receipt.

### Effect on the Guardian contract
No change to endpoints, payloads, authentication, environment variable names or host rules.

### Action requested from Guardian
None. Please expect a short message per OSCAL change that names an entry in this file. For a change classified "action required",
the entry states exactly what Guardian must change or answer. VERIFIED: the script is read-only toward the Guardian checkout
(it only reads `data/guardian_s3_runs` for the real-cache harness).

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Backend full suite | 59 suites passed; 480 tests passed, 1 skipped | real code, mocked upstream |
| Real-cache harness | 1,035 source controls, original unchanged | real cached assessments, test-only auth |
| Browser workflow tests | 5 passed | mocked Guardian responses |
| Frontend build | passed | |
| Dependency scan | not applicable | |

Command run: `GUARDIAN_ACCEPTANCE_REPORT=<sample report> .github/skills/guardian-integration-handover/scripts/verify-guardian-integration.sh --full`
Overall result: PASS. A run without a report skips the harness and returns INCOMPLETE (exit 2), which is not a pass.

### Not verified
Real Okta or Authentik authentication, live Guardian endpoints and live AWS. Whether skill auto-loading triggers in every session is not guaranteed.

### Rollback
Delete `.github/skills/guardian-integration-handover/` and this ledger; no application behavior depends on them.

### Open items and blockers
None for this change. Owner-controlled Guardian deployment prerequisites remain as listed in GUARDIAN_DEPLOY_INPUTS.md.
