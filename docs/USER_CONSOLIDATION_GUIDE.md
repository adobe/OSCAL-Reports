# User Consolidation Guide

## Overview

The `consolidate-users.sh` script synchronizes user accounts between Blue and Green deployments, ensuring that users registered on either instance can login to both with the same credentials.

## Why Consolidate Users?

When running Blue/Green deployments:
- Users who register on **Blue (port 3020)** can only login to Blue
- Users who register on **Green (port 3019)** can only login to Green
- **After consolidation**: All users can login to **BOTH** instances

## Quick Start

### Automatic Bi-Directional Sync (Recommended)

```bash
cd /Users/mkesharw/Documents/OSCAL_Reports/scripts
./consolidate-users.sh --auto
```

You'll be prompted for admin credentials for both deployments, then the script will:
1. Export users from Blue → Import to Green
2. Export users from Green → Import to Blue
3. Both instances now have all users

### One-Way Sync

```bash
# Blue → Green only
./consolidate-users.sh --blue-to-green

# Green → Blue only
./consolidate-users.sh --green-to-blue
```

### Interactive Mode

```bash
./consolidate-users.sh
```

Choose from menu:
1. Blue → Green
2. Green → Blue
3. Bi-directional (recommended)

## Usage Examples

### Example 1: Manual Consolidation

```bash
$ ./consolidate-users.sh --auto

👥 User Consolidation - Blue ⟷ Green
Running in automatic mode...
Mode: Bi-directional sync (recommended)

Container Status:
  Blue:  ✓ Running
  Green: ✓ Running

🔐 Authenticating Blue Deployment
Blue password: ********
✓ Blue authentication successful

🔐 Authenticating Green Deployment
Green password: ********
✓ Green authentication successful

📤 Exporting Users from Blue
✓ Exported 5 users from Blue

📥 Importing Blue Users into Green
✓ Blue → Green: 3 users added, 2 skipped (duplicates)

📤 Exporting Users from Green
✓ Exported 4 users from Green

📥 Importing Green Users into Blue
✓ Green → Blue: 1 users added, 4 skipped (duplicates)

🔍 Verification
Blue:  Total users: 6
Green: Total users: 6

✅ User Consolidation Complete!

📊 Result: Bi-directional merge complete ⭐
   ✓ Both deployments now have all users
   ✓ Users registered on Blue can login to Green
   ✓ Users registered on Green can login to Blue
   🎉 Users can now use BOTH instances with same credentials!
```

### Example 2: Using Environment Variables

For automation or scripting:

```bash
export BLUE_USERNAME="admin"
export BLUE_PASSWORD="your-blue-password"
export GREEN_USERNAME="admin"
export GREEN_PASSWORD="your-green-password"

./consolidate-users.sh --auto
```

### Example 3: Custom Hostnames

```bash
export BLUE_HOST="192.168.1.100"
export GREEN_HOST="192.168.1.100"
export BLUE_USERNAME="admin"
export BLUE_PASSWORD="password"
export GREEN_USERNAME="admin"
export GREEN_PASSWORD="password"

./consolidate-users.sh --auto
```

## Automated Synchronization

### Option 1: Cron Job (Recommended)

Run consolidation every 6 hours:

```bash
# Edit crontab
crontab -e

# Add this line (adjust path to your installation)
0 */6 * * * cd /Users/mkesharw/Documents/OSCAL_Reports/scripts && BLUE_PASSWORD="pass1" GREEN_PASSWORD="pass2" ./consolidate-users.sh --auto >> /tmp/user-consolidation.log 2>&1
```

### Option 2: systemd Timer (Linux)

Create `/etc/systemd/system/oscal-user-sync.service`:

```ini
[Unit]
Description=OSCAL User Consolidation Service
After=network.target

[Service]
Type=oneshot
Environment="BLUE_USERNAME=admin"
Environment="BLUE_PASSWORD=yourpass"
Environment="GREEN_USERNAME=admin"
Environment="GREEN_PASSWORD=yourpass"
ExecStart=/path/to/scripts/consolidate-users.sh --auto
User=your-user

[Install]
WantedBy=multi-user.target
```

Create `/etc/systemd/system/oscal-user-sync.timer`:

```ini
[Unit]
Description=Run OSCAL User Consolidation every 6 hours

[Timer]
OnBootSec=5min
OnUnitActiveSec=6h

[Install]
WantedBy=timers.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable oscal-user-sync.timer
sudo systemctl start oscal-user-sync.timer
```

## How It Works

### 1. Export Phase
- Script authenticates to Blue deployment
- Exports all users via `/api/users/export` endpoint
- Returns JSON with user data (including password hashes)

