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
3. Set **Host** (e.g. `nas.keekar.com` or RDS endpoint), **Port** (default 5432), **Database name**, **User**, **Password**.
4. Optionally set **SSL mode** (Require recommended for RDS) and **Connection timeout**.
5. Click **Save configuration**, then **Test connection** to verify.

Configuration is stored in `config.json` under `databaseConfig`. The password is masked in the UI and can be stored in pass (see [DEPLOYMENT.md](DEPLOYMENT.md) sensitive settings).

**AWS RDS IAM database authentication:** In Platform Settings → Database, choose **AWS RDS IAM database authentication** to use short-lived tokens from the EC2/task IAM role (no static database password in config). Requires SSL mode **Require** and a PostgreSQL user granted `rds_iam` on RDS. When deploying with Terraform, set `create_rds_postgres = true` so RDS, the IAM app user, and `OSCAL_DATABASE_*` systemd environment variables are provisioned on EC2 (see [AWS_TERRAFORM.md](AWS_TERRAFORM.md)).

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

*Generated from the schema used by the application for validation (OSCAL v2.1.0 / JSON Schema).*

---

## Related documentation

- [DEPLOYMENT.md](DEPLOYMENT.md) – Config paths, sensitive settings (pass), and deployment.
- [ARCHITECTURE.md](ARCHITECTURE.md) – Overall system design.

---

**Version:** 1.7.x · **Last updated:** March 2026
