---
name: guardian-integration-handover
description: "Mandatory for EVERY change to the OSCAL Reports application: backend, frontend, dependencies, configuration, Terraform, auth or SSO, Docker, docs, or anything touching the Guardian Agent integration. Use when: editing code, upgrading packages, changing login or group handling, changing environment variables, finishing a task, or preparing a commit or PR. Requires integration tests for BOTH identity providers, Okta and Authentik (Generic SSO), together with the Guardian Agent, and writes the change handover to the Guardian coding assistant in /Users/mkesharw/Documents/GuardianAgent."
argument-hint: "Short description of the change being handed over"
---

<!-- Concept: Mukesh Kesharwani; Contact: mukesh.kesharwani@adobe.com -->

# Okta + Authentik + Guardian integration test and change handover

Two repositories are developed by two coding assistants:

| Repository | Owner (single writer) |
| --- | --- |
| `/Users/mkesharw/Documents/OSCAL_Reports` (this workspace) | this assistant |
| `/Users/mkesharw/Documents/GuardianAgent` | the Guardian coding assistant |

**Never edit files in the Guardian checkout.** Coordinate only by handover. Never run Guardian's deploy commands (`plan`, `apply`) or touch live AWS from here.

A change is **not finished** until both steps below are done. This applies to every change, including ones that look unrelated to Guardian: a dependency bump, a login change or a renamed environment variable can break the integration silently.

## Step 1: Run the integration test

```sh
GUARDIAN_ACCEPTANCE_REPORT=/path/to/a/real/SSP.json \
  .github/skills/guardian-integration-handover/scripts/verify-guardian-integration.sh
```

Add `--full` to include the whole backend suite (use it after dependency, auth or server changes).
The script runs, in order: the Guardian backend and auth suites; the **IdP flows** for Okta and Authentik; the real-cache harness that calls Guardian with **both** an Okta-shaped and an Authentik-shaped token; the Chrome browser workflow tests; the frontend production build; and `git diff --check`.

### Required coverage: every change, all three parties

A change is not verified unless all of these ran, whatever the change touched:

| Party | Automated check | What it proves | Evidence type |
| --- | --- | --- | --- |
| Okta | `idpGuardianFlows.test.js` (Okta sign-in, role mapping, delegated-token retention, primary endpoint) plus the Okta-shaped harness pass | Okta wiring and Guardian with an Okta-shaped token | mocked IdP, real cached data, test-only auth |
| Authentik (Generic SSO) | `idpGuardianFlows.test.js` (group gate, access-token retention and verification, Authentik endpoint) plus the Authentik-shaped harness pass with its two denials (401 no custom scope, 403 group not granted) | Authentik wiring and Guardian with an Authentik-shaped token | mocked IdP, real cached data, test-only auth |
| Guardian Agent | the harness itself, run against the Guardian checkout's real gateway and real cached assessments | the provider contract, patch preview and denials | real provider code, test-only auth |

The script **fails** if either token shape or either denial is missing from the harness output, and it reports an **INCOMPLETE** result when the harness could not run. Do not work around a gap by editing the script or by removing an IdP from a test. If a change adds or alters an IdP path, add or extend a test for it in the same change.

**Real sign-in is manual.** No automated check performs a real Okta or Authentik login. When a change touches sign-in, group or role mapping, token retention or the Guardian page, ask the user to sign in once with each IdP and confirm the Guardian page behaves correctly, and record "manual real sign-in: Okta done or not done, Authentik done or not done" in the handover. Never write that a real sign-in worked unless the user confirmed it.

Read its result strictly:

- **PASS** (exit 0): every check ran and passed.
- **FAIL** (exit 1): fix the cause. Do not hand over a failing change as done.
- **INCOMPLETE** (exit 2): a check was skipped, usually because no real report or no Guardian cache was available. A skipped check is **not** a pass. Say so in the handover and name what was not exercised.

Run additional checks when relevant: the dependency scan (`npm audit` in `backend/`, `frontend/` and the root) after any package change, and the Terraform audit skill after any `.tf` change.

### Honesty rules for the receipt

- State which evidence is real, which is mocked and which uses test-only authentication. The browser tests mock the Guardian responses. The real-cache harness uses real cached assessments with **test-only** signed identities. Neither proves real Okta or Authentik authentication. Never write "tested end to end" unless real authentication was exercised.
- Report counts exactly as the tools print them (tests passed and skipped, controls, findings). Do not round up or infer.
- A skipped or failing step goes in the handover as such.

## Step 2: Write the change handover

1. Copy the entry template in [handover-template.md](./references/handover-template.md) and add the entry **at the top** of `docs/GUARDIAN_HANDOVERS.md` (newest first).
2. Classify the change: **none** (no effect on Guardian), **informational** (Guardian should know, no action) or **action required** (Guardian must change, deploy or answer something).
3. Fill every section. Mark each fact **VERIFIED** (read from a file, command or response in this session), **UNKNOWN - owner must supply**, or **PROPOSED**. Never invent a value.
4. For a change classified **none**, keep the entry to a few lines: what changed, why it cannot affect Guardian, and the test receipt.
5. Send the handover to the Guardian coding assistant with `send_message`. Find the current session with `list_sessions` or `get_session_context` and verify it is the Guardian checkout's session; do not rely on a remembered session address. Send a short message that names the ledger file and states the classification, the action needed (if any) and the receipt. Do not paste whole files.
6. Do not paste secrets, tokens, passwords, personal data or report contents into the ledger or the message. Report names of variables and claims, never values.

## What counts as a Guardian contract change

Classify as **action required** when the change touches any of these, because Guardian depends on them:

- Endpoint paths, request or response shapes, or the preview patch format (`/v1/guardian/...`).
- Which token is sent (access versus ID), which claims or scopes are required, or how groups are matched.
- Environment variable names or meaning (`OSCAL_GUARDIAN_*`), the allowed-host rule, or the endpoint-per-issuer mapping.
- Run or target identifier rules, pagination handling, or the projection (eligible controls and properties).
- Where OSCAL expects Guardian-side configuration such as grants, issuer contracts or the assessment plan reference.

Classify as **informational** for changes that alter behavior Guardian observes but does not need to change, such as new audit log fields, error messages, the Node runtime version or dependency majors.

## Consumer facts to keep consistent

Read these from the repository, not from memory, when writing a handover:

- Consumer guide: [docs/GUARDIAN_ASSESSMENTS.md](../../../docs/GUARDIAN_ASSESSMENTS.md).
- Deploy inputs and open owner items: [docs/GUARDIAN_DEPLOY_INPUTS.md](../../../docs/GUARDIAN_DEPLOY_INPUTS.md).
- Provider contract (owned by Guardian, read only): `/Users/mkesharw/Documents/GuardianAgent/docs/GUARDIAN-OSCAL-ASSESSMENT-API.md`.
- If the two descriptions differ, report the difference in the handover rather than silently choosing one.

## Definition of done

- [ ] The verification script ran and its result is recorded (PASS, FAIL fixed, or INCOMPLETE with reasons), covering Okta, Authentik and Guardian.
- [ ] Manual real sign-in with Okta and with Authentik is recorded as done or not done, when the change touches sign-in or Guardian.
- [ ] An entry is at the top of `docs/GUARDIAN_HANDOVERS.md` with a classification.
- [ ] The Guardian assistant was messaged, or the reason it could not be is recorded.
- [ ] No file in the Guardian checkout was modified, and no secret appears in any handover.
