# ⚡ IMMEDIATE ACTION REQUIRED - User Consolidation

## Summary

The user consolidation scripts have been updated and are ready to use. However, there's a backend API bug that needs to be fixed first on both servers.

## ✅ What's Been Done

1. **Backend API Fixed** (Commit: `8063b1a`)
   - Fixed route conflict preventing `/api/users/export` from working
   - Code is committed and pushed to personal repo

2. **Scripts Updated** (Commit: `5922ed8`)
   - Updated `consolidate-users.sh` to support custom URLs
   - Created `consolidate-users-docker.sh` as immediate workaround
   - Added comprehensive documentation

## 🎯 IMMEDIATE NEXT STEPS

### Step 1: Use Docker Workaround (DO THIS NOW)

**On the server where Docker containers are running:**

```bash
# SSH to your server
ssh user@your-server

# Navigate to project
cd /path/to/OSCAL_Reports

# Pull latest changes
git pull origin Development

# Run the Docker-based consolidation
sudo ./scripts/consolidate-users-docker.sh
```

This will immediately merge the users:
- ✅ Blue gets 2 users from Green
- ✅ Green gets 4 users from Blue
- ✅ Result: Both have 20 users
- ✅ All backups saved automatically

### Step 2: Deploy Backend Fix (DO THIS SOON)

**On BOTH Blue and Green servers:**

```bash
# Navigate to project
cd /path/to/OSCAL_Reports

# Pull latest backend code
git pull origin Development

# Restart containers to apply fix
docker restart oscal-report-generator-blue
docker restart oscal-report-generator-green

# Verify the fix works
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://blue.oscal.keekar.com/api/users/export
```

### Step 3: Setup Cron Job (AFTER BACKEND FIX)

**Choose ONE option:**

#### Option A: Direct Docker (Works Now, Before Backend Fix)

```bash
sudo crontab -e
```

Add:
```cron
# Sync users every 6 hours using Docker direct access
0 */6 * * * cd /path/to/OSCAL_Reports && ./scripts/consolidate-users-docker.sh >> /var/log/user-consolidation.log 2>&1
```

#### Option B: API-Based (After Backend Fix - Recommended)

Create credentials file:
```bash
sudo bash -c 'cat > /root/.oscal-sync-env <<EOF
export BLUE_PASSWORD="admin#03feb2026"
export GREEN_PASSWORD="admin#03feb2026"
EOF'

sudo chmod 600 /root/.oscal-sync-env
```

Add to crontab:
```bash
sudo crontab -e
```

```cron
# Sync users every 6 hours using API
0 */6 * * * source /root/.oscal-sync-env && cd /path/to/OSCAL_Reports && ./scripts/consolidate-users.sh --auto >> /var/log/user-consolidation.log 2>&1
```

## 📊 Expected Results

### Before Consolidation:
- **Blue**: 18 users
  - 14 common with Green
  - 4 unique: chander.vohra@gmail.com, chetan_joshi@trendmicro.com, dmiglani@adobe.com, satyamish@yahoo.com

- **Green**: 16 users
  - 14 common with Blue  
  - 2 unique: Lucas.Lenci@gartner.com, jessica.freeth@defence.gov.au

### After Consolidation:
- **Blue**: 20 users (added 2 from Green)
- **Green**: 20 users (added 4 from Blue)
- **All users can login to BOTH instances** ✅

## 📁 Files Changed

1. `backend/server.js` - API route fix
2. `scripts/consolidate-users.sh` - Updated for URL support
3. `scripts/consolidate-users-docker.sh` - New Docker workaround script
4. `docs/USER_CONSOLIDATION_GUIDE.md` - Complete documentation

## 🔗 GitHub Commits

- Backend fix: `8063b1a` 
- Scripts update: `5922ed8`
- Pushed to: `https://github.com/keekar2022/OSCAL-Reports.git` (Development branch)

## ⚠️ Important Notes

1. **Backups**: All user data is backed up before merge in `~/oscal-user-consolidation-TIMESTAMP/`
2. **No Deletions**: Existing users are never deleted or modified
3. **Safe Merge**: Duplicate users are automatically skipped
4. **Passwords**: All password hashes are preserved exactly

## 📞 Quick Commands Reference

```bash
# Run immediate consolidation (Docker method)
sudo ./scripts/consolidate-users-docker.sh

# Run consolidation after backend fix (API method)
BLUE_PASSWORD='admin#03feb2026' \
GREEN_PASSWORD='admin#03feb2026' \
./scripts/consolidate-users.sh --auto

# Check consolidation logs
tail -f /var/log/user-consolidation.log

# View latest backup
ls -ltr ~/oscal-user-consolidation-*/ | tail -20
```

## ✅ Checklist

- [ ] Run Docker-based consolidation NOW (`consolidate-users-docker.sh`)
- [ ] Verify users merged correctly (both instances should have 20 users)
- [ ] Deploy backend fix to both servers
- [ ] Test API export endpoint works
- [ ] Setup cron job for automatic sync
- [ ] Monitor logs after first automated run

## 📚 Full Documentation

See `docs/USER_CONSOLIDATION_GUIDE.md` for complete details, troubleshooting, and examples.

---

**Status**: ✅ Ready to execute
**Priority**: HIGH - Run Step 1 immediately
**Estimated Time**: 5 minutes for consolidation, 10 minutes for backend deployment
