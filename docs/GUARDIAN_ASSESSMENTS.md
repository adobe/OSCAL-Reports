<!-- Concept: Mukesh Kesharwani -->
<!-- Contact: mukesh.kesharwani@adobe.com -->

# Populate a selected report from Guardian assessments

## User workflow

On **Update Existing Assessment** and **Analyse Changes/Improvements in Solution**,
select an OSCAL SSP and click **Load Existing Report**. The app asks whether to
fetch assessment data from Guardian Agent. **No** continues the existing
catalog-selection sequence unchanged. **Yes** opens the Guardian workflow below
for the selected report; after you confirm and use the saved revision, the
existing catalog-selection sequence continues with the populated report.
**Skip Guardian and continue loading report** resumes the original report.

Start the normal application with `npm run dev`, then sign in. Guardian
assessment is reachable **only** through the Load Existing Report prompt above;
there is no standalone button on the landing page, editor or Multi-Report
Comparison. It is included in production builds; it is not the isolated
`/guardian-local-demo` route.

1. Your loaded SSP is preselected as the source; the original file is never
   modified.
2. Select an authorized provider/target and load its existing assessment runs.
   Continue through **Load more runs** when a pagination cursor is present.
3. Fetch a specific run. Findings and the OSCAL assessment-results download
   remain separate from the SSP until confirmation.
4. For an assessment without an SSP UUID, explicitly authorize initial
   linkage. Guardian still checks the independent target manifest,
   account/organization and existing SSP binding. A different nonempty
   assessment SSP UUID is never overridden.
5. Preview control-property changes and explicitly confirm a new revision.
6. **Add more providers.** After a confirm, the page keeps working on the new revision. Select another target (for example Okta after Cloudflare), fetch,
   preview and confirm again: the second provider's results are **added to the same revision**, not applied to the original file. The section
   **Guardian revision for this report** lists the provider results applied so far. If a control is assessed by both providers, the provider confirmed last
   wins for that control's status, evidence and testing fields. **Start again from the original report** discards the accumulated revision from the working
   copy; the next confirm then replaces the saved one.
7. **Download populated SSP** or **Continue with saved Guardian revision** (opens the revision in the normal catalog-selection sequence and then the editor).
   The original source remains separately downloadable and is never overwritten.

**What a confirmed revision contains.** For every updated control, Guardian's results are written to the control's properties and reach the editor fields:
implementation status (a Not Assessed finding keeps the existing status), **evidence** (control, remarks, evidence items and capabilities), the **Testing tab**
fields (testing procedure naming the run and target, testing frequency, last test date) and the API data history (a new entry per run, newest last, at most 24).
Narratives and controls without a finding are unchanged. The real-cache test checks these fields for every updated control, in the editor's own extraction.

**Download file name.** `<first 16 characters of the input file name>_GAD-Input_<local date and time as digits>.json`, for example
`DigitalSovereign_GAD-Input_20261112110512.json` (year, month, day, hour, minute, second). The `.json` extension is not counted in the 16 characters and characters
that are unsafe in file names are replaced with `_`. The unchanged source download keeps the fixed name `guardian-original-ssp.json`.

**Revisions belong to a report.** The saved revision is tied to the report it was built on (a content hash), so a revision saved for a different report is
never offered for **Continue** or **Download**; the page says so instead. Revisions saved by an earlier version carry no hash and are not matched; run the
workflow again to create one. Reopening the same report continues from its saved revision.

The latest confirmed revision and its original source are stored in IndexedDB
under the signed-in OSCAL user ID. This supports the supplied report, which
exceeds localStorage's existing application limit. Browser reload restores
the saved Guardian revision for the same report. Storage failure is reported, not treated as
success. Clearing browser data removes these local copies; export important
revisions. This is **browser-local persistence**, not a shared database save
or a write to Guardian. Existing normal export/database workflows are unchanged.

## Privileged access via Generic SSO

