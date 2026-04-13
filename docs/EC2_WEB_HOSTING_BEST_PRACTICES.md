# EC2 Web Hosting Best Practices

This document consolidates best practices evolved for hosting the OSCAL Report Generator on AWS EC2 (Green/Blue) with direct Node.js + systemd (no Docker). It complements [AWS_TERRAFORM.md](AWS_TERRAFORM.md) (provisioning) and focuses on **application deployment, layout, automation, and operations**.

---

## Table of Contents

1. [Directory layout](#1-directory-layout)
2. [Service account and Pass](#2-service-account-and-pass)
3. [Config and users: single canonical location](#3-config-and-users-single-canonical-location)
4. [Deploy workflow](#4-deploy-workflow)
5. [Cron and ec2_automation (Green vs Blue)](#5-cron-and-ec2_automation-green-vs-blue)
6. [Blue/Green ports and health](#6-bluegreen-ports-and-health)
7. [Troubleshooting](#7-troubleshooting)
8. [Scripts reference](#8-scripts-reference)
9. [Terraform and SSH](#9-terraform-and-ssh)
10. [ALB and timeouts](#10-alb-and-timeouts)
11. [Image and OS](#11-image-and-os)

---

## 1. Directory layout

Use a **strict layout** so config is never confused with app code:

| Path | Purpose |
|------|--------|
| `/opt/oscal/app` | **App code only** (repo sync via rsync). No `config/` or `config.json`/`users.json` here. |
| `/opt/oscal/data` | **Canonical config and users** on EBS: `config.json`, `users.json`. Used by systemd via `CONFIG_PATH`/`USERS_PATH`. |
| `/opt/oscal/scripts` | Automation and helpers: `ec2_automation.sh`, `ec2_automation.env`, `reactivate-admin.sh`, `consolidate-users.sh`, etc. |
| `/opt/oscal/app/logs` | Application and ec2_automation logs. |

**Best practice:** The deploy script **excludes** the repo `config/` directory from rsync so `/opt/oscal/app/config` is never created. Config and users live **only** in `/opt/oscal/data`. Seeding comes from S3 (last backup) or from the repo `config/app/*.json` when local files are missing.

---

## 2. Service account and Pass

- **Run the app and cron as a dedicated user**, not root: `svc_ams-oscal` (group `oscal`), home `/var/lib/svc_ams-oscal`.
- **Secrets:** Use [pass](https://www.passwordstore.org/) for the service user. The deploy script ensures the Pass vault at `$SVC_HOME/.password-store` is created and initialized. Store Okta client secret, SMTP password, etc. there; `config.json` holds only pointers (e.g. `"_pass": "OSCAL/sso-oauth-okta-client-secret"`).
- **Adding a secret on instance:**  
  `sudo -u svc_ams-oscal pass insert OSCAL/entry-name`
- **If Pass is missing:** Deploy will warn; secrets would be stored in plain text in config. Re-run `./scripts/deploy-to-ec2.sh` after fixing Pass on the instance, or add secrets manually (`sudo -u svc_ams-oscal pass insert …`).

---

## 3. Config and users: single canonical location

- **On EC2 the app reads only:**  
  `CONFIG_PATH=/opt/oscal/data/config.json`  
  `USERS_PATH=/opt/oscal/data/users.json`  
  (set in `oscal-reporter.service`.)
- **Do not** place `config.json` or `users.json` under `/opt/oscal/app`; the deploy script removes any leftover `app/config` from older deploys.
- **Backup:** `ec2_automation.sh` (when cron is enabled) backs up these files to S3 every 10 minutes (`config/green/`, `config/blue/`). On new or replaced instances, deploy restores from S3 first; if still missing, it seeds from the repo `config/app/config.json` and `config/app/users.json`.

---

## 4. Deploy workflow

- **Full deploy (both instances):**  
  `./scripts/deploy-to-ec2.sh`  
  (SSH key from Pass entry `AWS/OSCAL-AWS4379-SSH` or `SSH_KEY_FILE=/path/to/key.pem`.)
- **Single instance:**  
  `./scripts/deploy-to-ec2.sh --green-only <green_ip>`  
  `./scripts/deploy-to-ec2.sh --blue-only <blue_ip>`  
  Get IPs from Terraform:  
  `terraform -chdir=terraform output -raw oscal_green_public_ip` (and `oscal_blue_public_ip`).
- **What deploy does:**  
  - Ensures service account and Pass.  
  - Creates `/opt/oscal/app`, `/opt/oscal/scripts`, `/opt/oscal/data`.  
  - Restores config/users from S3 if available; otherwise seeds from repo if missing.  
  - Writes `ec2_automation.env` and installs/removes cron per role (see below).  
  - Rsyncs repo to `/opt/oscal/app` (excludes `config/`, `node_modules`, `.git`, etc.), runs `npm install` and frontend build, copies build into `backend/public`.  
  - Installs/updates `oscal-reporter.service` (Node, PORT, CONFIG_PATH, USERS_PATH, HOME, PASSWORD_STORE_DIR, OLLAMA_*).  
  - Restarts the service and verifies `/health`.

**Best practice:** Run Terraform via `terraform/run-with-aws-pass.sh` (output, apply). Do not commit AWS credentials; use Pass or env.

---

## 5. Cron and ec2_automation (Green vs Blue)

- **ec2_automation.sh** backs up config, users, and logs to S3 and (optionally) updates the app from GitHub and restarts the service.
- **Green:** By default deploy installs a **cron** for user `svc_ams-oscal` every 10 minutes:  
  `*/10 * * * * ... /opt/oscal/scripts/ec2_automation.sh ...`  
  **`ENABLE_GITHUB_UPDATE` defaults to false** in `ec2_automation.sh` and in deploy-generated `ec2_automation.env`, so cron does **not** pull from GitHub unless you opt in (set `ENABLE_GITHUB_UPDATE=true` on the instance, or deploy with **`DEPLOY_ENABLE_GITHUB_UPDATE=1`**).
- **Blue:** By default deploy installs the **same** cron on Blue (`DEPLOY_BLUE_AUTO_UPDATE` defaults to `1`) so S3 backup and Pass ↔ Secrets Manager sync run on both instances (still no GitHub pull unless `DEPLOY_ENABLE_GITHUB_UPDATE=1`). Set **`DEPLOY_BLUE_AUTO_UPDATE=0`** when running deploy if you want Blue **manual-only** (no cron; deploy removes the ec2_automation line from Blue’s crontab).
- **ec2_automation.env** (per instance):  
  `S3_BUCKET`, `S3_CONFIG_PREFIX`, `S3_LOGS_PREFIX`, `DEPLOYMENT_ROLE`, `ENABLE_GITHUB_UPDATE`, and (when Terraform provides it) `PASS_SECRETS_SYNC_ENABLED`, `PASS_SECRETS_SYNC_SECRET_ARN`, `PASS_SECRETS_SYNC_MIN_INTERVAL_SECONDS` for Pass vault sync to AWS Secrets Manager.  
  Deploy overwrites this file on each run; use **`DEPLOY_ENABLE_GITHUB_UPDATE=1`** when deploying if you want GitHub pull-on-cron enabled again.

---

## 6. Blue/Green ports and health

- **Green:** port **3019**.  
- **Blue:** port **3020**.  
- The systemd unit is the same; only `Environment=PORT=` differs. Deploy forces the correct PORT per role.
- **Health:** ALB checks `http://<target>:<port>/health`. After deploy, the script waits ~20s and retries up to 5 times. If health fails, it prints recent `journalctl -u oscal-reporter.service` for debugging.
- **Common causes of failure:** Bad or missing config/users in `/opt/oscal/data`, missing or broken Pass vault, wrong PORT in the unit file.

---

## 7. Troubleshooting

- **Instance not responding / health failing:**  
  - SSH and run:  
    `sudo systemctl status oscal-reporter.service`  
    `sudo journalctl -u oscal-reporter.service -n 50 --no-pager`  
  - From repo root, SSH to the instance (e.g. `./scripts/debug/ssh-ec2.sh blue`) and inspect the same items: `systemctl`, `journalctl`, disk, `sudo crontab -u svc_ams-oscal -l`, `/opt/oscal/scripts/ec2_automation.env`, `/opt/oscal/app/logs/`, and `curl -sf http://127.0.0.1:3020/health` (Blue) or port `3019` (Green).
- **Blue only – disable cron and fix env now (one-off):**  
  `./scripts/debug/fix-blue-no-cron.sh`  
  (or with explicit IP). This sets `ENABLE_GITHUB_UPDATE=false` and removes the ec2_automation cron on Blue.
- **Backup/restore verification:**  
  On the instance: confirm `sudo crontab -u svc_ams-oscal -l` includes `ec2_automation.sh`, check `/opt/oscal/scripts/ec2_automation.env` for `S3_BUCKET`, and run `/opt/oscal/scripts/ec2_automation.sh` once and confirm S3 objects update under `config/<role>/`.
- **Pass vault on instances:**  
  Compare `config.json` `_pass` references with `sudo -u svc_ams-oscal env HOME=/var/lib/svc_ams-oscal pass ls` (and `pass show` for specific keys).
- **AI engine (Ollama) unreachable from Green/Blue:**  
  See [AWS_TERRAFORM.md – Troubleshooting: AI Engine unreachable](AWS_TERRAFORM.md#troubleshooting-ai-engine-unreachable-from-greenblue). Use `./scripts/debug/check-ollama-connectivity.sh` (optionally `--blue-only <ip>` or `--green-only <ip>`).

---

## 8. Scripts reference

| Script | Purpose |
|--------|--------|
| `scripts/deploy-to-ec2.sh` | Full deploy to Green/Blue: code, config seed, cron, systemd, health check. |
| `scripts/ec2_automation.sh` | Backup to S3; optional git pull + build + restart. Runs from cron on Green by default. |
| `scripts/reactivate-admin.sh` | Reactivate admin user in `users.json`. Use repo path or pass path; works with `/opt/oscal/data/users.json`. |
| `scripts/debug/fix-blue-no-cron.sh` | One-off: set ENABLE_GITHUB_UPDATE=false and remove ec2_automation cron on Blue. |
| `scripts/debug/diagnose-okta-on-ec2.sh` | Diagnose Okta SSO on EC2 (config paths, tokens). |
| `scripts/debug/check-ollama-connectivity.sh` | Check connectivity from Green/Blue to Ollama NLB. |
| `scripts/debug/restore-blue-config.sh` | Copy config/users from Green to Blue (e.g. after replacing Blue). |

---

## 9. Terraform and SSH

- **Terraform:** Run via `terraform/run-with-aws-pass.sh` so AWS credentials are loaded from Pass (no credentials in repo). Example:  
  `./terraform/run-with-aws-pass.sh output`  
  `./terraform/run-with-aws-pass.sh apply -auto-approve`
- **Instance type:** Prefer **Graviton (t4g.small)**, then **AMD (t3a.small)**. Defaults in `terraform/variables.tf` are t4g.small and arm64; see [AWS_TERRAFORM.md](AWS_TERRAFORM.md).
- **SSH key:** Stored in Pass entry `AWS/OSCAL-AWS4379-SSH` or provided as `SSH_KEY_FILE`. Same key is used for Green, Blue, and (if used) Ollama instances.
- **SSH user:** `ec2-user` (Amazon Linux 2023 / RHEL). Set `SSH_USER` if different.
- **Deploy** uses this key to rsync and run remote commands; it does not use Session Manager.

---

## 10. ALB and timeouts

- ALB **idle timeout** should be at least **300 seconds** (e.g. in `terraform/alb.tf`) to avoid 504 on long-running requests (e.g. AI, large reports).
- If you see **502 Bad Gateway** after deploy, wait 1–2 minutes for target health checks to pass, then retry the ALB URL. Default route is to Blue (3020).

---

## 11. Image and OS

- **Amazon Linux 2023** (or Adobe Image Factory Amazon Linux 2023 when configured). See [IMAGE_FACTORY.md](IMAGE_FACTORY.md).
- Use `SSH_USER=ec2-user` for Amazon Linux 2023.
- Node.js 20 is installed by the deploy script if not present (e.g. via NodeSource).

---

## Summary checklist

- [ ] Config and users only in `/opt/oscal/data`; no duplicate under `/opt/oscal/app`.
- [ ] App and cron run as `svc_ams-oscal`; Pass vault used for secrets.
- [ ] Deploy via `./scripts/deploy-to-ec2.sh`; Terraform via `run-with-aws-pass.sh`.
- [ ] Green and Blue: cron every 10 min by default (S3 backup + Pass/SM sync; GitHub pull off unless `DEPLOY_ENABLE_GITHUB_UPDATE=1`). Blue manual-only: deploy with `DEPLOY_BLUE_AUTO_UPDATE=0`.
- [ ] Health verified after deploy; troubleshoot with SSH, `journalctl`, S3 backup paths, and Pass as needed.
- [ ] ALB idle timeout ≥ 300 s; SSH key from Pass or `SSH_KEY_FILE`.
