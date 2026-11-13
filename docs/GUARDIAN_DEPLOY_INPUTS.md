<!--
Concept: Mukesh Kesharwani
Contact: mukesh.kesharwani@adobe.com
-->

# Guardian deploy inputs from the OSCAL Reports repository

Answers to the Guardian deployment questionnaire. Every item is marked:

- **VERIFIED-in-repo**: read from a tracked file (path given) or from the runtime configuration on the developer machine (stated).
- **VERIFIED-live-read**: public metadata fetched during this review (stated).
- **PROPOSED**: a suggestion, not an existing fact.
- **UNKNOWN - owner must supply**: not present in this repository or its configuration.

No secrets, tokens or passwords appear here. Only non-secret keys were taken from runtime configuration (the Generic SSO discovery URL and whether a client ID is set). Nothing in this
document has been applied to AWS.

## Decisions received from Guardian (these supersede earlier sections)

1. **Authorization is Guardian-owned**: Terraform `target_grants` feeding Lambda environment variables, changed by a reviewed Terraform apply.
   The OSCAL `oscal_guardian.target_authorizations` table and the cross-account network gap are **out of scope** for the assessment routes.
   No reader migration and no database adapter will be written. Sections 1 and 2 are kept only as the record of what this repository contains.
2. **First deployment is Authentik-only.** Okta is added later without a code change.
3. **Endpoint keys changed.** Guardian's Terraform output `assessment_api_endpoints` is keyed by issuer label: `authentik` now and `default` (Okta) later.
   The earlier `primary` / `extra-0` names are obsolete. The Authentik endpoint does not change when Okta is added.
4. **Environments are independent.** Guardian targets account `387219500231` in `ap-southeast-2` (stg). The OSCAL environment in this repository is account
   `442277170733` in `us-east-1`. No cross-account access is needed. (Both account numbers are as stated by the respective owners; I verified only the OSCAL one.)
5. The "not configured" message in the application now names the outstanding owner prerequisites (see section 6).

## Summary of blockers

