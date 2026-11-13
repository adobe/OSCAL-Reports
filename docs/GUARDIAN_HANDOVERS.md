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

## 2026-11-13: Release 2.1.1 (versions, documentation, restored script modes, test helper fixes)

**Classification:** none
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
Version 2.1.0 to 2.1.1 in the four `package.json` files, the lockfile roots and the README footer; changelog, README, docs index and the stale 1.9.0 markers refreshed; the two-provider rules are described as released. The executable bit was restored on 42 scripts (lost in a GitHub merge on `Main`), and the repo test helper now uses Jest 30's `--testPathPatterns` and checks for the current version's changelog entry. No application code, request, payload, token or setting changed.

### Effect on the Guardian contract
None.

### Action requested from Guardian
None.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| `test_cases/scripts/run-all-tests.sh` | the four Jest checks that failed on the old flag now pass; the changelog check is updated | real |
| Full gate | see the gate run for this change | mocked, real cached data, TEST-ONLY authentication |

### Rollback
Revert the release commit.

## 2026-11-13: CodeQL useless-assignment cleanups (no behaviour change)

**Classification:** none
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
Six dead assignments flagged by CodeQL were removed: `backend/controlSuggestionEngine.js` (unused `aiAttempted`), `backend/server.js` (initial `errorMessage` in two error handlers), `backend/oscalValidatorAJV.js` (`definitions`) and `test_cases/e2e/guardian-real-cache.mjs` (`current`). None touches the Guardian code path; no request, payload, token or setting changed.

### Effect on the Guardian contract
None.

### Action requested from Guardian
None.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Full gate | see the gate run for this change (backend suites, both Guardian token shapes against real cached data with test-only authentication, mocked browser tests, build) | mocked, real cached data |

### Rollback
Revert the four files.

## 2026-11-13: Ack of Guardian's two-provider deploy; OSCAL real-data assertion updated

**Classification:** none (consumer test update; one open item for Guardian)
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
Guardian deployed the two-provider rules at 17:41 AEDT (commit 1da79b4). OSCAL's real-data check `test_cases/e2e/guardian-real-cache.mjs` failed on its old last-wins assertion ("ism-1793: status was not applied"), as expected. It now expects, for every updated control: the most negative ASSESSED status across the latest result of each other provider (taken from earlier applies in the same run and from the report's own assessment history), a labelled Evidence section per provider, and Testing Method lines for providers applied earlier in the run; single-provider controls are unchanged. A finding of Not Assessed or Not Applicable does not decide the status in the assertion. No other OSCAL code changed.

### Effect on the Guardian contract
None.

### Action requested from Guardian
Resolved the same day: Guardian then deployed the correction at 17:44 AEDT (Not Applicable from Guardian is never written, the report's own value or another provider's assessed status wins; Not Assessed never beats an assessed status). OSCAL's check now asserts both. The real cache holds no Not Applicable result (Cloudflare 13 and Okta 34 are Not Assessed), so the Not Applicable branch is covered by Guardian's own tests, not by real data.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Real-cache check, Okta-shaped and Authentik-shaped (both providers, real cached runs, real report) | PASS with the new assertion (failed with the old one) | real cached data, TEST-ONLY authentication |
| Not Applicable keeping the report's value; Not Assessed versus an assessed status | asserted in the check; no real Not Applicable result exists in the cache | real cached data, TEST-ONLY authentication |

### Rollback
Restore the previous assertion (valid only for last-wins).

## 2026-11-13: ACTION REQUIRED (Guardian): two-provider merge rules (amend Evidence and Testing Method, worst status wins)

