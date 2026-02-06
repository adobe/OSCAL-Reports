# User Consolidation Between Blue and Green Deployments

## Overview

This guide explains how to consolidate users between Blue and Green deployments so users can login to both instances with the same credentials.

## Current Status

- **Blue (http://blue.oscal.keekar.com)**: 18 users
- **Green (http://green.oscal.keekar.com)**: 16 users
- **Common users**: 14 users on both
- **Unique to Blue**: 4 users
- **Unique to Green**: 2 users

## Backend Fix Required

⚠️ **IMPORTANT**: The backend API has a route conflict bug that must be fixed first!

### The Problem

The `/api/users/export` and `/api/users/import` endpoints were failing because Express was matching them against `/api/users/:userId` route first, treating "export" and "import" as user IDs.

### The Solution

**Commit**: `8063b1a` - "fix(api): resolve route conflict for /api/users/export and /api/users/import"

**What was fixed**:
- Moved `/api/users/export` and `/api/users/import` routes BEFORE `/api/users/:userId`
- Removed duplicate route definitions
- Added comments to prevent future route ordering issues

### Deployment Steps

1. **Pull latest code on both servers**:
   ```bash
   cd /path/to/OSCAL_Reports
   git pull origin Development
   ```

2. **Restart both containers**:
   ```bash
   docker restart oscal-report-generator-blue
   docker restart oscal-report-generator-green
   ```

3. **Verify the fix**:
   ```bash
   # Test Blue
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://blue.oscal.keekar.com/api/users/export
   
   # Test Green
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://green.oscal.keekar.com/api/users/export
   ```

## Keeping the script in sync (Local, Blue, Green)

The same `consolidate-users.sh` should be used in all three places so you can check in updates to repos from any of them.

| Place | Typical path | How to update |
|-------|--------------|----------------|
| **Local laptop** | `~/Documents/OSCAL_Reports/scripts/` | Edit here, then commit and push. |
| **Blue** | `/mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue/scripts/` | Run sync script (see below) or `git pull` if Blue is a clone. |
| **Green** | `/mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green/scripts/` | Run sync script or `git pull` if Green is a clone. |

**Option A – Sync from Local (when Blue/Green paths are available, e.g. NAS mounted):**

From the **Local** repo root (OSCAL_Reports):

```bash
./scripts/sync-consolidation-script.sh
```

This copies `scripts/consolidate-users.sh` into the Blue and Green `scripts/` directories (default paths above). Override paths if needed:

```bash
BLUE_SCRIPTS_DIR=/path/to/Blue/scripts GREEN_SCRIPTS_DIR=/path/to/Green/scripts ./scripts/sync-consolidation-script.sh
```

Then check in from Blue and Green repos if they are separate clones.

**Option B – Single repo, pull on each server:**

1. Edit and commit `scripts/consolidate-users.sh` in the Local repo, then push.
2. On the Blue server: `cd /path/to/OSCAL-Report-Generator-Blue && git pull`.
3. On the Green server: `cd /path/to/OSCAL-Report-Generator-Green && git pull`.

---

## Two Consolidation Methods

### Method 1: Direct Docker Access (Immediate - Use This Now)

**Script**: `scripts/consolidate-users-docker.sh`

This script directly accesses Docker containers to merge users. Use this method until the backend fix is deployed.

**Requirements**:
- Must be run ON the server where Docker containers are running
- Requires Docker access (sudo or docker group membership)
- Both containers must be running

**Usage**:
```bash
# SSH to the server where containers are running
ssh user@your-nas-server

# Run the script
cd /path/to/OSCAL_Reports
sudo ./scripts/consolidate-users-docker.sh
```

**What it does**:
1. Extracts users.json directly from both containers
2. Merges users (skips duplicates automatically)
3. Updates users.json in both containers
4. Restarts containers to reload users
5. Creates backups in `~/oscal-user-consolidation-TIMESTAMP/`

### Method 2: API-Based Consolidation (After Backend Fix)

**Script**: `scripts/consolidate-users.sh`

This script uses the backend API endpoints for user export/import. Use this method after deploying the backend fix.

**Requirements**:
- Backend fix must be deployed to both servers
- Admin credentials for both instances
- Network access to both URLs

**Basic Usage**:
```bash
# Interactive mode (prompts for password)
./scripts/consolidate-users.sh

# Automatic bi-directional sync
BLUE_PASSWORD='admin#03feb2026' \
GREEN_PASSWORD='admin#03feb2026' \
./scripts/consolidate-users.sh --auto
```

**Advanced Usage**:
```bash
# Custom URLs
./scripts/consolidate-users.sh --auto \
  --blue-url http://blue.oscal.keekar.com \
  --green-url http://green.oscal.keekar.com \
  --blue-password 'admin#03feb2026' \
  --green-password 'admin#03feb2026'

# One-way sync (Blue → Green only)
./scripts/consolidate-users.sh --blue-to-green

# One-way sync (Green → Blue only)
./scripts/consolidate-users.sh --green-to-blue

# Use replace-by-username (default) so same user on both sides gets synced even if Green had them with different ID (e.g. OIDC JIT)
./scripts/consolidate-users.sh --auto

# Use merge mode (skip duplicates only; does not overwrite existing user by username)
./scripts/consolidate-users.sh --auto --import-mode merge
```

**Environment Variables**:
```bash
export BLUE_URL="http://blue.oscal.keekar.com"
export GREEN_URL="http://green.oscal.keekar.com"
export BLUE_USERNAME="admin"
export GREEN_USERNAME="admin"
export BLUE_PASSWORD="admin#03feb2026"
export GREEN_PASSWORD="admin#03feb2026"

./scripts/consolidate-users.sh --auto
```

## Scheduling with Cron

### Option 1: Direct Docker Method (Immediate)

Add to crontab on the server where Docker containers run:

```bash
sudo crontab -e
```

Add this line for automatic sync every 6 hours:
```cron
0 */6 * * * cd /path/to/OSCAL_Reports && ./scripts/consolidate-users-docker.sh >> /var/log/user-consolidation.log 2>&1
```

### Option 2: API Method (After Backend Fix)

Create a credentials file (secure it properly):
```bash
# Create /root/.oscal-sync-env
cat > /root/.oscal-sync-env <<'EOF'
export BLUE_URL="http://blue.oscal.keekar.com"
export GREEN_URL="http://green.oscal.keekar.com"
export BLUE_USERNAME="admin"
export GREEN_USERNAME="admin"
export BLUE_PASSWORD="admin#03feb2026"
export GREEN_PASSWORD="admin#03feb2026"
EOF

chmod 600 /root/.oscal-sync-env
```

Add to crontab:
```bash
crontab -e
```

```cron
# Sync users every 6 hours
0 */6 * * * source /root/.oscal-sync-env && cd /path/to/OSCAL_Reports && ./scripts/consolidate-users.sh --auto >> /var/log/user-consolidation.log 2>&1

# Or more frequent (every hour)
0 * * * * source /root/.oscal-sync-env && cd /path/to/OSCAL_Reports && ./scripts/consolidate-users.sh --auto >> /var/log/user-consolidation.log 2>&1
```

## Users That Will Be Merged

### Blue → Green (4 users to add):
1. `chander.vohra@gmail.com` - Assessor
2. `chetan_joshi@trendmicro.com` - User
3. `dmiglani@adobe.com` - User
4. `satyamish@yahoo.com` - Assessor

### Green → Blue (2 users to add):
1. `Lucas.Lenci@gartner.com` - User
2. `jessica.freeth@defence.gov.au` - User

### Result After Merge:
- **Blue**: 18 + 2 = **20 users**
- **Green**: 16 + 4 = **20 users**
- All users can login to both instances

## Why a user (e.g. ciurdar@adobe.com) might not replicate

If a user exists on Blue but does not appear on Green after consolidation (or the other way around), the usual cause is **merge mode** behavior:

- **Merge mode** (old default): Users with the same **username** or **id** on the target are **skipped**. So if Green already had a user `ciurdar` (e.g. created by OIDC/JIT with a different id), Blue’s `ciurdar` is not imported and you see “Username already exists”.
- **Replace-by-username mode** (new default): For each imported user, if the target already has a user with the same **username**, that target user is **replaced** with the imported one (same password hash, so they can log in on both sides). Use this for full Blue/Green sync.

**Fix:** Run consolidation with the default **replace-by-username** so both sides get the same user record:

```bash
# Bi-directional sync with replace-by-username (default)
./consolidate-users.sh --auto
```

Or explicitly:

```bash
./consolidate-users.sh --auto --import-mode replace-by-username
```

Ensure the **backend** on both Blue and Green has the updated import API that supports `mode=replace-by-username` (see CHANGELOG / recent backend commits). The script prints added/updated/skipped and, when there are skips, lists skipped users and reasons.

## Safety Features

- **No deletions**: Existing users are never deleted (replace-by-username overwrites the same username only)
- **Automatic backups**: All user data is backed up before merge
- **Password preservation**: Password hashes are maintained exactly
- **Replace-by-username (default)**: Syncs same user across Blue/Green even when one side had them with a different ID (e.g. OIDC JIT). Use `--import-mode merge` to only add new users and never overwrite

## Backup Locations

Backups are automatically created in:
```
~/oscal-user-consolidation-YYYYMMDD-HHMMSS/
├── blue-users.json         # Full Blue user export
├── green-users.json        # Full Green user export
├── blue-usernames.txt      # Blue username list
├── green-usernames.txt     # Green username list
├── blue-merged.json        # Blue after merge (if applicable)
└── green-merged.json       # Green after merge (if applicable)
```

## Troubleshooting

### "User not found" error on export endpoint

**Problem**: Backend has the route conflict bug.

**Solution**: 
1. Use Method 1 (Direct Docker) until backend is fixed
2. Deploy backend fix (commit 8063b1a)
3. Switch to Method 2 (API-based)

### "Authentication failed"

**Problem**: Wrong credentials or password changed.

**Solution**: 
- Verify admin password is correct
- Check if password uses special characters (quote them properly)
- Try logging in via web UI first to verify credentials

### "Container not found" (Direct Docker method)

**Problem**: Container names don't match or containers aren't running.

**Solution**:
```bash
# Check running containers
docker ps | grep oscal

# If names are different, update script variables
BLUE_CONTAINER="your-blue-container-name"
GREEN_CONTAINER="your-green-container-name"
```

### "Instance not accessible"

**Problem**: URL is wrong or service is down.

**Solution**:
- Verify URLs are correct
- Check if services are running: `docker ps`
- Test connectivity: `curl http://blue.oscal.keekar.com/`

### User on Blue but not on Green (e.g. ciurdar@adobe.com)

**Problem**: Green already had a user with the same username (e.g. from OIDC JIT) with a different id, so merge mode skipped the Blue user.

**Solution**:
1. Run consolidation with **replace-by-username** (script default): `./consolidate-users.sh --auto`
2. Ensure both Blue and Green backends support `mode=replace-by-username` (deploy latest backend if needed)
3. Re-run bi-directional sync; the script will show “Replaced by username” for that user

## Next Steps

1. ✅ Backend fix committed and pushed to personal repo
2. ⏳ Deploy backend fix to both Blue and Green servers
3. ⏳ Run initial consolidation (use Method 1 for now)
4. ⏳ Set up cron job for automatic synchronization
5. ⏳ After backend deployment, switch to Method 2

## Support

For issues or questions:
- Check logs: `tail -f /var/log/user-consolidation.log`
- Review backup files in `~/oscal-user-consolidation-*/`
- Test export endpoint manually with curl
- Verify Docker container names and status