With Guardian's decisions applied, the OSCAL side is code-complete for an Authentik-only first deployment. What remains is owner-controlled and listed in section 6:
the Guardian deploy, the Authentik scope, groups claim and signing configuration, `sso.keekar.au` resolving to a public address from public DNS and being reachable from AWS (to confirm from AWS; plain DNS on the owner's network is rewritten, see the Authentik issuer section), the client ID, and the assessment plan reference.
The earlier database and network blockers no longer apply to the assessment routes.

## 1. Target-authorization database (OUT OF SCOPE per Guardian decision 1)

| Question | Answer | Status |
| --- | --- | --- |
| Does `ssp_apply_target_authz` exist? | **No.** That name appears nowhere in this repository. | VERIFIED-in-repo |
| Which table does exist? | `oscal_guardian.target_authorizations`, created by `backend/database/migrations/001_guardian_ssp_apply.sql` in schema `oscal_guardian` (not `public`). | VERIFIED-in-repo |
| Columns | `id` UUID PK, `target_id` TEXT (non-blank), `principal_type` (`group` or `user`), `principal_id` TEXT (non-blank), `enabled` BOOLEAN default true, `created_by_subject` TEXT, `created_at`, `updated_at`. Unique on `(target_id, principal_type, principal_id)`. | VERIFIED-in-repo |
| Shape difference | One row per principal. There are **no** `target_key`, `allowed_group_ids` or `allowed_user_subs` array columns. Guardian must aggregate rows, or the owners must agree a different shape. | VERIFIED-in-repo |
| Other tables in the schema | `ssp_apply_jobs` and `authorization_audit_events`. | VERIFIED-in-repo |
| Has the migration been applied to the stage database? | UNKNOWN - owner must supply. `docs/DATABASE_INTEGRATION.md` calls it "schema preparation only", and the repo has no runner. | UNKNOWN |
| Who writes the table? | Nothing in the OSCAL application reads or writes it (no route, no Settings page, no adapter). The migration grants write access to the NOLOGIN group `oscal_guardian_ssp_apply_admin`. | VERIFIED-in-repo |
| Runtime logins | The groups `oscal_guardian_ssp_apply_service` and `oscal_guardian_ssp_apply_admin` are created NOLOGIN. `docs/DATABASE_INTEGRATION.md` says platform owners must assign distinct logins; none are defined in this repository. | VERIFIED-in-repo / assignment UNKNOWN |
| Guardian-side migration | `docs/DATABASE_INTEGRATION.md` states the Guardian-side `deploy/ssp-worker/migrations/001_init.sql` was absent from this checkout. | VERIFIED-in-repo |
| Secret `guardian-stg-ssp-apply-db-svc` | Not referenced anywhere in this repository. | UNKNOWN - owner must supply |

### Least privilege: the existing group is too broad for a read-only reader

`oscal_guardian_ssp_apply_service` has `SELECT` on `target_authorizations` **and**
`SELECT/INSERT` plus limited `UPDATE` on `ssp_apply_jobs`. A Guardian read-only
assessment API needs only `SELECT` on `target_authorizations`. The existing group
therefore exceeds "SELECT on that table only".

**PROPOSED:** add `002_guardian_authorization_reader.sql` in this repository that creates a NOLOGIN
group (for example `oscal_guardian_authorization_reader`) with `USAGE` on the schema and
`SELECT` on `oscal_guardian.target_authorizations` only. I will write it only on request.

### PROPOSED mapping to Guardian's expected shape (not implemented)

Store the Guardian target key in `target_id` and one row per principal:

| Guardian concept | Column value |
| --- | --- |
| `target_key` | `target_id`, for example `cloudflare#PROD_AEMGovAu` |
| `allowed_group_ids[n]` | a row with `principal_type = 'group'` and `principal_id = '<group id>'` |
| `allowed_user_subs[n]` | a row with `principal_type = 'user'` and `principal_id = '<issuer-qualified sub>'` |

Guardian would read with `SELECT principal_type, principal_id FROM oscal_guardian.target_authorizations WHERE target_id = $1 AND enabled`
and build the two arrays. The Authentik group is namespaced by Guardian as `authentik:<group>`, so the stored
`principal_id` for that group would be `authentik:<exact group name>`. Group names must be the owner-approved values; none are seeded.

### Write path for rows (exact SQL shape, values are placeholders)

There is no UI. The only write path is SQL run by the migration owner or by a login that is a member of
`oscal_guardian_ssp_apply_admin`. `docs/DATABASE_INTEGRATION.md` requires the mapping change and its audit row to share one transaction,
and the admin group has no `SELECT` on the audit table, so do not use `RETURNING` on it:

```sql
BEGIN;
INSERT INTO oscal_guardian.target_authorizations
  (target_id, principal_type, principal_id, created_by_subject)
VALUES ('<provider>#<targetId>', 'group', '<approved group id>', '<issuer-qualified actor subject>');
INSERT INTO oscal_guardian.authorization_audit_events
  (target_id, actor_subject, event_type, principal_type, principal_id, event_data)
VALUES ('<provider>#<targetId>', '<issuer-qualified actor subject>', 'grant', 'group', '<approved group id>', '{}'::jsonb);
COMMIT;
```

To revoke, set `enabled = false` and `updated_at = now()` rather than deleting, and write an audit row in the same transaction.

## 2. Network (OUT OF SCOPE per Guardian decision 1)

| Question | Answer | Status |
| --- | --- | --- |
| Database engine and access | RDS PostgreSQL, `publicly_accessible = false`, private subnets with no internet-gateway route, `iam_database_authentication_enabled = true`, port 5432. Engine default 16.13. | VERIFIED-in-repo (`terraform/rds.tf`, `terraform/variables.tf`) |
| RDS Proxy | **None.** No `aws_db_proxy` resource exists. | VERIFIED-in-repo |
| Database name | Default `oscal`; confirm the deployed value from the Terraform output `rds_database_name`. | VERIFIED-in-repo (default) |
| Host | Terraform output `rds_endpoint` (port `rds_port`). The value is not stored in the repository. | UNKNOWN - owner must supply (`terraform output`) |
| AWS account | `442277170733`, named in `terraform/envs/aws4403/README.md` for the `aws4403` environment. | VERIFIED-in-repo |
| Region | `us-east-1`: the variable default and the local gitignored `terraform/envs/aws4403/terraform.tfvars`. | VERIFIED-in-repo / local config |
| Environment label | The local `terraform.tfvars` sets `environment = "prod"`, while you describe the database as "stage". Please confirm which environment is meant. | UNKNOWN - owner must confirm |
| VPC | Resource `aws_vpc.main`, CIDR `10.0.0.0/16` in the local tfvars; output `vpc_id`. | VERIFIED-in-repo |
| Private subnets | Two subnets `aws_subnet.private_rds`, CIDR `cidrsubnet(vpc_cidr, 8, 10 + n)` (`10.0.10.0/24` and `10.0.11.0/24` for the default CIDR), no public IP on launch. Real subnet IDs are not in the repository. | VERIFIED-in-repo / IDs UNKNOWN |
| Database security group | `aws_security_group.rds`. Ingress on 5432 is allowed **only** from the OSCAL EC2 security group `aws_security_group.oscal`, plus any CIDRs in `rds_additional_ingress_ipv4_cidr_blocks` (default empty). | VERIFIED-in-repo |
| Security group and subnet IDs a Guardian Lambda may use | UNKNOWN - owner must supply. A Guardian function would need its own security group added to the database ingress, or an approved CIDR. | UNKNOWN |
| Reachability from the Guardian account | **No peering, transit gateway or PrivateLink exists in this repository.** Per Guardian's message its API endpoints are in `ap-southeast-2` (not verifiable here), while the database is in `us-east-1` in a private VPC. With the current configuration it is not reachable. | VERIFIED-in-repo (absence) |
| Alternative to a network path | **PROPOSED:** Guardian could read authorizations through an OSCAL-owned read endpoint instead of a direct database connection. This does not exist today. | PROPOSED |

## 3. Authentication contracts

### Okta (existing delegated-user path)

No approved values are held in this repository. `docs/GUARDIAN_INTEGRATION.md` describes the settings, and
`OSCAL_GUARDIAN_ISSUER`, `OSCAL_GUARDIAN_JWKS_URL`, `OSCAL_GUARDIAN_AUDIENCE`, `OSCAL_GUARDIAN_CLIENT_ID` and
`OSCAL_GUARDIAN_SCOPES` are read from the runtime environment. Their real values are
**UNKNOWN - owner must supply**: issuer, JWKS host, resource audience, client IDs (`cid`), required scopes, write group
and token discriminator. OSCAL's code requires: RS256, an `/oauth2/<id>` custom authorization server issuer, an audience that differs from the client ID,
`scp` as an array, and `groups` as an array.

### Authentik (Generic SSO)

| Item | Answer | Status |
| --- | --- | --- |
| Issuer | `https://sso.keekar.au/application/o/oscal-report-generator/` (trailing slash) | VERIFIED-live-read (discovery document) and local runtime config |
| JWKS URL | `https://sso.keekar.au/application/o/oscal-report-generator/jwks/` | VERIFIED-live-read |
| `client_id` (audience) | Present in the runtime config key `ssoConfig.oauth.providers.Generic_OIDC.clientId`. The value is not copied here; the owner supplies it. | UNKNOWN - owner must supply |
| Custom scope name | None exists. The provider advertises only `openid`, `email`, `profile`. | VERIFIED-live-read (absence) / name UNKNOWN |
| `groups` claim in the **access** token | UNKNOWN. The discovery document lists `groups` among supported claims, which does not show it is in the access token. An earlier OSCAL sign-in resolved 2 groups while Authentik showed 9 for the same user; this was never explained. | UNKNOWN - owner must confirm with a decoded access token |
| RS256 key assigned | The discovery document lists only RS256 for ID tokens. Access-token signing for this provider is not confirmed. | UNKNOWN - owner must confirm |
| `sso.keekar.au` publicly resolvable | **Probably YES; the earlier "NO" was a network artefact.** Plain (unencrypted) DNS from the owner's network returns `10.100.3.74` even from the authoritative servers, with TTL 0, and that address equals the owner's pfSense WAN IP, which points to DNS response rewriting on that network path. Encrypted DNS (DoH to Google and Cloudflare, also reproduced by OSCAL via `https://1.1.1.1/dns-query`) returns `103.160.130.243`, TTL 300. The true public record is therefore `103.160.130.243` (owner finding). The owner's LAN resolver also returns it. Guardian independently confirmed (2026-11-13): TLS to `103.160.130.243` with SNI `sso.keekar.au` serves the discovery document and JWKS with HTTP 200 and a valid certificate. Not yet confirmed from AWS itself; the first real authenticated request will show it. | VERIFIED by owner, OSCAL and Guardian via DoH and direct TLS from a non-AWS network; AWS-side resolution and reachability UNKNOWN |

**Scope caveat for the discriminator.** OSCAL reads the login scopes from the runtime key
`ssoConfig.oauth.providers.Generic_OIDC.scope` (currently `openid profile email`) and sends them in the
`/authorize` request for **every** Generic SSO sign-in (`backend/server.js`, generic OIDC authorize route). OSCAL cannot request a
scope only for the token exchange. To avoid issuing the discriminator scope to everyone, Authentik must grant it only to members of the approved
group (a scope mapping or policy), and OSCAL then keeps the access token only for privileged sessions.

## 4. Assessment plan

`GUARDIAN_ASSESSMENT_PLAN_HREF`: **UNKNOWN - owner must supply.** No assessment-plan URL or UUID exists in this repository.

## 5. Consumer deployment (OSCAL backend)

For Docker, Compose and TrueNAS use the template `.env.docker.example` and follow [GUARDIAN_SSO_DOCKER_DEPLOYMENT.md](GUARDIAN_SSO_DOCKER_DEPLOYMENT.md); the table below lists the same variables.

Values shape only; none are invented. All are read at runtime from the backend environment.

| Variable | Value shape | Required when |
| --- | --- | --- |
| `OSCAL_GUARDIAN_ASSESSMENTS_ENABLED` | `true` | always |
| `OSCAL_GUARDIAN_ASSESSMENTS_URL` | `https://<host>/v1/guardian` for the Okta (`default`) endpoint, port 443 | **leave unset for the first deploy**; the Okta path then stays not configured |
| `OSCAL_GUARDIAN_GENERIC_SSO_ASSESSMENTS_URL` | `https://<host>/v1/guardian` from the `authentik` key of `assessment_api_endpoints`, port 443 | Authentik path (first deploy) |
| `OSCAL_GUARDIAN_ASSESSMENTS_ALLOWED_HOSTS` | comma-separated exact lowercase hostnames, no wildcards: every host used above (first deploy: only the `authentik` host) | always |
| `OSCAL_GUARDIAN_ASSESSMENT_TARGETS_JSON` | `[{"provider":"cloudflare\|okta","targetId":"...","label":"...","groups":["<exact group name from the Authentik access token>"]}]`, at most 100. Guardian applies its own namespaced grant (`authentik:<group>`) independently. | always |
| `OSCAL_GENERIC_SSO_ISSUER` | exact issuer string ending in `/`; the single place the identity host is defined (sign-in URLs and Guardian's `<issuer>jwks/` derive from it) | Authentik path |
| `OSCAL_GENERIC_SSO_CLIENT_ID` | the OSCAL OAuth client ID (the audience) | Authentik path |
| `OSCAL_GUARDIAN_GENERIC_SSO_ISSUER`, `_JWKS_URL`, `_CLIENT_ID` | optional Guardian-only overrides of the two shared values above | normally unset |
| `OSCAL_GUARDIAN_GENERIC_SSO_SCOPE` | the single custom scope name | Authentik path |
| `OSCAL_GUARDIAN_PRIVILEGED_GROUPS` | optional comma-separated phrases; group names are matched by case-insensitive "contains"; default `Platform Admin` | optional |
| `OSCAL_GUARDIAN_ISSUER`, `_JWKS_URL`, `_AUDIENCE`, `_CLIENT_ID`, `_SCOPES` | Okta contract values | Okta path only; may be omitted for an Authentik-only deployment |

**Authentik deploy values supplied by Guardian on 2026-11-13** (Guardian-reported, from its `deploy-assessment-api.sh verify`; account `387219500231`, `ap-southeast-2`; not independently verified by OSCAL beyond an unauthenticated HTTP 401 from the endpoint):

```
OSCAL_GUARDIAN_ASSESSMENTS_ENABLED=true
OSCAL_GUARDIAN_GENERIC_SSO_ASSESSMENTS_URL=https://dl0qfds4jk.execute-api.ap-southeast-2.amazonaws.com/v1/guardian
OSCAL_GUARDIAN_ASSESSMENTS_ALLOWED_HOSTS=dl0qfds4jk.execute-api.ap-southeast-2.amazonaws.com
OSCAL_GENERIC_SSO_ISSUER=https://sso.keekar.au/application/o/oscal-report-generator/
OSCAL_GENERIC_SSO_CLIENT_ID=oscal-report-generator
OSCAL_GUARDIAN_GENERIC_SSO_SCOPE=guardian-assessments
OSCAL_GUARDIAN_GENERIC_SSO_MAX_TOKEN_AGE_SECONDS=3600
OSCAL_GUARDIAN_ASSESSMENT_TARGETS_JSON='[{"provider":"cloudflare","targetId":"PROD_AEMGovAu","label":"AEMGovAu Cloudflare (PROD)","groups":["OSCAL_Platform Admin","Platform Admin"]},{"provider":"okta","targetId":"AEMGovAu","label":"AEMGovAu Okta","groups":["OSCAL_Platform Admin","Platform Admin"]}]'
```

**Token lifetime (owner decision 2026-11-13, Option B).** Authentik issues access tokens that live 3600 seconds; Guardian's default limit is 600. The owner chose to raise Guardian's `maxTokenAgeSeconds` to 3600 (its maximum) and set `OSCAL_GUARDIAN_GENERIC_SSO_MAX_TOKEN_AGE_SECONDS=3600` here to match. Guardian must be redeployed with 3600 before a fetch can succeed; the two values must stay equal. The alternative (Authentik Access token validity of 10 minutes or less) was not chosen.

**In `.env`, wrap the targets JSON in single quotes (as above).** A shell that loads `.env` (`source`, `export $(...)`) strips unquoted double quotes, which makes the JSON invalid, and the backend's own `.env` loader never overrides variables already set in the shell. `OSCAL_GUARDIAN_ASSESSMENTS_URL` (Okta) stays unset. The local `.env` (gitignored) has these set; a Docker deployment must pass the same variables to the container (for example `environment:` in the compose file). Guardian enforces: scope claim `scope` (space-delimited) contains `guardian-assessments`, `groups` in the **access** token, RS256, token age at most 600 s. The scope name `guardian-assessments` was proposed by Guardian, not yet created in Authentik. **The scope must also be added to the Generic SSO provider's Scope setting (Settings, SSO Integration), which today is `openid profile email`, otherwise the access token never carries it**, and users must sign out and in afterwards. Guardian's `import-ap` is a Guardian-minted `urn:uuid:`, not a resolvable plan.

The execute-api hostnames are known only after the Guardian deploy (Terraform output `assessment_api_endpoints`). Until
`OSCAL_GUARDIAN_ASSESSMENTS_ALLOWED_HOSTS` and the URLs are set, the application fails closed with its "not configured" message.

**Settings procedure (PROPOSED; do not apply until Guardian is deployed).** Nothing in `terraform/` sets any `OSCAL_GUARDIAN_*` variable today, and no OSCAL
file has been changed for this. For the direct-run EC2 deployment, the repository's precedent is a systemd drop-in (see
`terraform/templates/oscal-rds-bootstrap.sh.tftpl`). After an approved Guardian deploy:

1. In the Guardian checkout, run `scripts/deploy-assessment-api.sh verify`. It prints the exact `OSCAL_GUARDIAN_*` values to use.
2. On each OSCAL instance, as an administrator, create `/etc/systemd/system/oscal-reporter.service.d/60-oscal-guardian-env.conf`
   (mode 0640, root-owned) containing `[Service]` and one `Environment=NAME=value` line for each variable in the table above, using only the values from step 1 and the owners.
   It holds no secrets: do not add client secrets or tokens.
3. `sudo systemctl daemon-reload && sudo systemctl restart oscal-reporter`.
4. In the application Settings, add the owner-approved custom scope name to the Generic SSO scope (currently `openid profile email`). Authentik issues it only to
   approved-group members, so other users' tokens will not carry it.
5. Sign out and sign in again with Generic SSO as a privileged group member, open **Load Existing Report**, choose **Yes**, and confirm the target selector is active.

For Docker mode set the same names as container environment variables instead of a drop-in. To roll back, delete the drop-in (or unset the variables) and restart: the
feature returns to the fail-closed "not configured" state without affecting login or report editing. To make this repeatable through Terraform, a later reviewed change to
`terraform/oscal_instances.tf` user data could write the drop-in; I have not made it.

**OSCAL verification commands (no AWS access needed):**

```sh
GUARDIAN_ACCEPTANCE_REPORT=/path/to/report.json npm --prefix backend test -- --runInBand \
  --runTestsByPath "$PWD/test_cases/backend/integration/guardianAssessments.test.js" \
  "$PWD/test_cases/backend/unit/guardianService.test.js" "$PWD/test_cases/backend/integration/guardianRoutes.test.js"
OSCAL_BROWSER_CHANNEL=chrome npx --no-install playwright test test_cases/e2e/guardian-assessment.spec.mjs --workers=1 --reporter=line
GUARDIAN_CHECKOUT=/path/to/GuardianAgent GUARDIAN_ACCEPTANCE_REPORT=/path/to/report.json node test_cases/e2e/guardian-real-cache.mjs
```

The last command uses test-only authentication and does not prove real authentication.

## 6. Outstanding owner prerequisites

These are what the application's "not configured" message now names. All are owner-controlled and none can be completed from this repository:

1. ~~Guardian assessment API deployed~~ DONE 2026-11-13 (Authentik endpoint only; Okta endpoint later).
2. Authentik custom scope with a **group-restricted** scope mapping or policy, so only approved-group members receive it. Guardian returns 401 for tokens without it.
3. The `groups` claim present in the **access** token (an earlier OSCAL sign-in resolved 2 groups while Authentik showed 9 for the same user; unexplained).
4. RS256 signing for access tokens.
5. `sso.keekar.au` must resolve to a public address from AWS and be reachable on 443 with a valid certificate for that name. The true public record is `103.160.130.243` (DoH); plain DNS on the owner's network is rewritten to the pfSense WAN IP `10.100.3.74`. Confirm from AWS (or a resolver outside the owner's network) and confirm port 443 is forwarded to Authentik before treating this as met.
6. The real OSCAL `client_id` (the token audience) and the exact group name for the targets list.
7. The assessment plan reference (`GUARDIAN_ASSESSMENT_PLAN_HREF`).
8. Okta path (later): owner-approved authorization server values, then set `OSCAL_GUARDIAN_ASSESSMENTS_URL` and the Okta variables.

## Facts not verified here

- Whether the migration was applied anywhere, and the live contents of any database.
- Live AWS state, subnet and security-group IDs, or whether any cross-account path exists outside this repository.
- Real Authentik access-token claim contents.
