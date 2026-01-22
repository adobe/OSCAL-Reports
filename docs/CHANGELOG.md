# Changelog

All notable changes to the OSCAL Report Generator will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
- Documentation consolidation (29 → 16 files, 45% reduction)
- Comprehensive DEPLOYMENT.md guide (consolidated 5 deployment docs)
- Comprehensive TESTING_GUIDE.md (consolidated 5 test docs)
- Implementation history archive in docs/archive/

### Changed
- Renamed tests/ folder to test_cases/ for better clarity
- Consolidated deployment documentation into single comprehensive guide
- Consolidated testing documentation into single complete guide
- Archived implementation history docs for better organization

### Removed
- TRUENAS_QUICK_SETUP.md (merged into DEPLOYMENT.md)
- TRUENAS_DEPLOYMENT.md (merged into DEPLOYMENT.md)
- DEPLOYMENT_GUIDE.md (merged into DEPLOYMENT.md)
- CRON_SETUP.md (merged into DEPLOYMENT.md)
- test_cases/docs/TESTING.md (merged into TESTING_GUIDE.md)
- test_cases/docs/TESTING_QUICK_START.md (merged into TESTING_GUIDE.md)
- test_cases/docs/PLAYWRIGHT_QUICK_GUIDE.md (merged into TESTING_GUIDE.md)
- test_cases/docs/RECORDING_TESTS.md (merged into TESTING_GUIDE.md)
- test_cases/docs/TEST_IMPLEMENTATION_SUMMARY.md (merged into TESTING_GUIDE.md)
- REFACTORING_SUMMARY.md (archived)
- AUTOMATION_ENHANCEMENTS.md (archived)
- CONFIG_SAVE_VERIFICATION.md (archived)
- IMPLEMENTATION_COMPLETE.md (archived)

---

## [1.6.2] - 2026-01-22

### Added
- Comprehensive validation system with 70+ best practice rules
- Security pattern detection for 50+ vulnerability types
- Automated best practice updates from npm audit
- Dynamic rule learning system
- Complete test coverage documentation (86+ tests)
- CI/CD automation enhancements

### Changed
- Enhanced bump_version.sh to auto-update best practices
- Updated GitHub Actions with comprehensive validation
- test_cases folder now committed to git for contributor validation

### Fixed
- Async keyword missing in /api/settings handler

---

## [1.6.1] - 2026-01-22

### Added
- Config save verification system
- Disk persistence verification after save
- Visual feedback for successful saves
- "Last Saved" timestamp indicator
- Detailed save verification reporting

### Fixed
- Configuration loss after container rebuilds
- Missing save confirmation feedback

---

## [1.6.0] - 2026-01-22

### Added
- Config persistence verification in build_on_truenas.sh
- Beta warning banner on home page
- Volume mount verification
- Pre-deploy config backup check

### Changed
- Enhanced deployment script with config checks
- Improved user feedback for beta status

---

## [1.5.0] - 2026-01-20

### Added
- Role management UI in User Management page
- Role dropdown selection (Platform Admin, User, Assessor)
- RBAC permission system
- Secure password hashing with PBKDF2

### Changed
- Enhanced user management interface
- Improved security with role-based access

---

## [1.4.2] - 2025-12-15

### Security
- Fixed all 5 GitHub Dependabot vulnerabilities
- Updated qs package to >=6.14.1
- Comprehensive security audit

---

## [1.4.0] - 2025-11-30

### Added
- Comprehensive project audit and documentation updates
- Git repository ownership auto-fix
- Docker deployment improvements

---

## [1.3.0] - 2025-11-15

### Added
- TrueNAS deployment support
- Blue-Green deployment strategy
- Automated monthly updates via cron

---

## [1.2.7] - 2025-10-30

### Added
- Docker containerization
- Docker Compose support
- Volume persistence for config

---

## [1.2.0] - 2025-09-15

### Added
- User authentication system
- Session management
- Password hashing

---

## [1.1.0] - 2025-08-01

### Added
- Email configuration
- SMTP integration
- Email notifications

---

## [1.0.0] - 2025-06-01

### Added
- Initial release
- OSCAL catalog processing
- SSP generation
- SOA creation
- CCM export
- PDF export functionality
- Excel export functionality
- Basic web interface

---

## Version History Summary

| Version | Date | Major Changes |
|---------|------|---------------|
| 1.6.2 | 2026-01-22 | Validation system, automation enhancements |
| 1.6.1 | 2026-01-22 | Config save verification |
| 1.6.0 | 2026-01-22 | Config persistence checks |
| 1.5.0 | 2026-01-20 | Role management UI |
| 1.4.2 | 2025-12-15 | Security fixes |
| 1.4.0 | 2025-11-30 | Documentation updates |
| 1.3.0 | 2025-11-15 | TrueNAS deployment |
| 1.2.7 | 2025-10-30 | Docker support |
| 1.2.0 | 2025-09-15 | User authentication |
| 1.1.0 | 2025-08-01 | Email integration |
| 1.0.0 | 2025-06-01 | Initial release |

---

For detailed implementation history, see `docs/archive/IMPLEMENTATION_HISTORY.md`