Only a user who signed in with **Sign in with Generic SSO** and whose IdP token
carries membership of a group whose name **contains** `Platform Admin`
(case-insensitive; for example `OSCAL_Platform Admin`; override with the
comma-separated phrases in `OSCAL_GUARDIAN_PRIVILEGED_GROUPS`) is treated as a
privileged Guardian operator. The groups come from the server-side token exchange,
are kept off the session object exposed to routes, and are never taken from the
browser. Okta or local-password sessions with such a group do not qualify. A
"contains" match is looser than an exact name, so any IdP group that includes the
phrase grants the OSCAL-side gate; Guardian still enforces its own target grants
and the group in the verified token, which remain the authoritative control.

Privileged users see a warning that they are operating as a privileged user and
must tick a confirmation naming the loaded report (title and UUID), Guardian
target and run before **Fetch Guardian assessment** is enabled. Status, run
listing, fetch and preview are audit-logged as structured JSON (user ID, IdP
group, provider, target, run, SSP UUID; never tokens or report content).

Guardian remains authoritative. In production, a Generic SSO session reaches
Guardian only when Guardian has approved Authentik as an additional issuer
(design approved; implemented in the Guardian repository) **and** these backend
settings are supplied by the owners (nothing is defaulted; any missing or invalid
value disables the path and OSCAL answers "Guardian has not yet approved Generic
SSO access"):

| Variable | Requirement |
| --- | --- |
| `OSCAL_GENERIC_SSO_ISSUER` | **Shared with sign-in.** Exact Authentik issuer (https, ends with `/`, no credentials, query or fragment). The sign-in issuer, discovery and end-session URLs and Guardian's JWKS URL (`<issuer>jwks/`) all derive from it, so it is the one place the identity host is defined. Overrides the saved Generic SSO provider URLs. |
| `OSCAL_GENERIC_SSO_CLIENT_ID` | **Shared with sign-in.** OSCAL OAuth client ID; also the access-token audience. Overrides the saved provider client ID. |
| `OSCAL_GUARDIAN_GENERIC_SSO_ISSUER`, `_JWKS_URL`, `_CLIENT_ID` | Optional Guardian-only overrides of the shared values above (for example a JWKS URL that is not `<issuer>jwks/`). Normally unset. |
| `OSCAL_GUARDIAN_GENERIC_SSO_SCOPE` | Dedicated custom scope (for example one for read-only assessment access) is added to the Generic SSO sign-in request automatically while the feature is enabled (it may also be listed in the provider's **OIDC scope** field in Settings, SSO Integration), so Authentik includes it in the access token; OSCAL requires it in the access token's `scope` claim, so ID tokens cannot be replayed. |
| `OSCAL_GUARDIAN_GENERIC_SSO_ASSESSMENTS_URL` | The `authentik` endpoint from Guardian's Terraform output `assessment_api_endpoints` (keyed by issuer label: `authentik`, later `default` for Okta). Same allowed-host and `/v1/guardian` rules; defaults to the primary URL if unset. Settings procedure and prerequisites: [GUARDIAN_DEPLOY_INPUTS.md](GUARDIAN_DEPLOY_INPUTS.md). |

**What applying an assessment changes.** Only the controls Guardian assessed (typically a small part of the report; 170 of 1,077 in the Digital Sovereign example) are touched, and only these properties. The editor reads the same properties (Testing tab: Evidence Location, Testing Method; and the status, last test date and history).

| Property (editor field) | Updated by apply | Note |
| --- | --- | --- |
| `implementation-status` (Implementation status) | Yes, when Guardian gives an explicit status | Okta "Not Assessed" keeps the existing status. With two providers the most negative status wins (see "Two providers" below) |
| `evidence` (Evidence Location) | Yes | Replaced with the run's evidence text; identical text stays identical. With two providers both are kept, one labelled section per provider |
| `testing-procedure` (Testing Method) | Yes | Wording is generated by Guardian's API (see the next row). With two providers both lines are kept |
| `last-test-date` | Yes | The run's date |
| `testing-frequency` | Yes | Fixed Guardian text |
| `api-data-history` | Yes | One entry appended per application |
| `control-type` (Control Type) | **No** | Not written by Guardian's merge, by the command line, or by the app. Owner decision 2026-11-13: leave unchanged |
| Everything else, and controls Guardian did not assess | No | Unchanged |

Metadata also gains the provider binding properties, `guardian-findings-merge`, a new `last-modified` and a recomputed integrity hash.

**Two providers (owner decision 2026-11-13; deployed by Guardian 2026-11-13 17:44 AEDT).** When both Okta and Cloudflare assess the same control:

| Field | Rule |
| --- | --- |
| Evidence Location | **Amended**: one labelled section per provider (target and run), neither replaced. Applying a provider again replaces only that provider's own section |
| Testing Method | **Amended**: one line per provider; applying a provider again replaces only its own line |
| Implementation Status | **Most negative assessed status wins**, comparing each provider's latest result: Not Implemented, then Ineffective, then Partially Effective, then Effective. Examples: Ineffective with Not Implemented gives Not Implemented; Ineffective with Effective gives Ineffective. **Not Assessed** never beats an assessed status (the assessed one wins); when no provider gives an assessed status, today's rule applies (Okta "Not Assessed" keeps the existing status). **Not Applicable** from Guardian is never written: the value already in the OSCAL report wins (for every control, one provider or two) |
| Testing Frequency, Last Test Date | Last applied wins |
| Assessment history | Appended, as before |
| Additional Notes, Consumer Guidance, Control Type | Never changed |

A control assessed by only one provider keeps the single-provider format (no section labels). The other provider is detected from the control's assessment history in the report, so a result recorded by an earlier apply counts even when that provider is not applied in the current session (for example a control whose history already holds an Okta result of Partially Effective keeps that status when Cloudflare applies Effective).

**Testing Method wording.** Guardian's command-line scripts write "Automated assessment: Keekar ACSC ISM Guardian strict ... probes. Target: ...; cell: ...; source: s3://...". The API path used by this feature wrote a short "Guardian strict <provider> API probes; existing run <id>, target <id>." Owner decision 2026-11-13: use the command-line style with the run date and ID and the cell label, without any storage path. This is Guardian's change (handover recorded in [GUARDIAN_HANDOVERS.md](GUARDIAN_HANDOVERS.md)); until Guardian deploys it, the short text is written.

**Docker and TrueNAS.** Templates, a variable reference and verification steps for container deployments are in [GUARDIAN_SSO_DOCKER_DEPLOYMENT.md](GUARDIAN_SSO_DOCKER_DEPLOYMENT.md) (template: `.env.docker.example`).

**Token lifetime.** Guardian's Lambda also rejects a token whose own lifetime (`exp` minus `iat`) is longer than its limit, however fresh. If Authentik's access-token validity is longer, OSCAL detects it at sign-in and the page states both numbers. Fix: set the Authentik provider's **Access token validity** to the limit or less, or have Guardian's owner raise its limit and set `OSCAL_GUARDIAN_GENERIC_SSO_MAX_TOKEN_AGE_SECONDS` (60 to 3600, default 600) to match. A successful sign-in logs `token.lifetime_seconds`.

**Token age.** Guardian accepts an Authentik access token only for 10 minutes after it was issued (its `max token age 600s` contract). OSCAL therefore keeps the token for at most that long (and never past the token's own expiry or the session). After that the page says to sign out, sign in again, then fetch within 10 minutes. If that window is too short for your workflow, raising it is a Guardian contract decision (or OSCAL would need a refresh-token flow).

**Checking the token safely.** Never paste an access token anywhere. After enabling the feature (and the scope in Authentik), sign out and in, then open Load Existing Report and answer Yes. If the token is unusable the server log (terminal running the backend, or `docker logs`) shows one WARN line, `guardian_generic_sso_token_retention`, whose `event.reason` is one of: `scope_missing` (the scope was not granted: check the OIDC scope field and the Authentik scope mapping), `groups_claim_missing` (the access token has no `groups` claim), `no_privileged_group` (no group contains `Platform Admin`), `jwt_ERR_JWS_INVALID` (the access token is not a JWT), `jwt_ERR_JWT_CLAIM_VALIDATION_FAILED_aud` or `_iss` (audience or issuer differs), `jwt_ERR_JWT_EXPIRED`, or a signature or key error. No such line means the token was verified and retained.

When only the Generic SSO path is used, the Okta identity settings below may be
omitted; the primary URL and the target list are still required.

For privileged members, OSCAL keeps the Generic SSO **access token** server-side
only (never the ID token, never the browser), verifies issuer, RS256 signature,
audience, expiry, the custom scope and the privileged group claim, and sends it as
the bearer token. The access token must carry the `groups` claim. Guardian
re-verifies everything and applies its own target grants (planned grant rows use
the namespaced form `authentik:OSCAL_Platform Admin`). The existing Okta
delegated-token path is unchanged. In the local test mode below, the gate applies
to Generic SSO sessions only.

## Local end-to-end test mode (real cached data, test-only authentication)

This mode ignores the real Guardian endpoint settings in `.env` (they are blanked for the process), so the real settings can stay in `.env`. Restart it after changing `.env`; the backend reads `.env` only at start.

To try the whole flow on your laptop without the approved Okta delegation,
stop any running `npm run dev`, then run:

```sh
npm run dev:local-guardian-e2e
```

This starts the OSCAL backend on 3020 and the frontend on 3021, plus Guardian's
development gateway on a random loopback port, backed by the real cached
Cloudflare (`PROD_AEMGovAu`) and Okta (`AEMGovAu`) runs in
`../GuardianAgent/data/guardian_s3_runs`. Optional overrides:
`GUARDIAN_CHECKOUT`, `GUARDIAN_ASSESSMENT_RUNS_DIR`, and
`GUARDIAN_LOCAL_TARGETS` (comma-separated `provider#targetId`). Sign in with
**Sign in with Generic SSO** as a member of a group containing `Platform Admin` (other
sign-ins are refused in this mode), upload your SSP, click **Load Existing Report** and
choose **Yes**; the target and run selectors then become active.

The data is real; the authentication is **not**: the gateway trusts a test token
generated in-process and held only server-side. This mode requires
`NODE_ENV=development` plus the existing loopback-gateway restriction, refuses
`NODE_ENV=production`, and the override is ignored for any other configuration
(covered by a backend test). Refresh the cache only with Guardian's own script.
Use `npm run dev` for normal behavior.

## Backend configuration

Assessment retrieval is disabled by default. Configure these on the **backend**
using the approved runtime mechanism, restart it, and obtain a fresh Okta login:

| Variable | Requirement |
| --- | --- |
| `OSCAL_GUARDIAN_ASSESSMENTS_ENABLED` | `true` enables the read/preview adapter. |
| `OSCAL_GUARDIAN_ASSESSMENTS_URL` | Okta (`default`) endpoint: HTTPS (port 443, no redirects) ending in `/v1/guardian`, host listed in `OSCAL_GUARDIAN_ASSESSMENTS_ALLOWED_HOSTS`. **Optional**: leave unset for an Authentik-only deployment; the Okta path then stays not configured. At least one of this and the Generic SSO URL is required. |
| `OSCAL_GUARDIAN_ASSESSMENTS_ALLOWED_HOSTS` | Owner-supplied exact hostnames, comma-separated, no wildcards and no built-in default: the API Gateway hosts from Guardian's Terraform output `assessment_api_endpoints` (`primary` for Okta tokens, `extra-0` for Authentik). Unknown until an approved deploy; until then the feature fails closed with the "not configured" message. |
| `OSCAL_GUARDIAN_ISSUER` | Approved custom Okta authorization-server issuer. |
| `OSCAL_GUARDIAN_JWKS_URL` | Approved JWKS endpoint on the issuer origin. |
| `OSCAL_GUARDIAN_AUDIENCE` | Guardian resource audience, different from either OIDC client ID. |
| `OSCAL_GUARDIAN_CLIENT_ID` | Existing approved OSCAL OIDC client ID. |
| `OSCAL_GUARDIAN_SCOPES` | Approved space-separated scopes. |
| `OSCAL_GUARDIAN_ASSESSMENT_TARGETS_JSON` | Array of `{provider,targetId,label,groups}`; provider is `cloudflare` or `okta`, groups are approved dedicated permission groups. |

No client secret, access token, guessed scope or synthetic identity belongs
in these settings. `GRP-TECHGRC-ALL` is not accepted as a target permission
group. Tokens remain in the existing server-side delegated-token store and
are reverified before requests. Local username/password login does not
produce a Guardian token. Expiry, logout and process restart require a new
Okta sign-in. Guardian independently verifies its full approved contract
and target grant; matching basic `cid`/`scp`/`groups` claims in OSCAL does not
override additional Guardian token-discriminator requirements.

For laptop Gateway emulation only, use `NODE_ENV=development` and explicitly
set `OSCAL_GUARDIAN_LOCAL_GATEWAY=true` with the IPv4-loopback URL
`http://127.0.0.1:8768/v1/guardian`. HTTP/private endpoints are rejected in
production. The loopback server requires the real approved delegated-user
contract; it does not mint tokens. See the sibling Guardian checkout's
`docs/GUARDIAN-OSCAL-ASSESSMENT-API.md` for its startup, cache, grant and
assessment-plan configuration. Do not copy test signing identities into it.

The old **Apply SSP to Guardian** upload feature remains separately controlled
by `OSCAL_GUARDIAN_ENABLED` and its existing write-target settings.

## Contract and preservation

Authenticated OSCAL endpoints:

- `GET /api/guardian/assessments/status`: readiness and authorized target labels.
- `GET /api/guardian/assessments/runs`: explicit provider/target and optional
  `nextToken`; proxies the provider's paginated run listing.
- `GET /api/guardian/assessments/result`: explicit provider/run/target;
  validates the fetched assessment content hash in the consumer.
- `POST /api/guardian/assessments/preview`: bounded projected SSP, fetched
  `assessmentHash`, explicit binding flag and `returnPatch:true`.
- `POST /api/guardian/assessments/finalize`: local full-document integrity
  finalization, not a Guardian request or persistence operation.

Provider paths are `/v1/guardian/capabilities`,
`/v1/guardian/assessments/{provider}?targetId=...`,
`/v1/guardian/assessments/{provider}/{runId}/{targetId}` and
`/v1/guardian/ssp/preview`. Run IDs include scheduled UTC timestamps;
path segments are validated and percent-encoded.

The full report never goes through the synchronous Guardian Lambda. The
browser retains it and sends only eligible assessed control IDs and complete
property arrays, plus UUID and binding metadata. Preview requests must fit
1 MiB. The consumer verifies the assessment hash, projection hashes,
unique/mapped control IDs and exact `before` properties, then reconstructs a
new **full** report. It compares the retained full-source hash again before
confirmation/persistence. Narratives, statements, attachments, unrelated
fields and unmatched controls are preserved. Only reviewed control
properties and permitted Guardian metadata are changed.

The local finalizer uses OSCAL's canonical full-document integrity helper.
A provider-generated projection integrity value is never used as the
full-report integrity hash. Full local finalization and file selection have
a 16 MiB limit; the old reverse-upload endpoint retains its 2 MiB limit.

Okta findings outside `core_okta`/`partial_okta`, or explicitly excluded by
the provider, are displayed but not populated. Guardian's established
Not Assessed preservation semantics remain authoritative. Truncated,
unreliable, unknown-status, incorrectly linked or conflicting data cannot
be treated as an effective assessment.

## Verification

Final local validation: 66 backend/authentication tests passed, both browser
tests passed, and ESLint passed for the new frontend modules and Guardian
backend modules. Browser provider responses are mocked; the separate cached
evidence harness exercises the real Gateway and provider implementation.

Focused backend/consumer regression command:

```sh
npm --prefix backend test -- --runInBand --runTestsByPath \
  "$PWD/test_cases/backend/integration/guardianAssessments.test.js" \
  "$PWD/test_cases/backend/unit/guardianService.test.js" \
  "$PWD/test_cases/backend/integration/guardianRoutes.test.js"
```

Set `GUARDIAN_ACCEPTANCE_REPORT` to a user-provided full SSP to additionally
exercise the large-report invariants. The supplied acceptance report contains
1,035 controls, is 7,324,034 bytes on disk and 5,192,195 compact JSON bytes.
Do not commit that file or its contents.

Self-contained browser test (starts/closes its own ephemeral frontend):

```sh
OSCAL_BROWSER_CHANNEL=chrome \
  npx --no-install playwright test test_cases/e2e/guardian-assessment.spec.mjs \
  --workers=1 --reporter=line
```

Omit `OSCAL_BROWSER_CHANNEL` when using Playwright's installed Chromium.
These browser tests use explicitly mocked provider responses. They verify
selection, fetch, preview, confirmation, IndexedDB persistence through reload,
editor adoption and truthful disabled-provider UX; they do not prove real OAuth.

Real cached-evidence cross-repository verification:

```sh
GUARDIAN_CHECKOUT=/path/to/GuardianAgent \
GUARDIAN_ACCEPTANCE_REPORT=/path/to/user-report.json \
  node test_cases/e2e/guardian-real-cache.mjs
```

This uses real cached Cloudflare and Okta findings through the actual local
HTTP Gateway, with independently verified **test-only signed identities and
test-only grants** on both sides. It does not access AWS, refresh credentials,
change grants or overwrite the input. It checks pagination, projection
transport, patches, all source controls, narratives, unmatched rows and
canonical full-document integrity. `GUARDIAN_CACHE_DIR` optionally selects an
authorized cache. `GUARDIAN_ACCEPTANCE_OUTPUT` optionally writes a new
review-only candidate using exclusive creation; it refuses to overwrite an
existing file or the source.

The same suite of checks, including the Okta and Authentik sign-in flow tests (`test_cases/backend/integration/idpGuardianFlows.test.js`), is run for every change by the workspace skill `.github/skills/guardian-integration-handover/`.

The script makes two passes and prints one JSON receipt line for each:

1. **Okta-shaped** (`real-cached-evidence-test-only-auth`): a delegated Okta-style token through the Okta verifier path.
2. **Authentik-shaped** (`real-cached-evidence-authentik-shaped-test-only-auth`): OSCAL's real assessment service with a privileged
   `Generic_OIDC` session, calling Guardian's development gateway (`scripts/guardian-assessment-dev-gateway.mjs`, `authentikTokenForTest()`;
   space-delimited `scope`, audience equal to the client ID, no `cid`, namespaced groups). It also checks that OSCAL itself refuses a Generic SSO session
   outside the privileged group, that Guardian rejects a token without the custom scope (401) and one whose group is not granted (403), that every
   Cloudflare finding is eligible, that each provider's updated count equals its eligible controls, that the original report is unchanged, and that the result
   is identical to the Okta-shaped pass.

Both passes use test-only authentication. The Authentik pass needs a Guardian checkout that provides `authentikTokenForTest()`;
otherwise it stops with an explicit message.

Verified with the supplied report and cached run `2026-11-10T00:37:20Z`:
Cloudflare populated 36 eligible controls; Okta populated 142 eligible
controls from 172 displayed findings. All 1,035 source controls remained.
This is real-evidence interoperability testing, **not real-auth approval,
official SSP certification, or proof of a live deployment**.

`npm --prefix frontend run build` validates the production UI. Current
Vite output includes the existing non-blocking large-chunk warning.

## Rollout and rollback

First deploy the reviewed Guardian read/preview API, align both approved auth
contracts and scopes, configure assessment-plan reference and target grants,
and verify authorized/unauthorized users in an approved non-production
environment. Then enable the OSCAL assessment adapter and restart/login.
Validate the actual report and transport sizes; do not silently truncate
evidence or increase Lambda payload ceilings.

Until that approval/configuration exists, the visible UI reports the
disabled/configuration/authentication blocker. No synthetic findings,
aggregate-metric fallback or service token is substituted.

Disable `OSCAL_GUARDIAN_ASSESSMENTS_ENABLED` and restart the backend to roll
back provider calls. Existing login, report editing and exports remain
available. Previously exported copies are independent; browser-local
Guardian revisions remain available for download.
