# Config and User Migration

**Covers (1) local development: keeping your local users.json and config from being overwritten, and (2) deployment: migrating config/users between instances and consolidating users across Blue/Green.**

---

## Table of Contents

- [Local Development: Keeping Users and Config (Laptop Only)](#local-development-keeping-users-and-config-laptop-only)
- [Instance → Port → Directory Mapping](#instance--port--directory-mapping)
- [Config Migration](#config-migration)
- [User Consolidation](#user-consolidation)
- [Recovery After Accidental Rollback](#recovery-after-accidental-rollback)
- [Security](#security)

---

## Local Development: Keeping Users and Config (Laptop Only)

**Applies to:** Local development on a laptop only. Docker, AWS EC2 Blue/Green, and other deployments use their own `USERS_PATH` (e.g. Docker volume, EC2 `/opt/oscal/data/users.json`) and do not use `.env` for this.

If `config/app/users.json` gets reset to a default (e.g. after pulling code or running setup), you can keep your laptop’s user list intact by storing users **outside the repo** and pointing the app at that file.

### Why it can happen

- **setup.sh** only creates `config/app/users.json` from `users.json.example` when the file is **missing**. It never overwrites an existing file.
- **Git** does not touch `config/app/users.json` (it’s in `.gitignore`).
- If the file is ever deleted or reverted (e.g. by another script or by mistake), the next run may recreate it from the example.

### Recommended: use a users file outside the repo

1. **Create a directory and copy your users**
   ```bash
   mkdir -p ~/Documents/OSCAL_Reports_data
   cp config/app/users.json.backup ~/Documents/OSCAL_Reports_data/users.json
   ```
   (If you don’t have a backup, use your current `config/app/users.json` once you’ve restored it.)

2. **Point the app at that file with `.env`** (from repo root):
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set an **absolute** path:
   ```env
   USERS_PATH=/Users/yourusername/Documents/OSCAL_Reports_data/users.json
   ```
   Replace `yourusername` with your macOS username (use an absolute path; `.env` does not expand `$HOME`).

3. **Run the app as usual:** `npm run dev`. The backend loads `.env` from the repo root and uses `USERS_PATH`. All user load/save use your external file; `config/app/users.json` is not used when `USERS_PATH` is set.

### Optional: config.json outside the repo

You can do the same for `config.json` so it isn’t overwritten:
```env
CONFIG_PATH=/Users/yourusername/Documents/OSCAL_Reports_data/config.json
```
Copy your current `config/app/config.json` to that path and use it as the single source of truth.

### Safeguards (local)

- **setup.sh:** Only creates `users.json` from `users.json.example` when `config/app/users.json` does not exist. If the file exists, setup leaves it unchanged.
- **Backend:** Uses `USERS_PATH` from the environment. On the **laptop only** (when `NODE_ENV` is not `production`), the backend also loads `.env` from the repo root. Docker and EC2 do not load `.env` for this; they use `USERS_PATH` set by the container entrypoint or systemd.

### Summary (local)

| Goal | Action |
|------|--------|
| Keep users across code changes (laptop only) | Set `USERS_PATH` in `.env` to a path outside the repo and copy your users there once. |
| Keep config outside repo | Set `CONFIG_PATH` in `.env` to a path outside the repo. |
| Never overwrite by mistake | Use `USERS_PATH` so the app doesn’t rely on `config/app/users.json`. |

**Deployments:** Docker and EC2 Blue/Green are unchanged. They set `USERS_PATH` (and optionally `CONFIG_PATH`) via their own mechanisms (Docker entrypoint, systemd, or shell) and do not use `.env` for users or config.

---

## Instance → Port → Directory Mapping

On TrueNAS (e.g. truenas.keekar.com) or any host running multiple OSCAL instances, the **deploy/build scripts** use this mapping:

| Port | Instance | Container name                 | Data directory / volume      |
|------|----------|--------------------------------|------------------------------|
| **3019** | **Green**  | `oscal-report-generator-green`  | **`data-green`** (or `data-green/` in deploy root) |
| **3020** | **Blue**   | `oscal-report-generator-blue`  | **`data-blue`** (or `data-blue/` in deploy root)  |
| **3021** | *(not in scripts)* | — | — |

- **3019** → Green → config and users live in **`data-green`** (files: `config.json`, `users.json` under that directory or its mounted path).
- **3020** → Blue → config and users live in **`data-blue`** (same file names).

**Port 3021:** The codebase only defines Blue (3020) and Green (3019). If you have a third instance on **3021**, it was likely created separately (e.g. another TrueNAS Custom App or chart release). Its data lives in **whatever storage path that app was given** (e.g. a third host path or PVC for that release). To see which directory a 3021 instance uses, check that app’s **Storage** or **Volumes** in the TrueNAS Apps UI, or the deploy path for that clone.

**TrueNAS volume paths (examples):** If you use the TrueNAS build script (`retired/truenas-build/build_on_truenas.sh`) or custom paths, Blue might be `/mnt/pool/oscal-data-blue` and Green `/mnt/pool/oscal-data-green`. The script uses `DATA_VOLUME_BASE-blue` and `DATA_VOLUME_BASE-green`; `DATA_VOLUME_BASE` is set in the script or derived from the deployment directory.

---

## Config Migration

### Files to Migrate

- **`config/app/config.json`** – Application settings (AI, messaging, SSO, API gateways, SOA URL).
- **`config/app/users.json`** – User accounts, roles, credentials (PBKDF2 hashed).

Both contain sensitive data; handle with care and restrict access.

### Methods

**Docker volume:** Mount `config/app/` so config persists across container restarts. Copy `config.json` and `users.json` from source to target host, then start the new container with the same volume paths.

**TrueNAS Blue-Green:** Locate Blue deployment volumes (e.g. under `ix-applications/releases/`), backup `config/app/config.json` and `config/app/users.json`, copy to Green deployment volume, set permissions (e.g. `chmod 644`), then restart the Green app.

**Cloud (Azure/AWS/GCP):** Use the platform’s config/secret store or mounted volumes; copy the same two files from source to target and restart the app.

### Verification

- Log in with an existing user.
- Check AI, messaging, and SSO settings.
- Confirm report URLs and integrations.

---

## User Consolidation

Consolidate users between Blue and Green so the same credentials work on both.

### Prerequisites

- Backend route fix deployed: `/api/users/export` and `/api/users/import` must be defined **before** `/api/users/:userId` (see commit that fixed route ordering).
- Both instances running and reachable.

### Method 1: Docker (immediate)

**Script:** `scripts/consolidate-users.sh --docker`

Run on the host where both containers run:

```bash
cd /path/to/OSCAL_Reports
sudo ./scripts/consolidate-users.sh --docker
```

The script reads `users.json` from both containers via `docker exec`, merges users (deduplicates), writes back, and restarts containers. Backups are created under `~/oscal-user-consolidation-TIMESTAMP/`. Use `--docker` when the API-based flow is not available (e.g. older backend without export/import endpoints).

### Method 2: API-based (after backend fix)

**Script:** `scripts/consolidate-users.sh`

```bash
# Interactive (prompts for password)
./scripts/consolidate-users.sh

# Automatic bi-directional
BLUE_PASSWORD='...' GREEN_PASSWORD='...' ./scripts/consolidate-users.sh --auto

# Custom URLs
./scripts/consolidate-users.sh --auto \
  --blue-url http://blue.example.com \
  --green-url http://green.example.com \
  --blue-password '...' --green-password '...'

# One-way: Blue → Green
./scripts/consolidate-users.sh --blue-to-green

# One-way: Green → Blue
./scripts/consolidate-users.sh --green-to-blue

# Docker mode (direct docker exec, run ON server with containers)
./scripts/consolidate-users.sh --docker
```

**Sync script:** Use `scripts/sync-consolidation-script.sh` to copy `consolidate-users.sh` to Blue/Green script directories if they are separate clones.

### Verification

- Call `GET /api/users/export` (with auth) on both Blue and Green; confirm user lists match expectations.
- Log in on both instances with the same user.

---

## Recovery After Accidental Rollback

If Blue (or Green) was rolled back to an old version and **config and users were wiped**, you can recover in one of two ways. Run these steps **on the host** where the instance runs (e.g. 192.168.1.200 for blue.oscal.keekar.com), from the **deployment directory** that contains `scripts/` and `data-blue/` (or `data-green/`).

### Option 1: Restore from deploy backup

The deploy script (`scripts/install_from_dockerhub.sh`) creates a backup tarball in `backups/dockerhub-deploy-YYYYMMDD-HHMMSS/` each time it runs. Use the restore script to put the latest backup back into the Blue data volume:

```bash
cd /path/to/OSCAL_Reports_Blue   # or your Blue deployment root
./scripts/debug/restore-blue-config.sh --from-backup
```

This finds the most recent `data-volume-backup.tar.gz` (or legacy backup), extracts it into `data-blue/`, and restarts the Blue container.

### Option 2: Copy from Green to Blue

If Green is on the same host and has the correct config and users, copy them to Blue:

```bash
cd /path/to/OSCAL_Reports   # repo root where both data-blue and data-green exist
./scripts/debug/restore-blue-config.sh --from-green
```

This copies `config.json` and `users.json` from `data-green/` to `data-blue/` and restarts the Blue container.

### Manual restore (no script)

If you have a backup tarball or files elsewhere:

1. Copy `config.json` and `users.json` into the Blue data volume (e.g. `data-blue/` or the mounted volume used by the Blue container).
2. Set permissions: `chmod 644 data-blue/config.json data-blue/users.json`
3. Restart the container: `docker restart oscal-report-generator-blue`

### Verification

- Open https://blue.oscal.keekar.com (or http://192.168.1.200:3020).
- Log in with an existing user.
- Check Admin → Configuration and user list.

---

## Security

- **Backup** before any migration or consolidation.
- **Restrict** access to `config.json` and `users.json` (they contain secrets and hashes).
- **Use** secure copy (SCP/rsync over SSH) when moving files between hosts.
- **Rotate** or change credentials after migration if policy requires.

---

## Related Documentation

- [DEPLOYMENT.md](DEPLOYMENT.md)
- [DOCKER_HUB_GUIDE.md](DOCKER_HUB_GUIDE.md)
- [TrueNAS (retired)](../retired/truenas-build/TRUENAS.md)

---

*Consolidates former KEEPING_LOCAL_USERS.md (local dev) and deployment migration/consolidation. Last updated: February 2026*
