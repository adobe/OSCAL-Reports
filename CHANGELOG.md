# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2025-12-29

### Added
- Comprehensive testing infrastructure with Jest and Playwright
- Automated test suite with pre-commit hooks
- Backend unit tests (21 tests) for authentication and RBAC
- Backend integration tests (4 tests) for API endpoints
- Playwright E2E testing framework and documentation
- Tests documentation (TESTING.md, PLAYWRIGHT_QUICK_GUIDE.md, RECORDING_TESTS.md)
- Backend utilities: atomic file operations (atomicWrite.js)
- Job queue system for background operations (jobQueue.js)
- Debug state manager for server-side debugging (debugStateManager.js)
- Version bumping script (bump_version.sh)
- Contributing guidelines (.github/CONTRIBUTING.md)
- Pull request template (.github/PULL_REQUEST_TEMPLATE.md)
- Docker and deployment ignore files (.dockerignore, .deployignore)

### Changed
- Consolidated documentation into 4 comprehensive files (BEST_PRACTICES.md, QUALITY_ASSURANCE.md, DEPLOYMENT_GUIDE.md, ARCHITECTURE.md)
- Improved UI layout: increased control tile width for better content fit
- Enhanced horizontal padding and spacing in control items (1.5rem)
- Improved status badge and expand button positioning
- Updated backend services to use async/await properly
- Enhanced configManager with atomic file operations
- Enhanced userManager with PBKDF2 password hashing
- Improved security checks to reduce false positives in pre-commit hooks
- Updated all package.json files with latest dependencies

### Fixed
- Control item layout issues (status badges and buttons overflowing)
- CSS layout problems in ControlItem.css, ControlItemCCM.css, ControlsList.css
- Async/await errors in backend authentication middleware
- Security check false positives for variable names and documentation

### Removed
- blue/ and green/ folders (cleanup)
- Old scattered test files (moved to tests/ folder)
- docs/CONFIGURATION.md (merged into DEPLOYMENT.md)

## [1.2.7] - 2025-12-XX

### Changed
- Version update for AI Telemetry Logging
- OpenTelemetry standards compliance
- Enhanced logging features with automatic log rotation

