<!-- Concept: Mukesh Kesharwani -->
<!-- Contact: mukesh.kesharwani@adobe.com -->

# Local OSCAL–Guardian integration demo

This laptop-only demo exercises the synthetic contract in the Guardian
checkout's `docs/LOCAL-OSCAL-GUARDIAN.md`. It does not call AWS, API Gateway,
Okta, S3, or any shared environment. It is not a production integration.

The demo displays an explicitly selected existing synthetic run separately
from the source SSP. Preview and apply are distinct actions; the user must
confirm the preview. Before applying, the browser hashes the current SSP
again and rejects stale previews. The returned document is a new download;
the source document is not overwritten. The only SSP available in this page
is Guardian's synthetic fixture.

## Run locally

From the OSCAL repository root, start the loopback bridge:

```sh
node scripts/local-guardian-oscal-demo.mjs
```

In another terminal:

```sh
npm --prefix frontend run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:3021/guardian-local-demo`. The bridge binds only to
`127.0.0.1:8767`, imports the provider from the sibling `GuardianAgent`
checkout, and calls its `tokenForTest` only in backend-to-backend requests.
The synthetic token is never returned to the browser or written to logs.
The provider still verifies its signed token, permission, client, target and
run; this is not OSCAL's real login or Guardian's deployed Gateway.

Use **Simulate source edit after preview** to verify that the consumer rejects
a stale preview. The normal application page and existing CLI/SSP Apply flow
are unchanged. An ambiguous apply response blocks retries until the local
demo is reloaded.

## Validate

```sh
npm --prefix backend test -- --runInBand --runTestsByPath /Users/mkesharw/Documents/OSCAL_Reports/test_cases/backend/integration/guardianLocalIntegration.test.js
npm --prefix frontend run build
```

The integration test starts and closes both local loopback services. The
frontend build does not enable the demo route in production. Do not use this
synthetic contract as an AWS API Gateway
specification or deploy the bridge/provider.

## Remaining production work

The documented Guardian routes are local test routes only. Production still
requires an owner-approved API Gateway contract, delegated claim/scope
alignment, authorization and target-isolation tests in an authorized
non-production environment, and separate release approval. No database
migration, persistent result store, official OSCAL assessment-results
certification, or deployed API behavior is established by this demo.
