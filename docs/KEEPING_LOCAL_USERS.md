# Keeping Your Local users.json From Being Overwritten

**Applies to: local development on a laptop only.** Docker, AWS EC2 Blue/Green, and other deployments use their own `USERS_PATH` (e.g. Docker volume, EC2 `/opt/oscal/data/users.json`) and do not use `.env` for this.

If you find that `config/app/users.json` gets reset to a default (e.g. after pulling code or running setup), you can keep your laptop’s user list intact by storing users **outside the repo** and pointing the app at that file.

## Why it can happen

- **setup.sh** only creates `config/app/users.json` from `users.json.example` when the file is **missing**. It never overwrites an existing file.
- **Git** does not touch `config/app/users.json` (it’s in `.gitignore`).
- If your file is ever deleted or reverted (e.g. by another script or by mistake), the next run may recreate it from the example.

## Recommended: use a users file outside the repo

Store your real user list in a path that is never modified by the repo or setup (e.g. a folder under your home directory). The app will read and write that file only.

### 1. Create a directory and copy your users

```bash
mkdir -p ~/Documents/OSCAL_Reports_data
cp config/app/users.json.backup ~/Documents/OSCAL_Reports_data/users.json
```

(If you don’t have a backup, use your current `config/app/users.json` once you’ve restored it.)

### 2. Point the app at that file with `.env`

From the **repo root**:

```bash
cp .env.example .env
```

Edit `.env` and set an **absolute** path to your users file:

```env
USERS_PATH=/Users/yourusername/Documents/OSCAL_Reports_data/users.json
```

Replace `yourusername` with your macOS username (use an absolute path; `.env` does not expand `$HOME`, so use the full path).

### 3. Run the app as usual

```bash
npm run dev
```

The backend loads `.env` from the repo root and uses `USERS_PATH`. All user load/save will use your external file; `config/app/users.json` is no longer used when `USERS_PATH` is set.

## Optional: config.json outside the repo

You can do the same for `config.json` so it isn’t overwritten:

```env
CONFIG_PATH=/Users/yourusername/Documents/OSCAL_Reports_data/config.json
```

Then copy your current `config/app/config.json` to that path and use it as the single source of truth.

## Safeguards already in place

- **setup.sh**: Only creates `users.json` from `users.json.example` when `config/app/users.json` does not exist. If the file exists, setup leaves it unchanged and prints “users.json already exists (left unchanged)”.
- **Backend**: Uses `USERS_PATH` from the environment. On the **laptop only** (when `NODE_ENV` is not `production`), the backend also loads `.env` from the repo root, so you can set `USERS_PATH` there. Docker and EC2 do not load `.env` for this; they rely on `USERS_PATH` set by the container entrypoint or systemd.

## Summary

| Goal | Action |
|------|--------|
| Keep users across code changes (laptop only) | Set `USERS_PATH` in `.env` to a path outside the repo and copy your users there once. |
| Keep a backup in the repo | Keep `config/app/users.json.backup` updated (it’s gitignored; use it only as a local backup). |
| Never overwrite by mistake | Don’t run scripts that delete `config/app/users.json`; use `USERS_PATH` so the app doesn’t rely on that file. |

**Deployments:** Docker and EC2 Blue/Green are unchanged. They set `USERS_PATH` (and optionally `CONFIG_PATH`) via their own mechanisms (Docker entrypoint, systemd, or shell) and do not use `.env` for users or config.
