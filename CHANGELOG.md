# Changelog

All notable changes to the OSCAL Report Generator V2 will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.1] - 2026-01-06

### Removed
- Removed `deploy-to-smb.sh` script (no longer needed with TrueNAS automation)
- Removed SMB deployment documentation from DEPLOYMENT.md

### Fixed
- Fixed pre-commit hook bug that allowed commits without version bumps
- Pre-commit hook now properly compares version numbers instead of just checking if package.json was modified

### Added
- Added `VERSION_NOTES.md` to document version management and pre-commit hook fix

### Changed
- Updated documentation to remove all references to deploy-to-smb.sh

## [1.3.0] - 2026-01-06

### Breaking Changes
- **License Change**: Migrated from MIT to GPL-3.0-or-later
  - Updated LICENSE file with GNU GPL v3.0
  - Updated all 58 source files with new license headers
  - Added license link to application footer

### Added
- **TrueNAS Blue-Green Deployment Automation**:
  - Enhanced `build_on_truenas.sh` with comprehensive Docker cleanup
  - Added `--no-cache` flag to prevent Docker layer caching issues
  - Implemented aggressive old image removal
  - Auto-detection of Blue/Green instances based on directory name
  - Port configuration: Green=3019, Blue=3020
  - Monthly staggered update schedule support
  - Version-aware builds (only rebuilds if version changed)
  - Git integration (uses existing repos, pulls updates)

- **Documentation**:
  - Added `docs/CRON_SETUP.md` for cron configuration reference
  - Added `docs/TRUENAS_DEPLOYMENT.md` for complete deployment guide
  - Added `docs/TRUENAS_QUICK_SETUP.md` for quick start
  - Reorganized all .md files into `docs/` folder
  - Test documentation moved to `tests/docs/`

- **UI/UX Improvements**:
  - Added "License" link to application footer
  - Updated Footer component with version 1.3.0

### Fixed
- Fixed Docker image caching issues causing old versions (1.2.6) to persist
- Fixed status badge and button placement in control tiles
- Fixed control item overflow issues
- Improved control item layout and spacing

### Changed
- Updated all copyright notices to 2025
- Updated README.md with GPL license information and badge
- Updated all port references in documentation (Green=3019, Blue=3020)

## [1.2.7] - 2024-12-29

### Added
- AI telemetry logging system
- User management improvements
- Session management enhancements

### Fixed
- Various bug fixes and stability improvements

---

**Copyright (C) 2025 Mukesh Kesharwani**  
**License:** GPL-3.0-or-later

