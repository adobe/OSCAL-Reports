<!-- Concept: Mukesh Kesharwani; Contact: mukesh.kesharwani@adobe.com -->
# OSCAL delegated Guardian calls

This integration is **disabled by default**. It does not register Okta apps or
invent Guardian's API contract. Existing OSCAL login remains functional if
Guardian configuration or token verification fails.

## Supported contract and prerequisites

- Okta-approved OSCAL Authorization Code user access token (not an ID token,
  OSCAL session token, Generic OIDC token, or client-credentials token).
- Custom Okta authorization server; org-server tokens are rejected.
- RS256 signed JWT with `iss`, resource `aud`, `sub`, `iat`, `exp`, OSCAL `cid`,
  `scp` array and `groups` array. Confirm these claims with the platform team.
- Resource audience must differ from both OIDC Client IDs (ID-token audiences).
- Each target has an approved HTTPS Guardian endpoint, explicit POST/PUT method,
  and dedicated permission groups. Membership in any listed target group grants
  that target permission. `GRP-TECHGRC-ALL` cannot be used as a write group.
- **The only implemented outbound payload is the raw OSCAL JSON document.** The
  target is selected by its configured endpoint, not by a guessed body field.
  If Guardian expects an envelope, target header, token exchange, opaque tokens,
  or other claims, implement and test that adapter before enabling this feature.

Guardian remains responsible for independently validating tokens, permissions,
target ownership, document contents and safe/atomic application of changes.

## Deployment configuration

Set the following non-secret environment variables on every backend instance:

| Variable | Required value |
| --- | --- |
| `OSCAL_GUARDIAN_ENABLED` | Leave unset/`false` until non-production approval; `true` enables verification and calls |
| `OSCAL_GUARDIAN_ISSUER` | Exact confirmed custom authorization-server issuer, no trailing slash |
| `OSCAL_GUARDIAN_JWKS_URL` | Confirmed JWKS URL on the same origin as the issuer |
| `OSCAL_GUARDIAN_AUDIENCE` | Confirmed Guardian resource audience |
| `OSCAL_GUARDIAN_CLIENT_ID` | OSCAL's existing Client ID: `0oa25w11rdfgPBeZ80h8` |
| `OSCAL_GUARDIAN_SCOPES` | Space-separated confirmed API scopes |
| `OSCAL_GUARDIAN_TARGETS_JSON` | JSON array of target objects described below |

Each target object requires `id` (unique letters/digits/underscore/hyphen),
`label`, `url` (the actual approved endpoint on `guardian.amsgovcloud.com.au`),
`method` (`POST` or `PUT`), `payloadFormat` (`raw-ssp`) and `groups` (a nonempty
array of exact IAM-approved dedicated write-group names). URLs cannot include
credentials, fragments, queries or nonstandard ports. No endpoint defaults exist.

Use the project's deployment configuration mechanism; local `.env` already
exists but is not automatically a substitute for container/EC2 environment
configuration. Do not place access tokens or client secrets in these fields.

Update OSCAL's existing Okta scope settings with the approved scopes and confirm
its Authorization Server ID resolves to the issuer above. Keep OSCAL's own
registered callback. Changing API configuration requires a restart and fresh
Okta login to acquire an eligible delegated token.

## User workflow

1. Sign in to OSCAL with the configured corporate Okta provider.
2. Export the desired SSP JSON using the existing workflow.
3. On the export screen, open **Apply SSP to Guardian**.
4. Select an authorized target and upload the exported SSP (maximum 2 MiB).
5. Review the filename, document UUID and target. Confirm authorization to write.
6. Submit once. Record the returned operation reference and check Guardian for
   final completion. A 202/other 2xx response means accepted, not proven applied.

This is upload-and-confirm, not a Guardian remote preview/dry-run workflow.
After submission the same selection cannot be submitted again in the UI without
reselection. There is no cross-session/upstream idempotency guarantee. No
automatic retries are made. A timeout/network failure can occur **after** a
write; verify Guardian's state before deliberately retrying.

## Local API

- `GET /api/guardian/status`: authenticated status and authorized target labels;
  no endpoint URLs, tokens or group memberships are returned.
- `POST /api/guardian/apply`: explicit OSCAL session Bearer authentication;
  body fields: `targetId`, `ssp` (OSCAL document), `confirmed: true`.
- The backend forwards only its verified Okta access token to the fixed target.
  Client-supplied groups, identities, endpoint URLs and bearer overrides are not
  used. Strict schema validation runs again before dispatch.
- Errors: 400 invalid/unconfirmed document, 401 reauthentication required,
  403 permission/scope denied, 409 concurrent operation, 413 request too large,
  502 upstream result unknown, 503 disabled/unconfigured/unavailable.

## Token lifecycle and security

Tokens are private process-memory entries keyed by OSCAL session objects, not
properties on `req.user`, browser storage, configuration or user database files.
They expire at the earliest of JWT expiry, token-response lifetime and OSCAL
session expiry. Expiry timers and logout remove them; process restart drops them.
No refresh token is retained. Expiry requires fresh Okta sign-in.

The store follows existing process-local OSCAL session semantics. Multiple EC2
instances require the same routing/session affinity as existing OSCAL login; a
failover or restart requires reauthentication. This change does not create a
shared session store. Introduce encrypted shared sessions and token storage
together if seamless multi-instance continuity is required.

JWT signatures and claims are rechecked at status/apply time. JWKS cache lifetime
is 60 seconds; a newly rotated signing key may require retry after cache expiry.
HTTPS DNS results must all be public and are pinned to the actual request;
redirects and environment HTTP proxies are disabled. TLS verification remains on.
Logs contain operation references, target IDs, opaque actor/document hashes and
outcomes, not tokens, upstream response bodies or SSP content.

## Verification and rollback

Run the existing backend test command with the `guardianService.test.js` and
`guardianRoutes.test.js` paths, then frontend lint/build. Test an approved
non-production endpoint with authorized and unauthorized users before enabling
production. Verify wrong issuer/audience, expired tokens, missing scopes/groups,
local-login sessions, logout, target substitution, oversized/invalid SSPs,
redirects and unknown write outcomes. Verify normal OSCAL exports/sign-in remain
functional while disabled.

To roll back, set `OSCAL_GUARDIAN_ENABLED=false` and restart all backend
instances. Existing login/export behavior remains unchanged. No infrastructure,
Okta settings or production endpoint is changed automatically by this feature.
