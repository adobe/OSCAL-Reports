<!--
Concept: Mukesh Kesharwani
Contact: mukesh.kesharwani@adobe.com
-->

# OSCAL Reports Scripts

Operational scripts for the OSCAL Report Generator. Production runs on **AWS
(Terraform-managed EC2, Green/Blue behind an ALB)**; secrets live in **AWS
Secrets Manager** and config/users are backed to **S3**.

Run everything from the **repository root**. Terraform-dependent scripts read
AWS credentials from Pass via `terraform/run-with-aws-pass.sh` and derive
instance IPs from the selected Terraform workspace. `deploy-to-ec2.sh` uses
SSM Run Command and temporary S3 staging for automated deployment; no SSH key
is needed for that path. `ssh-ec2.sh` remains a separate interactive SSH tool.

## Layout

- [`scripts/`](.) — top-level deploy and operations scripts.
- [`scripts/lib/`](lib/) — shared helpers sourced by other scripts (EC2/Pass/Terraform, config↔S3 sync, Bedrock drop-ins, systemd env). Not run directly.
- [`scripts/ci/`](ci/) — CI helpers (post-deploy smoke test, workflow/CodeQL validation).
- [`scripts/debug/`](debug/) — diagnostics and on-instance operator tools (see below).

## Deploy & operations (top-level)

| Script | Purpose |
|--------|---------|
| [`deploy-to-ec2.sh`](deploy-to-ec2.sh) | Full deploy to Green/Blue: `--update-s3` publishes the repo (including `config/constants/` and `config/catalogues/`); the deploy then syncs the snapshot, builds/restarts through SSM Run Command, and checks readiness. `--both` is passive-first and wakes a stopped passive ASG. |
| [`ssh-ec2.sh`](ssh-ec2.sh) | Interactive SSH to Green/Blue using Terraform-derived IPs and the separate SSH key entry. Not used by automated deployment. |
| [`ec2_automation.sh`](ec2_automation.sh) | On-instance cron: backup config/users to S3; optional installer sync + build + restart. |
| [`reactivate-admin.sh`](reactivate-admin.sh) | Reactivate an admin user in `users.json` (repo or `/opt/oscal/data/users.json`). |
| [`oscal-staggered-ami-refresh.sh`](oscal-staggered-ami-refresh.sh) | Staggered ASG AMI refresh with health gating between roles. |
| [`check-ami-drift.sh`](check-ami-drift.sh) | Report AMI drift between launch templates and the latest published image. |
| [`oscal-standby.sh`](oscal-standby.sh) | Toggle standby/traffic mode for an instance. |
| [`letsencrypt-acm-import.sh`](letsencrypt-acm-import.sh) | Let's Encrypt → ACM emergency TLS fallback (see [docs/BEST_PRACTICES.md](../docs/BEST_PRACTICES.md) Part 5: TLS/PKI). |
| [`restart-local-dev.sh`](restart-local-dev.sh) | Restart the local npm dev stack (frontend + backend). |

## Build & release

| Script | Purpose |
|--------|---------|
| [`build-and-push-dockerhub.sh`](build-and-push-dockerhub.sh) | Build the image locally and push to Docker Hub (version-tagged, plus `latest`). Requires `docker login`; `DOCKERHUB_USERNAME` defaults to `keekar`. |
| [`install_from_dockerhub.sh`](install_from_dockerhub.sh) | Pull-based deploy from Docker Hub with backup + auto-rollback (used for standalone/TrueNAS hosts, not the AWS ASG path). |
| [`bump_version.sh`](bump_version.sh) | Bump package manifests, lockfile root metadata, README version, and changelog. Set `BUMP_VERSION_SKIP_DEPENDENCY_UPDATES=1 BUMP_VERSION_SKIP_BEST_PRACTICES=1 BUMP_VERSION_SKIP_GIT_OPERATIONS=1` for a metadata-only bump without forced dependency upgrades or a commit. |
| [`push-and-merge-main.sh`](push-and-merge-main.sh) | Repo git-flow helper for pushing/merging. |
| [`setup-git-hooks.sh`](setup-git-hooks.sh) | Install the repo's `.githooks`. |
| [`switch-github-account.sh`](switch-github-account.sh) | Switch the active GitHub account for pushes. |