### 2. Import Phase
- Script authenticates to Green deployment
- Imports users via `/api/users/import?mode=merge` endpoint
- Merge mode ensures:
  - Existing users are NOT overwritten
  - Duplicate usernames are skipped
  - Password hashes are preserved exactly

### 3. Bi-Directional
- Repeats export/import in reverse (Green → Blue)
- Results in both deployments having all users

## Important Notes

### What Gets Synchronized
✅ **Synchronized:**
- Username
- Email address
- Password hash (PBKDF2)
- Role (admin/user)
- Account status
- Created date

❌ **NOT Synchronized:**
- Active sessions
- Session tokens
- User preferences
- Login history
- Deployment-specific data

### Duplicate Handling
- Users are identified by **username** and **ID**
- If a user already exists in target deployment:
  - Existing user data is preserved (not overwritten)
  - Import is skipped for that user
  - Reported as "skipped (duplicate)"

### Password Security
- Password hashes are copied exactly as-is
- Uses PBKDF2 with 600,000 iterations (FIPS 140-2 compliant)
- No passwords are ever transmitted in plain text
- Hashes work identically on both deployments

## Troubleshooting

### Container Not Running

```
✗ Neither Blue nor Green containers are running!
```

**Solution:** Start at least one container before running consolidation.

```bash
docker ps | grep oscal-report-generator
```

### Authentication Failed

```
✗ Blue authentication failed!
```

**Solutions:**
1. Verify container is running
2. Check username/password are correct
3. Ensure API endpoints are accessible
4. Check container logs: `docker logs oscal-report-generator-blue`

### No Users Added

```
Blue → Green: 0 users added, 5 skipped (duplicates)
```

**This is normal if:**
- All users already exist in target deployment
- Consolidation was already run previously
- Users were manually added to both deployments

### Connection Refused

**Problem:** Cannot connect to container

**Solutions:**
1. Verify container is running: `docker ps`
2. Check port mappings: `docker port oscal-report-generator-blue`
3. Try different hostname:
   - `localhost`
   - `127.0.0.1`
   - Your NAS IP (e.g., `192.168.1.100`)

### jq Command Not Found

```
bash: jq: command not found
```

**Install jq:**

```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq

# RHEL/CentOS
sudo yum install jq
```

## Best Practices

### 1. Run After New User Registrations
After users register on either deployment, run consolidation to sync:

```bash
./consolidate-users.sh --auto
```

### 2. Backup Before Consolidation
The script automatically creates backups in:
```
~/oscal-user-consolidation-YYYYMMDD-HHMMSS/
├── blue-users.json
└── green-users.json
```

Keep these for recovery if needed.

### 3. Verify After Consolidation
Check user counts match:

```bash
# Blue users
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3020/api/users | jq 'length'

# Green users
curl -s -H "Authorization: Bearer $TOKEN" \
  http://localhost:3019/api/users | jq 'length'
```

### 4. Regular Synchronization
Set up automated sync via cron to keep deployments in sync:
- Every 6 hours for active systems
- Daily for less active systems

### 5. Monitor Consolidation Logs
When running via cron, monitor logs:

```bash
tail -f /tmp/user-consolidation.log
```

## Security Considerations

### 1. Admin Credentials
- Store passwords securely
- Use environment variables, not hardcoded values
- Consider using a secrets manager for automation

### 2. Backup Files
- Backup files contain password hashes
- Secure the backup directory with proper permissions:

```bash
chmod 700 ~/oscal-user-consolidation-*
```

### 3. Network Security
- Use HTTPS in production
- Consider VPN for remote access
- Restrict API access with firewall rules

## Command Reference

```bash
# Show help
./consolidate-users.sh --help

# Automatic bi-directional sync (recommended)
./consolidate-users.sh --auto

# One-way sync options
./consolidate-users.sh --blue-to-green
./consolidate-users.sh --green-to-blue

# Interactive mode (manual selection)
./consolidate-users.sh
```

### Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `BLUE_HOST` | Blue hostname/IP | `192.168.1.100` |
| `GREEN_HOST` | Green hostname/IP | `192.168.1.100` |
| `BLUE_USERNAME` | Blue admin username | `admin` |
| `BLUE_PASSWORD` | Blue admin password | `yourpassword` |
| `GREEN_USERNAME` | Green admin username | `admin` |
| `GREEN_PASSWORD` | Green admin password | `yourpassword` |

## Related Documentation

- [Docker Hub Deployment](./DOCKER_HUB_DEPLOYMENT_IMPLEMENTATION.md)
- [Deployment Testing Guide](./DEPLOYMENT_TESTING_GUIDE.md)
- [Blue/Green Deployment Strategy](./BRANCHING_STRATEGY.md)

---

**Last Updated:** January 29, 2026  
**Script Version:** 2.0.0  
**Maintained by:** Mukesh Kesharwani