**Classification:** action required (Guardian code and deploy; no contract change; owner decision)
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
Your earlier note recorded "last applied provider wins" and asked for an owner decision before any precedence change. The owner has decided: when Okta and Cloudflare both assess a control, (1) Evidence Location and Testing Method are AMENDED with both providers' data instead of replaced, (2) Implementation Status is the MOST NEGATIVE ASSESSED result of the providers' latest results (Not Implemented, then Ineffective, then Partially Effective, then Effective; the owner's examples: Ineffective with Not Implemented gives Not Implemented, Ineffective with Effective gives Ineffective); Not Assessed never beats an assessed status; Not Applicable from Guardian is never written and the value already in the OSCAL report wins (owner clarification, same day), (3) every other field keeps last-applied-wins (testing-frequency, last-test-date; api-data-history is appended as now), (4) Additional Notes (`remarks`), Consumer Guidance and Control Type stay untouched. OSCAL changes no code: it applies your verified patch, enforces no length limit on property text, and its docs now describe the rule (`docs/GUARDIAN_ASSESSMENTS.md`, "Two providers").

### Effect on the Guardian contract
None to routes, payloads, claims or contractVersion "1": only the content of existing properties. Keep each preview response under your 5 MiB limit (see sizes below).

### Action requested from Guardian
Implement in the shared merge (`scripts/lib/guardian-ssp-merge.js`, used by the API and the CLI), with tests, a reviewed apply and a deploy:
1. **Detecting the other provider:** from `api-data-history` entries (provider field; the latest applied entry per provider) in the SSP the merge is given. Apply the rules only when another provider already has an entry for the control.
2. **Evidence:** when a second provider joins, rewrite as one section per provider, for example `=== Okta (target AEMGovAu, run 2026-11-10T00:37:20Z) ===` then the text, a blank line, `=== Cloudflare (target PROD_AEMGovAu, run ...) ===` then the text. Order: Okta then Cloudflare. Re-applying a provider replaces only its own section. Existing unlabelled evidence from the other provider (for example written by the CLI before sections existed) is wrapped as that provider's section, identified from history. Single-provider controls keep today's format. Per-section cap 32000 characters, whole text 64000 (truncate each section with a visible marker; do not drop a provider).
3. **Testing Method:** one line per provider (your existing "Automated assessment: ... Okta ..." and "... (Cloudflare API snapshot) ..." lines), newline separated; re-applying replaces only that provider's line.
4. **Implementation Status** (owner clarification replaces the earlier neutral-status assumption): for the control, take each provider's latest applied status (the new one for the provider being applied, the history for the others) and write the worst ASSESSED one. Rank 5 not-implemented, 4 ineffective, 3 partially-effective, 2 effective. `not-assessed` never beats an assessed status (the assessed one wins). If no provider gives an assessed status, today's behaviour stays (Okta "Not Assessed" keeps the existing value; Cloudflare "Not Assessed" is written as today). `not-applicable` from Guardian is NEVER written: the value already in the OSCAL report wins (this applies to every control, one provider or two; it is a change from today, where Guardian's Not Applicable overwrote the status). If another provider already set an assessed status and this one says Not Applicable, that assessed status stands.
5. **Rest:** last applied wins for `testing-frequency` and `last-test-date`. History appended as today.
6. **Behaviour to test:** Okta then Cloudflare and Cloudflare then Okta give the same status and the same section order; applying the same provider and run twice is idempotent; improving one provider's result later lowers the combined severity correctly because only the latest per provider counts; legacy unlabelled evidence; a Not Applicable result leaving the existing value untouched (single provider and two providers); Not Assessed versus an assessed status; truncation. Tell the owner and OSCAL when deployed; OSCAL will rerun its real-data gate and update any assertion that assumed last-wins.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| OSCAL code change | none needed | n/a |
| Docs updated to describe the rule as pending Guardian's deploy | done | docs |
| Real merge with the new rules | NOT done; Guardian to implement | n/a |

### Rollback
OSCAL: revert the docs paragraph. Guardian: revert the merge change (last-applied-wins returns).

## 2026-11-13: Ack of Guardian's Testing Method deploy; Jest downgrade fixed again (consumer gate unblocked)

**Classification:** none (acknowledgement and OSCAL toolchain repair)
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
Guardian deployed the new Testing Method wording (run timestamp from the assessment's generated-at, runId in brackets; accepted as is, no change requested). Guardian also reported that OSCAL's consumer tests failed at start-up: the owner's 2.1.0 version bump ran `scripts/bump_version.sh` with its default `npm audit fix --force`, which downgraded the backend dev dependency Jest from 30 to 25 again (production dependencies unchanged; checked all three lockfiles). Fixed: Jest 30 and the backend lockfile are restored at version 2.1.0 and `npm ci` was rerun. To stop a third occurrence the bump script now runs plain `npm audit fix` by default and `--force` only with `BUMP_VERSION_AUDIT_FORCE=1` (same pattern as Guardian's script); checked with a stub `npm` in a throwaway copy. 2.0.1 was never released; its changes are part of 2.1.0.

### Effect on the Guardian contract
None.

### Action requested from Guardian
None. Please rerun your consumer gate.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Bump script: default runs `npm audit fix`, `BUMP_VERSION_AUDIT_FORCE=1` runs `--force` | PASS | stub npm, throwaway copy |
| Jest 30 installed; backend suite | see the gate line below | local |

### Rollback
Revert `scripts/bump_version.sh` (the old default was `--force`).

## 2026-11-13: ACTION REQUIRED (Guardian): Testing Method wording parity with the command line; Control Type unchanged

**Classification:** action required (Guardian code and deploy; no contract or OSCAL change)
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
The owner compared a populated report with its reference and expected the applied assessment to carry what the command line writes. Analysis (OSCAL side, with the owner's two files, plus Guardian's own merge run over both Digital Sovereign 2026-10-12 and AEMGovAu 2026-07-24 using the cached 2026-11-10 runs): apply changes `testing-procedure`, `last-test-date`, `evidence`, `implementation-status` and `api-data-history` in the 170 assessed controls (no old "Automated assessment ... s3://" text remains, 0 of 170), and `testing-frequency` where it differs. Two differences from the command line remain: (1) `testing-procedure` wording: the API path writes "Guardian strict <provider> API probes; existing run <runId>, target <targetId>." while the command line writes "Automated assessment: Keekar ACSC ISM Guardian strict Okta Management API probes. Target: <target>; cell: <cell label>; source: s3://<bucket>/<key>"; (2) `control-type` is written by neither (your merge never writes it). Owner decisions: wording style B, Control Type unchanged.

### Effect on the Guardian contract
None to routes, payloads, claims or contractVersion "1": only the text value of the `testing-procedure` property changes. OSCAL places no constraint on it.

### Action requested from Guardian
Change the `testingProcedure` option in `scripts/lib/guardian-assessment-api.mjs` (the API preview), with tests, a reviewed apply and a deploy, to:
- Okta: `Automated assessment: Keekar ACSC ISM Guardian strict Okta Management API probes. Target: <targetId>; cell: <cell label>; run: <run timestamp> (<runId>)`
- Cloudflare: `Automated assessment: Keekar ACSC ISM Guardian strict probes (Cloudflare API snapshot). Target: <targetId>; run: <run timestamp> (<runId>)`
- `<run timestamp>` is the run's own timestamp (for example `2026-11-10T00:37:20Z`, the assessment `generated-at` or the run folder name); `<cell label>` is the Okta binding's cell label (for example `OK8 Cell (APAC)`).
- No storage detail: no `s3://` path, bucket, key or account ID in the text. Do not change `control-type`.
- Please tell the owner and OSCAL when deployed; no OSCAL release is needed.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Field-by-field comparison of the owner's populated file against its reference; Guardian's merge over both reports | done as described above | real files, real cached runs, no network |
| OSCAL code or test change | none needed | n/a |

### Rollback
Not applicable on the OSCAL side (documentation only). Guardian: revert the wording change.

## 2026-11-13: More bold captions on the Guardian page

**Classification:** none
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
Guardian Agent assessment page only: the captions "Using the report you just loaded:", "Authorized target", "Assessment run" and "Provider results applied so far:" are bold (`frontend/src/components/GuardianAssessment.jsx`). Display only; no request, payload, token or setting changed.

### Effect on the Guardian contract
None.

### Action requested from Guardian
None.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Browser tests assert bold weight (at least 600) for all four captions | PASS (failed before); 12 passed | mocked Guardian |

### Rollback
Revert the four `<strong>` wrappers.

## 2026-11-13: Guardian page footer

**Classification:** none
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
The Guardian Agent assessment page returned only its own component, so the standard footer was missing, and (follow-up the same day) so were the application header and any way to leave the page. `frontend/src/App.jsx` now wraps it in the same layout, header (title and Settings button) and footer as the other pages and adds a **Start Over** button (confirmation, then back to the start page; saved revisions untouched). Display and navigation only.

### Effect on the Guardian contract
None. No request, payload, token or setting changed.

### Action requested from Guardian
None.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Browser tests: footer with the author credit, application header and Start Over (decline stays, accept returns to the start) on the Guardian page | PASS (failed before); all 12 browser tests pass | mocked Guardian |

### Rollback
Revert the wrapper in `frontend/src/App.jsx`.

## 2026-11-13: NAS fix: container DNS (private answer for the SSO host); key-fetch problems named in 2.0.1

**Classification:** none (deployment and diagnostics; no contract change)
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
On the NAS the page still said the sign-in was no longer valid. Container log: `guardian_generic_sso_token_retention` failure `token_rejected`. Cause: the NAS container resolved `sso.keekar.au` to `10.100.3.74` (the host's resolvers AdGuard, 8.8.8.8 and 1.1.1.1 return the rewritten answer, as on the owner's laptop earlier), and OSCAL's key fetch refuses non-public addresses (same SSRF guard as yours), so the token was never kept. Fix at the owner's request: the TrueNAS app `oscal-reporter` now uses the LAN resolver 192.168.1.200 only (`dns_config.nameservers`), which returns `103.160.130.243`; verified from the container: it resolves to the public address, the JWKS fetch passes the guard, other lookups (execute-api, registry) work. Backups of the app settings are in `~/oscal-backups/` on the NAS. In the repo (2.0.1): the log reason is now `jwks_host_not_public` or `jwks_unreachable`, the page explains them, the TrueNAS helper has `--dns`, compose has a commented `dns:` example, and the guide has a troubleshooting row. The first attempt with two servers failed because TrueNAS reorders them (`1.1.1.1` first), so list only the intended server.

### Effect on the Guardian contract
None.

### Action requested from Guardian
None. Real fetch from the NAS not yet verified; if it returns a status, the owner will send it.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| New tests: key host not public / unreachable / generic reasons, user-facing text; `--dns` parsing | PASS (failed before) | local, mocked key fetch plus a real `localhost` refusal |
| NAS container after the change: resolves to 103.160.130.243, key fetch OK, healthy | PASS | real container |
| Real Authentik sign-in and fetch from the NAS | NOT verified | n/a |

### Rollback
NAS: set the app's DNS servers back to empty in the TrueNAS UI (or restore the backup app settings). Repo: revert the changes listed.

## 2026-11-13: NAS deployment configured for Guardian; 2.0.1 prepared (automatic Guardian scope, TrueNAS helper)

**Classification:** none (consumer configuration; no contract change). Records a change to the owner's NAS.
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
1. **NAS (nas.keekar.au, TrueNAS app `oscal-reporter`, image `keekar/oscal_reports:latest` = 2.0.0):** at the owner's request, the app's environment gained the same eight settings that work on the laptop (issuer, client ID, Guardian enabled, Authentik endpoint URL, allowed host, scope `guardian-assessments`, max token age 3600, targets JSON), and the saved Generic SSO scope gained `guardian-assessments`. Cause of the "not configured" message there: the app was started with none of them. Backups of the app settings and `config.json` are in `~/oscal-backups/` on the NAS (root-owned, 0700). Verified from inside the container: it reads all values; the Guardian endpoint answers 401 without a token and the SSO discovery is reachable. Real fetch from the NAS: NOT yet verified.
2. **2.0.1 (local image built, not pushed):** the Guardian scope is requested automatically at Generic SSO sign-in while the feature is enabled; helper `scripts/truenas_apply_app_env.py` plus guide section 4a for TrueNAS Apps; Jest 30 restored after `bump_version.sh` downgraded it to 25 (production dependencies unchanged, 2.0.0 image unaffected).

### Effect on the Guardian contract
None. The NAS is simply another OSCAL consumer of the same endpoint, with the same issuer, audience, scope and token-lifetime limit (3600).

### Action requested from Guardian
None. Note a second origin (the NAS) will now call your endpoint; no allow-listing by source address exists in your contract.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Full gate on Jest 30 | PASS: backend 64 suites / 590 passed / 1 skipped; IdP flows 42 passed; both token shapes; browser 11 passed; build; isolated smoke | mocked IdP, real cached data, test-only auth |
| New tests: automatic scope (4 cases), TrueNAS helper (6 cases) | PASS (the helper test caught a real bug against the live NAS app) | local |
| Local image v2.0.1: healthy, reports 2.0.1, scope added automatically, npm absent | PASS | real container |
| NAS container: settings read, endpoint 401 without token, SSO reachable | PASS | real container |
| Real Authentik sign-in and fetch from the NAS | NOT verified | n/a |

### Rollback
NAS: restore the app settings from the backup (or remove the added variables in the TrueNAS UI) and the saved scope from the `config.json` backup. Repo: revert the changes listed; deployments pass no settings and the Guardian feature stays off.

## 2026-11-13: Docker / TrueNAS deployment templates for Generic SSO and Guardian

**Classification:** none (consumer configuration packaging; no behaviour or contract change)
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
After the owner confirmed the real fetch works, the same settings were made deployable in a container: template `.env.docker.example` (placeholders only), `docker-compose.yml` passes the variables (empty means off), `scripts/install_from_dockerhub.sh` passes `.env.docker` with `--env-file` when present, new guide `docs/GUARDIAN_SSO_DOCKER_DEPLOYMENT.md`, the targets JSON also accepted when wrapped in single quotes, and a note that Guardian's `maxTokenAgeSeconds` must equal `OSCAL_GUARDIAN_GENERIC_SSO_MAX_TOKEN_AGE_SECONDS`. Variable names, values and the contract are unchanged.

### Effect on the Guardian contract
None. For your docs: the OSCAL consumer variables for a container are listed in the guide; the Okta delegated variables are not in the template.

### Action requested from Guardian
None.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Image built from this checkout and run with `docker compose` from a filled-in copy of the template: health OK; the container's backend read the issuer, key URL, audience, scope, max age 3600 and both targets | PASS | real container, fake example hosts and group names |
| `docker run --env-file` with the single-quoted targets JSON | PASS | real container |
| `docker compose config` with the template, and with no env file (all empty or defaults) | PASS | local |
| Install script syntax and the empty-array expansion in bash 3.2 and 5 | PASS | local |
| Real Authentik/Guardian call from a container | NOT verified | n/a |

### Rollback
Revert the template, compose and install-script changes; deployments pass no settings (the Guardian feature stays off).

## 2026-11-13: Access-token group names logged for Guardian's write_group_denied

**Classification:** none (diagnostics; answers Guardian's request for the group names)
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
Guardian reported the owner's 15:24 AEDT call reached its Lambda: token verified, scope passed, then 403 `write_group_denied` because the access token's `groups` claim lacks `authentik:OSCAL_Platform Admin` (and Guardian does not log names). OSCAL now logs, at sign-in, every group name in the verified access token's `groups` claim as `token.groups` (up to 50, each cut at 100 characters, plus `token.groups_truncated`), with `token.group_count`, `token.privileged_groups` and `token.matches_target_group`. Names only, never the token. The owner will read them from OSCAL's terminal and give them to you; OSCAL does not send them to Guardian. OSCAL's claim name is `groups`.

### Effect on the Guardian contract
None. No OSCAL setting for the contract changed.

### Action requested from Guardian
None now. When the owner supplies the exact name(s), correct `writeGroup` and the target grants through your reviewed apply, and tell the owner and OSCAL. Note OSCAL's own target groups are configured as `OSCAL_Platform Admin` and `Platform Admin` (no `authentik:` prefix; the prefix is Guardian's namespace), and OSCAL's privileged check is a case-insensitive "contains Platform Admin".

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Group names logged (all names, cap of 50 with a flag, no token text) | PASS | locally signed test tokens |
| Real group names in the Authentik access token | UNKNOWN until the owner signs in and reads the log | n/a |

### Rollback
Revert the added log fields in `backend/guardianAssessments.js`.

## 2026-11-13: First accepted token, Guardian answered 403; OSCAL logs access-token group matches

**Classification:** none (diagnostics; asks Guardian to read one log line)
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
After your limit change the owner signed in fresh: OSCAL kept the token (`token.lifetime_seconds` 3600, `token.max_age_seconds` 3600) and the first call (status, `GET /v1/guardian/capabilities`, about 15:25 AEDT) returned HTTP 403 from Guardian. The authorizer and the token checks therefore passed and a permission decision denied it. OSCAL's sign-in log now also records `token.group_count`, `token.privileged_groups` (group names containing "Platform Admin") and `token.matches_target_group` (whether any access-token group equals a group configured for an OSCAL target). Names only.

### Effect on the Guardian contract
None.

### Action requested from Guardian
Please read your Lambda log for that call (about 15:25 AEDT, `capabilities`) and tell the owner which 403 reason applied (for example `invalid_permissions`, or no grant for the token's groups). OSCAL's targets list the groups `OSCAL_Platform Admin` and `Platform Admin`; your grants are `authentik:OSCAL_Platform Admin` and `authentik:Platform Admin`.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Group-match log (names only, no token, unrelated groups not logged) | PASS (failed before) | locally signed test token |
| Real fetch | 403 from Guardian; cause pending your log | real, owner-run |

### Rollback
Revert the added log fields in `backend/guardianAssessments.js`.

## 2026-11-13: ACTION REQUIRED: raise Guardian maxTokenAgeSeconds to 3600 (owner decision)

**Classification:** action required (Guardian configuration; no contract change)
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
OSCAL's sign-in log, taken from a real Authentik token, shows `token.lifetime_seconds` 3600 (the number only). Guardian's Lambda rejects a token whose lifetime `exp - iat` exceeds `maxTokenAgeSeconds` (600), so every Authentik token is rejected. The owner chose Option B: raise Guardian's limit rather than shorten the Authentik access-token validity. OSCAL's `.env` now sets `OSCAL_GUARDIAN_GENERIC_SSO_MAX_TOKEN_AGE_SECONDS=3600` so it keeps the token for the longer window.

### Effect on the Guardian contract
None to routes, payloads, claims, scopes, hosts or contractVersion "1". It changes one Guardian security parameter for the Authentik issuer.

### Action requested from Guardian
1. Set `maxTokenAgeSeconds` to 3600 for the Authentik issuer (the maximum Guardian allows) through your normal reviewed change. The owner approves this security decision; please say in your receipt that the owner request is the approval.
2. Redeploy the Lambda(s) and confirm the effective value; confirm the API Gateway authorizer needs no change.
3. Keep OSCAL's value equal to yours. If you choose a different value, tell the owner and OSCAL so `OSCAL_GUARDIAN_GENERIC_SSO_MAX_TOKEN_AGE_SECONDS` can match.
4. Report back with the effective limit and deploy time. Then the owner signs in fresh and fetches; your fixed-code log will show any remaining reason.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| OSCAL keeps a token with lifetime 3600 when the limit is 3600 | PASS | locally signed test token |
| Token lifetime 3600 seen at real sign-in | observed by the owner from OSCAL's log (number only) | real Authentik token |
| Real fetch end to end | NOT verified; waiting on your change | n/a |

### Rollback
Remove the `.env` line (OSCAL returns to 600) and restore Guardian's limit; or instead set the Authentik provider's Access token validity to 10 minutes or less.

## 2026-11-13: Token lifetime (exp - iat) check and logging, as Guardian requested

**Classification:** none (consumer behaviour; answers Guardian's request for exp-iat)
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
Guardian's logs for the owner's 14:41 request: authorizer passed, Lambda ran, Lambda returned 401 `invalid_token` (it also checks token age and lifetime `exp - iat` against 600 s). OSCAL now reads `exp - iat` from the access token it has already verified, logs it as a number at sign-in (`token.lifetime_seconds`, never the token), and when it is longer than the limit it does not keep the token and shows the owner both numbers and the fix. The limit is 600 s by default and set with `OSCAL_GUARDIAN_GENERIC_SSO_MAX_TOKEN_AGE_SECONDS` (60 to 3600) if Guardian raises `maxTokenAgeSeconds`.

### Effect on the Guardian contract
None.

### Action requested from Guardian
None. Please tell the owner if Guardian raises its limit so the OSCAL variable can match.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Lifetime above, at and below the limit; raised limit; out-of-range limit ignored; message includes both numbers | PASS (failed before) | locally signed test tokens |
| Real Authentik token lifetime | UNKNOWN until the owner signs in (the sign-in log line shows the number) | n/a |

### Rollback
Revert the lifetime check and `genericMaxTokenAgeSeconds` in `backend/guardianAssessments.js` and `backend/server.js`.

## 2026-11-13: Generic SSO token age (10 minutes) handled; wrong "Okta" wording fixed

**Classification:** none (consumer behaviour; raises an optional owner question about the contract's token age)
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
After Guardian's Lambda permission fix the owner's retry returned Guardian's HTTP 401, shown as "requires a fresh approved Okta sign-in" (wrong for Generic SSO). Most likely cause: the token was issued more than 10 minutes earlier (Guardian max token age 600 s). OSCAL now (a) verifies `maxTokenAge` 600 s when it keeps the token, (b) stops holding the token 5 s before it would exceed 600 s from `iat`, and (c) says for Generic SSO sessions: sign out, sign in again, then fetch within 10 minutes. Okta wording is unchanged for Okta sessions.

### Effect on the Guardian contract
None; OSCAL now respects the existing 600 s limit.

### Action requested from Guardian
Optional, owner decision only: if 10 minutes is too short for the report workflow (sign in, upload, Load Existing, fetch), a longer max token age or a refresh-token design needs a Guardian change and handover. No change is requested now.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Token-expiry rule (4 cases), Generic SSO 401 wording, no-token wording | PASS (failed before) | mocked Guardian |
| Real token end to end | NOT verified; owner retry within 10 minutes of sign-in pending | n/a |

### Rollback
Revert the expiry helper and wording in `backend/guardianAssessments.js`.

## 2026-11-13: Ack of Guardian Lambda-permission fix; plain wording for HTTP 500/502/504

**Classification:** none (OSCAL wording; acknowledges a Guardian-side fix)
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
Guardian reported that the first real call (GET `/v1/guardian/capabilities`, 14:32 AEDT) failed with HTTP 500 because of a malformed Lambda invoke permission (double slash in the source ARN), that its authorizer ACCEPTED the Authentik token (so AWS reaches the JWKS and scope, audience and issuer pass), and that the permissions were replaced at about 14:40 AEDT. OSCAL now words 500 ("internal error"), 502 ("bad gateway") and 504 ("timed out"), keeping `(HTTP <status>[: message])`, as requested. 503 already had wording. No contract change.

### Effect on the Guardian contract
None.

### Action requested from Guardian
None. If a retry still fails the owner will send the status and time.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Wording tests for 500, 502, 504 (plus 415, hostile and over-long messages) | PASS (failed before) | mocked Guardian |
| Real end-to-end fetch with a real token | NOT yet verified; owner retry pending | n/a |

### Rollback
Revert the wording in `backend/guardianAssessments.js`.

## 2026-11-13: Guardian page spacing and bold report labels

**Classification:** none
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
Guardian Agent assessment page only: the five report summary labels are bold, two blank lines precede "Guardian assessment source", and one extra blank line follows the "selectors below stay disabled" note. Files: `frontend/src/components/GuardianAssessment.jsx` and `.css`.

### Effect on the Guardian contract
None. No request, payload, token or setting changed.

### Action requested from Guardian
None.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Browser tests | 11 passed; new assertions measure bold weight (at least 600), a two-line gap before the source group and a two-line gap after the note | mocked Guardian |
| Same-row selector check made atomic (one evaluate) so a scroll in progress cannot skew it | PASS | mocked |

### Not verified
Visual review by a person; narrow screens.

### Rollback
Revert the two files.

## 2026-11-13: Show Guardian's HTTP status for untranslated failures

**Classification:** none (OSCAL-side diagnostics)
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
First real sign-in: the access token was retained and a request reached Guardian, which answered with a status OSCAL has no wording for (not 400, 401, 403, 404, 409, 413 or 503), so the page said only "Guardian assessment request failed". OSCAL now appends `(HTTP <status>[: <Guardian message>])`, the message only when short plain text, and the status check logs `guardian_assessment_status` with `reason` and `http.response.status_code`.

### Effect on the Guardian contract
None. Please check whether the status OSCAL reports (once the owner shares it) matches an expected failure such as the authorizer or Lambda returning 5xx.

### Action requested from Guardian
None yet. If the status is a 5xx from the API Gateway authorizer or Lambda, the Guardian side may need to look at its logs for the call at the time given by the owner.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| New tests (500 with body, 504 HTML, hostile message, over-long message, known status unchanged) | PASS (failed before) | mocked Guardian |
| Real Authentik call to Guardian | produced an untranslated status; value not yet known | real, owner-run |

### Rollback
Revert `backend/guardianAssessments.js` and `backend/guardianRoutes.js` changes.

## 2026-11-13: "Not configured" names the setting at fault; targets JSON quoting in `.env`

**Classification:** none (OSCAL-side configuration diagnostics)
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
Normal mode showed "disabled or not configured" with greyed selectors. Cause found from the running backend's environment: `OSCAL_GUARDIAN_ASSESSMENT_TARGETS_JSON` had lost its double quotes (the terminal's shell had loaded `.env`), so it was invalid JSON, and the backend's `.env` loader never overrides variables already set in the shell. The generic message hid this. It now adds `Problem: <setting>` (fixed text naming the variable, never a value) for the targets JSON, endpoint URL and allowed host, missing endpoint, loopback plus real mix, Generic SSO issuer/client ID/scope, and the ENABLED switch. `.env` now single-quotes the JSON, which survives both dotenv and shell loading.

### Effect on the Guardian contract
None. No request reached Guardian; the real endpoint, issuer, scope and targets are unchanged.

### Action requested from Guardian
None.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| New tests for the named problems (5 cases plus ENABLED) | PASS (failed before) | local |
| `.env` JSON parses via dotenv and via `source` in bash | verified | local |
| Real Authentik sign-in / fetch | NOT verified | n/a |

### Rollback
Revert `backend/guardianAssessments.js` messages; the generic sentence returns.

## 2026-11-13: Fix local Guardian test mode greyed out after the real endpoint was added to `.env`

**Classification:** none (OSCAL-side configuration handling; also corrects my own regression)
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
After I put the real Authentik endpoint into `.env`, `npm run dev:local-guardian-e2e` showed "disabled or not configured" and greyed selectors: the backend saw a loopback endpoint (local mode) plus the real one (`.env`) and refuses that mix by design. The local script now blanks the real endpoint settings for its own process (new `scripts/lib/localGuardianEnv.mjs`) and keeps the shared sign-in issuer. A shared `OSCAL_GENERIC_SSO_ISSUER` alone no longer enables the Guardian Generic SSO path; `OSCAL_GUARDIAN_GENERIC_SSO_SCOPE` is also required. My earlier gate did not catch this because it builds its own environment; a regression test now covers it.

### Effect on the Guardian contract
None.

### Action requested from Guardian
None.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Regression test: local env still configured when `.env` holds the real endpoint | PASS (failed before the fix) | local, simulates dotenv merge |
| dotenv keeps empty-string variables | verified | local |
| Real Authentik sign-in / fetch | NOT verified | n/a |

### Rollback
Revert `scripts/lib/localGuardianEnv.mjs`, `scripts/guardian-local-e2e.mjs` and the `readGenericSsoConfig` scope rule.

## 2026-11-13: SSO host consolidated into OSCAL_GENERIC_SSO_ISSUER / _CLIENT_ID

**Classification:** none (consumer configuration names only)
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
The Authentik host appeared in 11 repository files (38 places) plus the local config. It is now defined by `OSCAL_GENERIC_SSO_ISSUER` and `OSCAL_GENERIC_SSO_CLIENT_ID`, which drive both the sign-in URLs and Guardian's token verification (JWKS `<issuer>jwks/`). `OSCAL_GUARDIAN_GENERIC_SSO_ISSUER`, `_JWKS_URL` and `_CLIENT_ID` still work as optional overrides. Built-in defaults no longer carry the homelab host. Files: `backend/auth/genericOidc.js`, `backend/configManager.js`, `backend/guardianAssessments.js`, `backend/server.js`, `config/app/config.json.example`, `docker-compose.yml`.

### Effect on the Guardian contract
None. The values OSCAL verifies against are identical (issuer, JWKS, audience `oscal-report-generator`, scope claim); only where they are configured changed.

### Action requested from Guardian
None. If your docs name the OSCAL variables, mention the shared pair as the preferred settings.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Full gate | PASS: backend 63 suites / 560 passed / 1 skipped; IdP flows 36 passed; both token shapes; browser 11 passed; build; isolated smoke | mocked IdP, real cached data, test-only auth |
| Effective values from the real `.env` on a temp config copy | sign-in and Guardian values identical to before the change; unset variables fall back to saved config | real config, no network |
| Real Authentik sign-in / fetch | NOT verified | n/a |

### Rollback
Restore the three removed `OSCAL_GUARDIAN_GENERIC_SSO_*` lines in `.env` and revert the files above.

## 2026-11-13: Editable Generic SSO scope and safe token-rejection reasons

**Classification:** none (consumer-side; Guardian's scope restriction acknowledged)
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
Guardian reported `guardian-assessments` live in Authentik, restricted to `OSCAL_Platform Admin` (admin allowed, Assessor denied). Its instruction to save the scope in Settings, SSO Integration could not be followed: that form had no Generic SSO scope field and the save route kept only `enabled`. OSCAL now has an editable, validated "OIDC scope" field (must include `openid`; plain scope characters only; otherwise the stored value is kept). When the Generic SSO access token cannot be retained after sign-in, the WARN log line `guardian_generic_sso_token_retention` now has `event.reason` from a fixed set (`scope_missing`, `groups_claim_missing`, `no_privileged_group`, `jwt_<jose code>[_<claim>]`, `issued_in_future`, `token_rejected`), never token text or claim values. Files: `backend/guardianAssessments.js`, `backend/auth/genericOidc.js`, `backend/server.js`, `frontend/src/components/SSOIntegration.jsx`.

### Effect on the Guardian contract
None. Request, claims, scope name, groups and host are unchanged.

### Action requested from Guardian
None.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Full gate | PASS: backend 62 suites / 547 passed / 1 skipped; IdP flows 27 passed; both Guardian token shapes; browser 11 passed; build; isolated smoke | mocked IdP, real cached data, test-only auth |
| Rejection reasons | 5 new tests (scope, groups absent, wrong group, wrong audience, wrong issuer); reason never contains token text | locally signed test tokens |
| Scope validation | 8 new unit tests | local |
| Real Authentik token, sign-in, fetch | NOT verified | n/a |

### Not verified
The Settings field in a browser (no UI test added) and any real sign-in. Published Docker `v1.9.0` does not include this change.

### Rollback
Revert the four files; the Generic SSO scope returns to a config-file-only setting.

## 2026-11-13: Correction: `sso.keekar.au` private address was DNS rewriting, not the published record

**Classification:** informational (corrects two earlier handovers and an owner-blocker claim)
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
Documentation only. Earlier this session OSCAL and Guardian both concluded that public DNS publishes `10.100.3.74` for `sso.keekar.au`. The owner showed that is a rewrite on the owner's network: plain DNS (UDP and TCP, including to the authoritative servers) returns `10.100.3.74` with TTL 0, equal to the owner's pfSense WAN IP, while DoH returns `103.160.130.243`, TTL 300. OSCAL reproduced the DoH answer via `https://1.1.1.1/dns-query`. The same rewriting would have affected Guardian's check on this machine.

### Effect on the Guardian contract
None. Guardian's private-address guard stays correct. Owner blocker (3) "public DNS gives a private address" is likely NOT real from AWS.

### Action requested from Guardian
Optional: re-verify from outside the owner's network (DoH, or an AWS-side lookup / `GetCallerIdentity`-free resolver test) that `sso.keekar.au` resolves to `103.160.130.243`, and that the issuer discovery and JWKS URLs answer on 443 with a valid certificate. Please correct your docs if you recorded the private address as the zone's value.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Plain UDP and TCP DNS to 1.1.1.1, 8.8.8.8, 9.9.9.9 and the authoritative server | 10.100.3.74 | REAL, affected network path |
| DoH direct to 1.1.1.1 | 103.160.130.243, TTL 300 | REAL |
| Resolution and reachability from AWS | NOT verified | n/a |

### Rollback
Revert the two edited statements in the deploy inputs doc.

## 2026-11-13: Authentik assessment API endpoint configured in OSCAL (config only)

**Classification:** action required: config (done locally)
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
Guardian reported its assessment API deployed (Authentik issuer only). The values it supplied are set in the local gitignored `.env` and recorded in `docs/GUARDIAN_DEPLOY_INPUTS.md`. `docs/GUARDIAN_ASSESSMENTS.md` now states the custom scope must also be in the Generic SSO provider's Scope setting. No code or contract change.

### Effect on the Guardian contract
None. The consumer values match Guardian's: URL, host, issuer, JWKS, client ID `oscal-report-generator`, scope `guardian-assessments`, targets `cloudflare#PROD_AEMGovAu` and `okta#AEMGovAu` for groups `OSCAL_Platform Admin` and `Platform Admin`.

### Action requested from Guardian
None.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| OSCAL config readers accept the new values | PASS (endpoint, host, targets, Authentik contract all parsed) | local code, real values |
| Endpoint without token / with invalid token | HTTP 401 / 401 | REAL live endpoint, unauthenticated |
| Real Authentik token, sign-in, report population | NOT verified | n/a |

### Not verified / owner blockers
Scope `guardian-assessments` not yet created in Authentik or added to the OSCAL Generic SSO Scope setting; `groups` in the access token unconfirmed; `sso.keekar.au` private from public DNS, so the authorizer cannot fetch JWKS; the TrueNAS container needs the same variables.

### Rollback
Remove the `OSCAL_GUARDIAN_*` lines from `.env`.

## 2026-11-13: Tests no longer hard-code the acceptance report's control count

**Classification:** none (OSCAL test-only change; also acknowledges Guardian's 2.5.0 deploy note)
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
`test_cases/backend/integration/guardianAssessments.test.js` and `test_cases/e2e/guardian-assessment.spec.mjs` asserted exactly 1035 controls for the file named by `GUARDIAN_ACCEPTANCE_REPORT`. They now compare against the supplied file's own control count (and require at least one control), as Guardian suggested. No `OSCAL_GUARDIAN_*` URL or allowed host is set; none will be until Guardian sends the endpoint hostnames.

### Effect on the Guardian contract
None.

### Action requested from Guardian
None now. Later: send the endpoint hostnames (`authentik`, `default`) after the owner-approved apply.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| guardianAssessments.test.js | 32 passed with the 2026-10-12 (1077 controls) and 2026-08-17 reports, and with no report | cached owner reports, mocked Guardian |
| Browser workflow | 11 passed with the 1077-control report | mocked Guardian |
| Real sign-in / live endpoints | not verified | n/a |

### Rollback
Restore the literal 1035 assertions.

## 2026-11-13: Docs corrected, `sso.keekar.au` is not publicly resolvable (Authentik path blocked)

**Classification:** none (documentation only; informs an open owner prerequisite)
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
`docs/GUARDIAN_DEPLOY_INPUTS.md`: the claim that `sso.keekar.au` is publicly resolvable is replaced. Guardian verified that public resolvers and the authoritative name server return `10.100.3.74` (RFC1918) and only the LAN resolver returns `103.160.130.243`. The prerequisite now reads "resolves to a public address from public DNS and reachable from AWS, with a valid certificate for the same hostname" and the Authentik path is marked BLOCKED pending an owner decision (public address or tunnel).

### Effect on the Guardian contract
None. Guardian keeps its private-address check.

### Action requested from Guardian
None.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| `git diff --check` | PASS | local |
| DNS facts | taken from Guardian's public-resolver check; OSCAL saw the same split earlier | real DNS |

### Not verified
AWS reachability; real Authentik sign-in.

### Rollback
Revert the three lines in the deploy inputs doc.

## 2026-11-13: Generic SSO login errors report the real cause (plus a correction to the smoke-check claim)

**Classification:** none
**From:** OSCAL Reports assistant, repository state `uncommitted`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
The Generic SSO authorize route used one fixed message for every failure. It now redirects to the login page with the actual reason: SSO server unreachable (host and system error such as `EHOSTUNREACH`), certificate error, HTTP status from discovery, invalid discovery document, the specific missing setting, or a refused callback address. The message is built from strictly sanitized query values and the server logs a structured WARN `generic_oidc_authorize_failed`. Files: `backend/auth/genericOidc.js`, `backend/server.js`, `frontend/src/utils/loginErrors.js`, `frontend/src/components/Login.jsx`.

### Effect on the Guardian contract
None. No Guardian route, payload, token, claim, scope, group, host or `OSCAL_GUARDIAN_*` setting changed. Sign-in itself behaves as before; only the text shown after a failed start differs.

### Action requested from Guardian
None.

### Correction to earlier receipts
Earlier handovers described the server smoke check as using a "throwaway data folder". That was inaccurate: `.env` sets `USERS_PATH`, which takes priority over `OSCAL_DATA_DIR`, so those smoke runs started a backend against the real users file (boot rewrites it with the same content; its fingerprint was unchanged). The smoke check now sets `USERS_PATH` and `CONFIG_PATH` explicitly and fails unless the boot log shows the temporary users file. No Guardian-side effect.

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Full gate | PASS: backend 62 suites / 535 passed / 1 skipped; IdP flows 20 passed; both Guardian token shapes; isolated server smoke; build | mocked IdP, real cached data, test-only auth |
| Browser tests | 11 passed (3 new for the login page messages) | mocked |
| Live failure scenarios | 7 isolated backends: unreachable, HTTP 404, no authorization endpoint, missing secret, SSO off, redirect refused, healthy control; each gave the correct distinct message | local servers, no real IdP |
| Manual real sign-in | Okta: not done; Authentik: not done | user-confirmed only |

### Not verified
Real Okta or Authentik sign-in. The Okta authorize route and the token-exchange routes still return generic messages. Published Docker `v1.9.0` does not include this change.

### Rollback
Revert the four files above; the login page then shows the old fixed text.

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