## User consolidation

| Script | Purpose |
|--------|---------|
| [`consolidate-users.sh`](consolidate-users.sh) | Merge users between Blue and Green with duplicate detection (no overwrites). |
| [`sync-consolidation-script.sh`](sync-consolidation-script.sh) | Copy `consolidate-users.sh` to Blue/Green script folders so all copies stay in sync. |

See [CONFIG_AND_USER_MIGRATION.md](../docs/CONFIG_AND_USER_MIGRATION.md#user-consolidation).

## Debug & on-instance tools ([`scripts/debug/`](debug/))

Diagnostics and operator tools. The deploy script copies the on-instance
helpers from the S3 installer snapshot and invokes remote deploy operations via
SSM. Other diagnostics run locally through AWS APIs or use the separate SSH
helper; check each script's usage before moving it.

| Script | Purpose |
|--------|---------|
| `diagnose-okta-on-ec2.sh` | Diagnose SSO/Okta on EC2 (SM env, config, systemd, legacy pass); calls `probe-sso-secrets.mjs`. |
| `diagnose-splunk-uf-on-ec2.sh` | Diagnose the Splunk Universal Forwarder on EC2. |
| `probe-sso-secrets.mjs` | Resolve SSO client secrets under the production env (also invoked by the Terraform SSM document). |
| `alb-target-health.sh` | Print ALB Green/Blue target health via AWS CLI. |
| `terraform-find-sg-dependencies.sh` | List ENIs/SGs depending on a security group (when Terraform hits `DependencyViolation`). |
| `audit-config-secrets.sh` | Audit `config.json` secret-storage shape (`_sm`/`_pass`/`_cfgenc`/plaintext); prints no secret values. |
| `backup-config-to-s3.sh` | On-instance backup of config/users to S3 (cron companion). |
| `publish-config-default-to-s3.sh` | Publish the golden config/users snapshot to `s3://<bucket>/config/default/`. |
| `restore-config-from-s3-default.sh` | Restore `/opt/oscal/data` from the golden snapshot (fast rollback). |
| `sync-config-from-s3-newest.sh` | Pull the newest shared config from S3 (`config/active|green|blue`). |
| `scp-to-ec2.sh` | Copy a debug script from the laptop to Green/Blue over SSH. |
| `repair-ec2-config-from-backups.mjs` | Break-glass: rebuild `config.json` from local backups and repoint `_sm`. |
| `update-pass-credential.sh` | Interactive Pass entry management (list/add/delete; credentials read from stdin, never written to disk). |

## Testing

Run the deployment script test suite from the repo root:

```bash
./test_cases/scripts/test-deployment-script.sh
```

Run the keyless SSM transport, passive-ASG wake, and maintenance-readiness tests:

```bash
bash scripts/ci/test-deploy-ssm-transport.sh
bash scripts/ci/test-deploy-passive-wake.sh
bash scripts/ci/test-deploy-constants-sync.sh
bash scripts/ci/test-deploy-maintenance-readiness.sh
```

Shell scripts are lint-checked in CI via `.github/workflows/shell-validation.yml`.

## More documentation

- **AWS operations & runbooks:** [docs/DEPLOYMENT_AND_OPERATIONS.md](../docs/DEPLOYMENT_AND_OPERATIONS.md)
- **Config & user migration:** [docs/CONFIG_AND_USER_MIGRATION.md](../docs/CONFIG_AND_USER_MIGRATION.md)
- **Docker Hub deploys:** [docs/DOCKER_HUB_GUIDE.md](../docs/DOCKER_HUB_GUIDE.md)
- **Security:** [docs/SECURITY.md](../docs/SECURITY.md)

Support: open an issue at https://github.com/adobe/OSCAL-Reports/issues

---

**Author:** Mukesh Kesharwani
**Last Updated:** September 2026
