# Cron Configuration for OSCAL Blue-Green Deployment

## Quick Copy-Paste Setup

### Open Crontab Editor
```bash
crontab -e
```

### Add These Lines (Recommended Schedule)

```bash
# OSCAL Report Generator - Monthly Staggered Blue-Green Deployment
# Green Instance: 1st, 3rd, and 5th Sunday at 2 AM
0 2 1-7,15-21,29-31 * 0 cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green && ./build_on_truenas.sh >> /var/log/oscal-green-deploy.log 2>&1

# Blue Instance: 2nd and 4th Sunday at 2 AM
0 2 8-14,22-28 * 0 cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue && ./build_on_truenas.sh >> /var/log/oscal-blue-deploy.log 2>&1
```

---

## Understanding the Cron Syntax

### Green Instance: `0 2 1-7,15-21,29-31 * 0`

| Field | Value | Meaning |
|-------|-------|---------|
| Minute | `0` | At the start of the hour |
| Hour | `2` | 2 AM |
| Day of Month | `1-7,15-21,29-31` | Days 1-7 (1st week), 15-21 (3rd week), 29-31 (5th week) |
| Month | `*` | Every month |
| Day of Week | `0` | Sunday (0 = Sunday, 1 = Monday, etc.) |

**Result**: Runs at 2 AM on Sundays that fall between days 1-7, 15-21, or 29-31 of any month.

### Blue Instance: `0 2 8-14,22-28 * 0`

| Field | Value | Meaning |
|-------|-------|---------|
| Minute | `0` | At the start of the hour |
| Hour | `2` | 2 AM |
| Day of Month | `8-14,22-28` | Days 8-14 (2nd week), 22-28 (4th week) |
| Month | `*` | Every month |
| Day of Week | `0` | Sunday (0 = Sunday, 1 = Monday, etc.) |

**Result**: Runs at 2 AM on Sundays that fall between days 8-14 or 22-28 of any month.

---

## Alternative Time Schedules

### 3 AM Updates
```bash
# Green: 1st, 3rd, 5th Sunday at 3 AM
0 3 1-7,15-21,29-31 * 0 cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green && ./build_on_truenas.sh >> /var/log/oscal-green-deploy.log 2>&1

# Blue: 2nd, 4th Sunday at 3 AM
0 3 8-14,22-28 * 0 cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue && ./build_on_truenas.sh >> /var/log/oscal-blue-deploy.log 2>&1
```

### Midnight Updates
```bash
# Green: 1st, 3rd, 5th Sunday at 12 AM
0 0 1-7,15-21,29-31 * 0 cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green && ./build_on_truenas.sh >> /var/log/oscal-green-deploy.log 2>&1

# Blue: 2nd, 4th Sunday at 12 AM
0 0 8-14,22-28 * 0 cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue && ./build_on_truenas.sh >> /var/log/oscal-blue-deploy.log 2>&1
```

### 4 AM Updates (After typical backup windows)
```bash
# Green: 1st, 3rd, 5th Sunday at 4 AM
0 4 1-7,15-21,29-31 * 0 cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green && ./build_on_truenas.sh >> /var/log/oscal-green-deploy.log 2>&1

# Blue: 2nd, 4th Sunday at 4 AM
0 4 8-14,22-28 * 0 cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue && ./build_on_truenas.sh >> /var/log/oscal-blue-deploy.log 2>&1
```

---

## Monthly Calendar Reference

| Week | Days | Sunday Falls On | Green Updates | Blue Updates |
|------|------|-----------------|---------------|--------------|
| 1st  | 1-7  | 1st Sunday | ✅ Yes | ❌ No |
| 2nd  | 8-14 | 2nd Sunday | ❌ No | ✅ Yes |
| 3rd  | 15-21 | 3rd Sunday | ✅ Yes | ❌ No |
| 4th  | 22-28 | 4th Sunday | ❌ No | ✅ Yes |
| 5th  | 29-31 | 5th Sunday (rare) | ✅ Yes | ❌ No |

**Note**: A 5th Sunday only occurs when the month has 29, 30, or 31 days AND the 1st day is Friday, Saturday, or Sunday.

---

## Verification Commands

### View Current Cron Jobs
```bash
crontab -l
```

### List Cron Jobs for OSCAL
```bash
crontab -l | grep oscal
```

