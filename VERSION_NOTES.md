# Version Management Notes

## Current Status

**Current Version:** 1.3.0  
**Released:** January 6, 2026  
**Status:** ✅ Released to GitHub

---

## Version 1.3.0 History

### What Happened

Version 1.3.0 was released with **major breaking changes** but was not bumped to 2.0.0 due to a pre-commit hook bug.

**Changes in v1.3.0:**
- ⚠️ **BREAKING:** License changed from MIT to GPL-3.0-or-later
- TrueNAS Blue-Green deployment automation
- Enhanced Docker cleanup
- Port configuration changes (Green=3019, Blue=3020)
- Documentation reorganization
- UI improvements
- 58 source files updated

**Why Version Wasn't Bumped:**
- Pre-commit hook had a logic bug
- Hook checked if package.json was *modified* but not if version *number* changed
- When we changed the license field in package.json, hook assumed version was bumped
- Commit proceeded without actual version increment

**Decision Made:**
- ✅ Keep v1.3.0 as released (Option 2: Accept and Move Forward)
- ✅ Fixed pre-commit hook to prevent this in the future
- ✅ Next version will properly bump to 2.0.0

---

## Pre-Commit Hook Fix

**Previous Behavior (BUGGY):**
```
IF code changed AND package.json modified → ALLOW
```
❌ Problem: Modifying license field counted as "version changed"

**New Behavior (FIXED):**
```
IF code changed AND version number increased → ALLOW
IF code changed AND version number same → BLOCK
```
✅ Solution: Actually compares version numbers (1.3.0 vs 1.3.0)

**What Changed:**
1. Now retrieves previous version from last commit
2. Compares with staged version using semantic versioning
3. Requires version number to actually increase
4. Provides clear error messages showing both versions

---

## Next Version Bump

### When to Bump to v2.0.0

Since v1.3.0 already includes breaking changes (GPL license), the next version bump should be:

**For Breaking Changes:**
```bash
./bump_version.sh major "Description of breaking changes"
# 1.3.0 → 2.0.0
```

**For New Features:**
```bash
./bump_version.sh minor "Description of new features"
# 1.3.0 → 1.4.0
```

**For Bug Fixes:**
```bash
./bump_version.sh patch "Description of bug fix"
# 1.3.0 → 1.3.1
```

### Recommendation

Consider bumping to **2.0.0** on the next significant change to properly reflect the license change that occurred in v1.3.0.

---

## Semantic Versioning Guide

Given a version number MAJOR.MINOR.PATCH (e.g., 2.1.3):

**MAJOR (X.y.z)** - Incompatible API changes or breaking changes:
- License changes (MIT → GPL) ← This is what v1.3.0 should have been
- API endpoint changes
- Removing features
- Changing data formats
- Breaking configuration changes

**MINOR (x.Y.z)** - New features, backwards-compatible:
- New API endpoints (keeping old ones)
- New features that don't break existing functionality
- Significant improvements
- New optional configuration

**PATCH (x.y.Z)** - Backwards-compatible bug fixes:
- Bug fixes
- Security patches
- Documentation updates
- Performance improvements (non-breaking)
- Dependency updates

---

## Version History

| Version | Date | Type | Description |
|---------|------|------|-------------|
| 1.3.0 | 2026-01-06 | Major* | License change (MIT→GPL), TrueNAS automation, UI fixes |
| 1.3.0 | 2024-12-29 | Minor | Previous version bump |

\* Should have been 2.0.0 due to breaking license change

---

## Testing Version Bump

You can test that the pre-commit hook now works correctly:

```bash
# Make a code change
echo "// test comment" >> backend/server.js

# Try to commit without version bump
git add backend/server.js
git commit -m "test commit"

# Should BLOCK with message:
# "Code files have been modified, but version was not bumped"
# "Current version: 1.3.0"
# "Staged version: 1.3.0"

# Reset the test
git reset HEAD backend/server.js
git checkout backend/server.js
```

---

## Important Notes

1. **Always use `./bump_version.sh`** for version changes
2. **Pre-commit hook will now catch** version mismatches
3. **Version 1.3.0 is valid** and released - no need to change it
4. **Next bump** should consider going to 2.0.0 to reflect breaking changes
5. **Hook bug is fixed** - won't happen again

---

## Contact

For questions about version management:
- Author: Mukesh Kesharwani <mukesh.kesharwani@adobe.com>
- Repository: https://github.com/keekar2022/OSCAL-Reports

---

**Last Updated:** January 6, 2026
