<!-- Concept: Mukesh Kesharwani; Contact: mukesh.kesharwani@adobe.com -->
# Database Integration

Optional **PostgreSQL** (or AWS RDS) integration for storing custom and organisational context fields. When enabled, export data is synced to the database on every export; when the database is unreachable, export is blocked and the user is prompted to fix the connection or disable integration.

---

## Why Database Integration?

The official OSCAL JSON Schema defines **128 types** and **566 direct property fields**—enough for standards-compliant SSPs, catalogs, and profiles. In practice, most organisations need **39+ additional fields** for operational efficiency: responsible parties, review dates, evidence locations, testing procedures, risk ratings, framework mappings, CSP details, impact levels, and system lifecycle metadata. These are not first-class in the OSCAL schema, so they are stored as custom props or narrative parts in exports—and, when Database Integration is enabled, **persisted in a single schema-less table** for reporting, dashboards, and organisational context. Database Integration exists to bridge that gap: full OSCAL compliance in the document layer, plus the extra structure your operations need in one place.

| OSCAL schema (this application) | Operational reality |
|---------------------------------|----------------------|
| **128** definition types | **39+** additional fields needed by most organisations |
| **566** direct property keys in definitions | Stored as custom props + in `extended_data` when DB integration is on |
| **282** unique property names across the schema | Control-level (e.g. evidence, testing, frameworks) + system-level (CSP, impact, owner) |
| **961** total property occurrences in the schema | No schema change required when you add new custom fields |

*Source: `backend/oscal-schema.json` (OSCAL unified JSON Schema).*

---

## Overview