### Test Cron Job (Manual Run)
```bash
# Green instance
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green && ./build_on_truenas.sh

# Blue instance
cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue && ./build_on_truenas.sh
```

### View Deployment Logs
```bash
# Green deployment log
tail -f /var/log/oscal-green-deploy.log

# Blue deployment log
tail -f /var/log/oscal-blue-deploy.log

# Both logs
tail -f /var/log/oscal-*-deploy.log
```

### Check Last Deployment Time
```bash
ls -lh /var/log/oscal-*-deploy.log
```

---

## Example: 2025 Deployment Calendar

### January 2025
- **Sun, Jan 5** (1st Sunday) → 🟢 GREEN updates
- **Sun, Jan 12** (2nd Sunday) → 🔵 BLUE updates
- **Sun, Jan 19** (3rd Sunday) → 🟢 GREEN updates
- **Sun, Jan 26** (4th Sunday) → 🔵 BLUE updates

### February 2025
- **Sun, Feb 2** (1st Sunday) → 🟢 GREEN updates
- **Sun, Feb 9** (2nd Sunday) → 🔵 BLUE updates
- **Sun, Feb 16** (3rd Sunday) → 🟢 GREEN updates
- **Sun, Feb 23** (4th Sunday) → 🔵 BLUE updates

### March 2025
- **Sun, Mar 2** (1st Sunday) → 🟢 GREEN updates
- **Sun, Mar 9** (2nd Sunday) → 🔵 BLUE updates
- **Sun, Mar 16** (3rd Sunday) → 🟢 GREEN updates
- **Sun, Mar 23** (4th Sunday) → 🔵 BLUE updates
- **Sun, Mar 30** (5th Sunday) → 🟢 GREEN updates ⭐

---

## Troubleshooting

### Cron Not Running?
```bash
# Check cron service status
service cron status

# Or on some systems
systemctl status cron

# Check system logs
tail -f /var/log/syslog | grep CRON
```

### Script Not Executing?
```bash
# Check script permissions
ls -l /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green/build_on_truenas.sh

# Make executable if needed
chmod +x /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green/build_on_truenas.sh
chmod +x /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue/build_on_truenas.sh
```

### No Logs Generated?
```bash
# Check log directory permissions
ls -ld /var/log

# Create log file manually
touch /var/log/oscal-green-deploy.log
touch /var/log/oscal-blue-deploy.log

# Set permissions
chmod 644 /var/log/oscal-*.log
```

### Test Cron Syntax
Use an online cron expression tester like [crontab.guru](https://crontab.guru/) to validate your expressions.

---

## Additional Options

### Email Notifications (If Mail is Configured)
```bash
# Add MAILTO to receive email notifications
MAILTO=admin@example.com

# Green: 1st, 3rd, 5th Sunday at 2 AM
0 2 1-7,15-21,29-31 * 0 cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green && ./build_on_truenas.sh >> /var/log/oscal-green-deploy.log 2>&1

# Blue: 2nd, 4th Sunday at 2 AM
0 2 8-14,22-28 * 0 cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue && ./build_on_truenas.sh >> /var/log/oscal-blue-deploy.log 2>&1
```

### Separate Error Logs
```bash
# Green with separate error log
0 2 1-7,15-21,29-31 * 0 cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Green && ./build_on_truenas.sh >> /var/log/oscal-green-deploy.log 2>> /var/log/oscal-green-error.log

# Blue with separate error log
0 2 8-14,22-28 * 0 cd /mnt/pool1/Documents/KACI-Apps/OSCAL-Report-Generator-Blue && ./build_on_truenas.sh >> /var/log/oscal-blue-deploy.log 2>> /var/log/oscal-blue-error.log
```

---

## Important Notes

1. **Never Update Both Simultaneously**: The staggered schedule ensures high availability
2. **Green is Canary**: Green updates first, allowing time to catch issues
3. **Blue is Production**: Blue updates later with a proven stable version
4. **Script is Idempotent**: Safe to run multiple times, only rebuilds if version changes
5. **Logs Persist**: All deployment activities are logged for audit trail

---

**Questions or Issues?**  
See: [TRUENAS_DEPLOYMENT.md](TRUENAS_DEPLOYMENT.md) for complete documentation.

