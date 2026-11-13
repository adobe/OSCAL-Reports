<!-- Concept: Mukesh Kesharwani; Contact: mukesh.kesharwani@adobe.com -->

# Handover entry template

Copy the block below to the **top** of `docs/GUARDIAN_HANDOVERS.md`. Mark every fact
`VERIFIED`, `UNKNOWN - owner must supply` or `PROPOSED`. No secrets, tokens, passwords or report contents.

```markdown
## YYYY-MM-DD: <short title>

**Classification:** none | informational | action required
**From:** OSCAL Reports assistant, repository state `<git short hash or "uncommitted">`
**To:** Guardian coding assistant (`/Users/mkesharw/Documents/GuardianAgent`)

### What changed
<One to five lines. Name the files or areas.>

### Effect on the Guardian contract
<Endpoints, payloads, token or claims, group matching, environment variable names, host rules.
Write "No change" and why, when classified none.>

### Action requested from Guardian
<Numbered list of exactly what Guardian must change, deploy, confirm or answer. "None" if none.
Do not ask Guardian to apply anything live; apply is always a separate, approved step.>

### Test receipt
| Check | Result | Evidence type |
| --- | --- | --- |
| Backend Guardian and auth suites | <N passed, M skipped> | real code, mocked upstream |
| IdP flows: Okta | <N passed> (sign-in, role mapping, token retention, endpoint) | mocked IdP |
| IdP flows: Authentik | <N passed> (group gate, access-token verification, endpoint) | mocked IdP |
| Guardian with Okta-shaped token | <findings, eligible, updated> or SKIPPED: <reason> | real cached assessments, test-only auth |
| Guardian with Authentik-shaped token | <findings, eligible, updated, denials 401/403> or SKIPPED: <reason> | real cached assessments, test-only auth |
| Manual real sign-in | Okta: done / not done; Authentik: done / not done | user-confirmed only |
| Browser workflow tests | <N passed> or SKIPPED: <reason> | mocked Guardian responses |
| Frontend build | passed or failed | |
| Dependency scan | <counts> or not applicable | |

Command run: `<exact command>`
Overall result: PASS | FAIL | INCOMPLETE

### Not verified
<What was not exercised: real authentication, live endpoints, live AWS, anything skipped.>

### Rollback
<How to undo this change. For configuration: which variable or drop-in to remove.>

### Open items and blockers
<Owner-controlled prerequisites still outstanding. Mark UNKNOWN where not verifiable.>
```

## Message to the Guardian assistant

Keep it to a short paragraph. Name the ledger file, the date and title of the entry, the classification,
the action requested (or "none"), and the receipt result including anything skipped. Example shape:

> OSCAL -> Guardian: handover logged in docs/GUARDIAN_HANDOVERS.md ("<date>: <title>"), classification <x>.
> Action: <none | what>. Receipt: <PASS/FAIL/INCOMPLETE>, <counts>, not verified: <list>.