- **Where:** Platform Settings → **Database** tab (alongside API Gateway, SSO, Messaging, AI Integration).
- **Purpose:** Persist custom fields and system info (not first-class in the OSCAL schema) in a schema-less table for reporting and organisational context. The fields stored are listed in [Fields stored (not in OSCAL schema)](#fields-stored-not-in-oscal-schema) below.
- **Storage:** Single table `extended_data` (scope, scope_id, payload JSONB). No schema migrations needed when new fields are added.

---

## Configuration

1. Open **Settings** (gear icon) → **Database** tab.
2. Check **Enable Database Integration**.
3. Set **Host** (e.g. `nas.keekar.au` or RDS endpoint), **Port** (default 5432), **Database name**, **User**, **Password**.
4. Optionally set **SSL mode** (Require recommended for RDS) and **Connection timeout**.
5. Click **Save configuration**, then **Test connection** to verify.

Configuration is stored in `config.json` under `databaseConfig`. The password is masked in the UI and can be stored in pass (see [DEPLOYMENT_AND_OPERATIONS.md](DEPLOYMENT_AND_OPERATIONS.md) sensitive settings).

**AWS RDS IAM database authentication:** In Platform Settings → Database, choose **AWS RDS IAM database authentication** to use short-lived tokens from the EC2/task IAM role (no static database password in config). Requires SSL mode **Require** and a PostgreSQL user granted `rds_iam` on RDS. When deploying with Terraform, set `create_rds_postgres = true` so RDS, the IAM app user, and `OSCAL_DATABASE_*` systemd environment variables are provisioned on EC2 (see [DEPLOYMENT_AND_OPERATIONS.md](DEPLOYMENT_AND_OPERATIONS.md#aws-terraform-for-oscal-ai-via-bedrock)).

---

## Export behaviour

| Database Integration | Database reachable | On any export (OSCAL, SAR, PDF, Excel, CCM) |
|----------------------|--------------------|---------------------------------------------|
| **Disabled**         | N/A                | Export runs; no database write.             |
| **Enabled**          | Yes                | Data is synced to `extended_data`, then export runs. |
| **Enabled**          | No                 | Export is **blocked**. User sees: *Database update is not possible. Either disable Database Integration in Platform Settings to export without saving to the database, or fix the connection and try again.* Options: **Open Platform Settings** or **Cancel**. |

Sync runs at the start of each export (SSP, SAR, PDF, Excel, CCM), including async job-based exports. If sync fails (e.g. connection timeout), the export does not proceed.

---

## Database schema (extended_data)

- **Table:** `extended_data` (created on first use when Database Integration is enabled and connection succeeds).
- **Columns:** `id` (UUID), `scope`, `scope_id`, `payload` (JSONB), `created_at`, `updated_at`.
- **Unique:** `(scope, scope_id)`.
- **Scopes:**
  - **`ssp`** – one row per system. `scope_id` = system identifier (System ID, or System Name, or `default`). Payload = full system info and **always includes `systemId` and `systemName`** so the record is easy to identify and update.
  - **`control`** – one row per control **per system**. `scope_id` = **`systemScopeId::controlId`** (e.g. `04fbd24b-4c5d-47f2-9f22-916597341429::ism-0009`). This ensures data from different systems is **not comingled**: each system’s controls update only that system’s rows. Payload = control custom fields **plus `systemId` and `systemName`** from the owning system.

**Why `systemScopeId::controlId`?** If `scope_id` were only the control id (e.g. `ism-0009`), two different systems with the same control would overwrite the same row. Using a composite key keeps System A’s and System B’s data separate.

New keys in payload do not require schema changes; the table is designed to expand with usage.

## Guardian SSP Apply schema

### Existing concepts and ownership

The existing PostgreSQL objects are `public.extended_data` (mutable export
context, not full SSPs) and `public.adobe_teams` (team labels, not access
grants), created on demand by [dbClient.js](../backend/database/dbClient.js).
The export queue in [jobQueue.js](../backend/jobQueue.js) is memory/file-backed,
not a database job table. Guardian currently authorizes configured groups and
performs synchronous outbound calls in [guardianService.js](../backend/guardianService.js).
None provides a persistent SSP Apply lifecycle or append-only database audit.

[001_guardian_ssp_apply.sql](../backend/database/migrations/001_guardian_ssp_apply.sql)
therefore introduces three tables in the approved **`oscal_guardian`** schema.
The existing app tables, export paths, configured Guardian group checks, and
deployment/bootstrap scripts are unchanged. This is schema preparation only:
no API/worker persistence adapter is wired, and database mappings do not
silently replace the current configured group policy.

The dedicated schema is necessary because both the
[RDS bootstrap template](../terraform/templates/oscal-rds-bootstrap.sh.tftpl)
and [deployment bootstrap script](../scripts/lib/rds-bootstrap-on-instance.sh)
grant the app role ALL privileges on all tables/sequences in `public`.
Their repeat execution must not grant access to Guardian audit history.
The earlier unexecuted public-schema draft has been replaced, not deployed.
If any draft objects already exist in `public`, the migration stops for
owner-approved reconciliation rather than duplicating/moving/dropping them.
The requested Guardian-side `deploy/ssp-worker/migrations/001_init.sql` is
absent from this checkout; proceeding from the feature brief without that
comparison was explicitly approved.

### Tables and data contract

| Table | Purpose and constraints |
| --- | --- |
| `oscal_guardian.ssp_apply_jobs` | UUID retrieval key, target and requester, input/output SSP JSONB, opaque operation reference, non-sensitive failure code, lifecycle timestamps. States: `queued`, `processing`, `accepted`, `completed`, `failed`, `unknown`. Completed/failed rows require `finished_at`; completion also requires output SSP. Queue and requester/time indexes support polling and user history. |
| `oscal_guardian.target_authorizations` | One unique `(target_id, principal_type, principal_id)` mapping, with `group`/`user` allowlist, enabled flag and creator/timestamps. A partial principal index covers enabled mappings. No target endpoint URLs are stored. |
| `oscal_guardian.authorization_audit_events` | Serial-backed bigint key, actor/target/event metadata, optional principal pair and job FK. Target/time and job/time indexes support owner-operated audit queries. Referenced jobs cannot be deleted. No SSP content or credentials belong in `event_data`. |

SSP documents are stored in PostgreSQL, as approved, not at invented external
artifact locations. Retrieve by job UUID using parameterized SQL, then check
the authenticated requester and current target authorization before returning
any input/output JSON; UUID knowledge alone is not authorization. Subjects
and user principal IDs must be stable, issuer-qualified identifiers, not
display names. Group IDs must be exact approved identifiers. The schema does
not seed any users/groups or grant any target access by default.

`accepted` means only upstream acceptance, never completion; a timeout or
ambiguous write belongs in `unknown`, not `failed`/`completed`. The approved
state vocabulary extends the export queue's four states for these distinctions.
The worker must update `updated_at` and lifecycle fields together, claim jobs
atomically, and verify upstream results before completion. The database checks
state/field consistency, not a complete worker transition/retry policy.
It checks only SSP object shape, not OSCAL conformance.

### Least privilege

| Non-login role group | Privileges on Guardian objects |
| --- | --- |
| `oscal_guardian_ssp_apply_service` | SELECT/INSERT jobs, UPDATE only lifecycle/output fields; SELECT authorization mappings; no audit table or sequence access. Cannot alter a job's requester, target, ID, input, or creation timestamp. |
| `oscal_guardian_ssp_apply_admin` | SELECT/INSERT/UPDATE/DELETE mappings; INSERT only audit event fields (not the generated ID/timestamp); USAGE only on `authorization_audit_events_id_seq`. No job access, audit SELECT/UPDATE/DELETE/TRUNCATE, or sequence reset. |

Neither runtime group owns objects or receives schema CREATE. Append-only is
enforced by runtime privileges; a trusted object owner/database superuser can
still perform maintenance. The admin writer cannot use `INSERT ... RETURNING`
on audit columns without SELECT; append without RETURNING. Mapping changes
and their audit inserts should share one application transaction.

The migration executor owns the new objects, and needs database CREATE plus
CREATEROLE/appropriate administration of the two groups. Existing role names
must already be restricted non-login groups without memberships in other roles,
or migration fails without altering them. Global default privileges that leak
new object access to unrelated roles cause a transactional failure rather than
broad revocations. No `ALTER DEFAULT PRIVILEGES`, login assignment, IAM grant,
connection configuration, or infrastructure change is made by this migration.

Platform owners must assign distinct runtime logins to these groups, without
cross-membership, broad built-in roles, or owner/admin inheritance. Do not reuse
the existing `oscal_app` identity or the migration owner as either runtime.
Retention of SSP JSON and audit records and any privileged audit reader remain
owner decisions; the admin writer deliberately has no audit read access.

### Migration workflow, rollback, and tests

This is the first versioned SQL migration in this repository; there is no
existing runner or deployment hook to extend. It follows existing lowercase
names, UUID/JSONB/timestamptz types, constraints, indexes, and `IF NOT EXISTS`
creation conventions, wrapped in one transaction and a transaction advisory
lock. Reapply under the **same object owner**; reruns preserve rows, but are
not a general schema-drift repair mechanism.

Only disposable local PostgreSQL is used by the new test runner:

```sh
bash test_cases/database/run-guardian-ssp-apply.sh
```

[run-guardian-ssp-apply.sh](../test_cases/database/run-guardian-ssp-apply.sh)
requires local Docker, uses PostgreSQL 16 (the configured RDS major), refuses
remote/overridden Docker contexts, and starts a disposable container with no
network or published ports and tmpfs storage. Trust authentication is confined
to that isolated test container, requires no password, and is not deployment
configuration. The container is removed on exit; no database URL is accepted.
The runner tests restricted migration-owner execution, failure rollback,
fresh/repeat application, hostile global default grants, both runtime roles,
SSP JSON round-trips, constraints, public bootstrap reexecution, and legacy
table access using [SQL assertions](../test_cases/database/guardian_ssp_apply_permissions.sql).
The JSON fixtures are intentionally minimal and are **not valid representative
SSPs**. These database tests are separate from backend Jest and OSCAL validation.

There is deliberately no automatically destructive down migration. To back
out after an owner-approved deployment, first stop users of these objects,
revoke the separately assigned runtime memberships, and retain data pending
retention/export approval. Drop audit, mappings, jobs/indexes, the owned
sequence, and the empty schema only after that approval. Cluster-wide role
groups may be dropped only after confirming they have no other dependencies
or memberships. Never use a blanket `DROP SCHEMA ... CASCADE` as rollback.
No live application of this migration is part of this task.

## SSP document validation version

The workspace does **not** currently have a consistent official OSCAL version.
[oscal-schema.json](../backend/oscal-schema.json) has a `1.1.2`-derived `$id`,
but its `oscal-version` definition has been modified to allow only `2.1.0`.
[server.js](../backend/server.js) writes `2.1.0` and
[oscalValidatorAJV.js](../backend/oscalValidatorAJV.js) reports it.
The local schema is therefore not the unmodified official NIST `1.1.2` schema,
despite its identifier. Application version labels do not establish conformance.

Recommended official compatibility baseline, pinned to the schema's lineage:
[NIST OSCAL v1.1.2](https://github.com/usnistgov/OSCAL/releases/tag/v1.1.2),
specifically the official
[oscal_ssp_schema.json release asset](https://github.com/usnistgov/OSCAL/releases/download/v1.1.2/oscal_ssp_schema.json)
(JSON Schema draft-07):

```text
SHA-256: 08d3faeb12f0fab7705dec15fb648c72400c7ab6ac0056222d49d21507e02a69
$id: http://csrc.nist.gov/ns/oscal/1.1.2/oscal-ssp-schema.json
```

The asset and checksum were verified independently of the bundled schema.
This recommendation does not silently change existing exports or validation.
Owners must approve an official document version, reconcile the local `2.1.0`
enum/generator, and validate a representative generated SSP against the pinned
official SSP schema using an approved validator with strict required fields,
formats, enums and additional-property checks. No representative SSP has
passed that check as part of this work; no official schema certification is
claimed. PostgreSQL migration/schema tests do not validate OSCAL documents.

---

## Fields stored (not in OSCAL schema)

The database stores **only custom/operational fields**, not content that is already part of the OSCAL document. The implementation narrative and `remarks` are **not** synced: they are first-class or nested in the OSCAL schema (`implemented-requirement.statements[].parts[].prose` and `implemented-requirement.remarks`) and would duplicate the SSP. The DB is for reporting and organisational context, not for duplicating OSCAL schema content.

The OSCAL `implemented-requirement` type defines: `uuid`, `control-id`, `props`, `links`, `set-parameters`, `responsible-roles`, `statements`, `by-components`, and `remarks`. The application uses the following as **custom props** (or in narrative parts); only these are synced to `extended_data`.

| Application field (internal) | Prop name in OSCAL export | UI label / usage |
|------------------------------|----------------------------|-------------------|
| `responsibleParty` | `responsible-party` | Responsible Party |
| `controlOwner` | `control-owner` | Control Inheritance/Implementation by Consumer |
| `consumerGuidance` | `consumer-guidance` | Consumer Guidance |
| `implementationDate` | `implementation-date` | Implementation Date |
| `reviewDate` | `review-date` | Last Review Date |
| `nextReviewDate` | `next-review-date` | Next Review Date |
| `controlType` | `control-type` | Control Type |
| `evidence` | `evidence` | Evidence/Artifacts Location |
| `testingObjective` | `testing-objective` | Assessment/Testing Objective |
| `testingProcedure` | `testing-procedure` | Testing Method / Procedure |
| `testingFrequency` | `testing-frequency` | Testing Frequency |
| `lastTestDate` | `last-test-date` | Last Test Date |
| `apiUrl` | `api-url` | API URL (for evidence/automation) |
| `apiCredentialId` | `api-credential-id` | API Credential ID |
| `apiResponseData` | `api-response-data` | API response data (JSON) |
| `apiDataHistory` | `api-data-history` | API data history (JSON) |
| `riskRating` | `risk-rating` | Risk Rating (e.g. when status is ineffective/not-implemented) |
| `frameworks` | `frameworks` | Related Frameworks/Standards / Mapped Frameworks |
| `compensatingControls` | `compensating-controls` | Compensating Controls |
| `exceptions` | `exceptions` | Exceptions/Deviations |

**Note:** `status` (implementation status) is exported as a prop (`implementation-status`); it is synced to the DB for reporting. The **implementation narrative** and **remarks** are part of the OSCAL schema (statements/parts/prose and `remarks`) and are **not** stored in the database to avoid duplicating OSCAL document content.

### System / metadata and organisational context (System Information form)

These are captured in the System Information step. OSCAL SSP `metadata` has a defined structure; the following are either mapped into metadata props/parties or are organisational extensions.

| Application field | UI label / usage |
|--------------------|-------------------|
| `systemName` | System Name |
| `systemId` | System ID |
| `description` | System Description |
| `authorizationBoundary` | Authorization Boundary |
| `organization` | Organisation |
| `systemOwner` | System Owner |
| `assessorDetails` | Assessor Details |
| `cspIaaS` | IaaS Provider |
| `cspPaaS` | PaaS Provider |
| `cspSaaS` | SaaS Provider |
| `securityLevel` | Security classification level (framework-specific) |
| `confidentiality` | Confidentiality impact level |
| `integrity` | Integrity impact level |
| `availability` | Availability impact level |
| `status` | System status (e.g. under-development) |
| `systemType` | System Type |
| `authorizationDate` | Authorization Date |

### Where these are defined in the codebase

- **Backend export (custom props mapping):** [backend/server.js](../backend/server.js) — `customFieldsMapping` (control-level fields).
- **Backend import (reading from OSCAL):** [backend/sspComparisonV3.js](../backend/sspComparisonV3.js) — extraction of control-level fields from `implemented-requirement.props`.
- **Frontend control editing:** [frontend/src/components/ControlEditModal.jsx](../frontend/src/components/ControlEditModal.jsx), [ControlItem.jsx](../frontend/src/components/ControlItem.jsx), [ControlItemCCM.jsx](../frontend/src/components/ControlItemCCM.jsx).
- **Frontend system info:** [frontend/src/components/SystemInfoForm.jsx](../frontend/src/components/SystemInfoForm.jsx).
- **Export option:** “Flag custom fields not defined in OSCAL schema” in [frontend/src/components/ExportButtons.jsx](../frontend/src/components/ExportButtons.jsx) refers to these extensions.

Control-level data in the database is keyed by `scope: 'control'` and `scope_id: systemScopeId::control.id` (so each system’s controls are separate). System-level by `scope: 'ssp'` and `scope_id` (system ID or name). Every row’s payload includes `systemId` and `systemName` where applicable for clear identification.

---

## OSCAL schema at a glance

Counts below are derived from `backend/oscal-schema.json` (OSCAL unified JSON Schema). They illustrate the size of the official schema relative to the 39+ operational fields this application adds via Database Integration.

| Metric | Count | Notes |
|--------|-------|--------|
| **Definition names (types)** | 128 | e.g. `system-security-plan`, `implemented-requirement`, `metadata`, `control`, `party` |
| **Definitions with direct `properties`** | 95 | Types that define their own property set |
| **Unique property names (field names)** | 282 | Distinct field names across the entire schema |
| **Total property occurrences** | 961 | Every `properties` key in the schema (nested included) |
| **Direct property keys** | 566 | Property keys defined directly on definition objects |

*Derived from the workspace-modified JSON Schema, which reports `2.1.0`
despite a NIST `1.1.2`-derived identifier; not an official schema certification.*

---

## Related documentation

- [DEPLOYMENT_AND_OPERATIONS.md](DEPLOYMENT_AND_OPERATIONS.md) – Config paths, sensitive settings (pass), and deployment.
- [ARCHITECTURE.md](ARCHITECTURE.md) – Overall system design.

---

**Version:** 1.7.27 · **Last updated:** July 2026
