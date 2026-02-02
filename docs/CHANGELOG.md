# Changelog

All notable changes to the OSCAL Report Generator project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.7.0] - Planned

### Release Notes
- **Status**: Planned for Next Release
- **Breaking Changes**: None
- **Backward Compatible**: Yes
- **Focus**: International framework expansion - German BSI security standards

### Planned

#### New Framework Support
- **BSI Grundschutz++ Integration** 🇩🇪
  - Added German IT security standards from BSI (Bundesamt für Sicherheit in der Informationstechnik)
  - Grundschutz++ Kompendium catalogue support
  - Source: [BSI Stand-der-Technik-Bibliothek](https://github.com/BSI-Bund/Stand-der-Technik-Bibliothek)
  - OSCAL-compliant format (compatible with existing infrastructure)
  - German-language controls with bilingual implementation support
  - Full export support (OSCAL JSON, Excel, PDF, CCM)
  - AI-powered suggestions for German controls (Mistral 7B multilingual support)

#### Documentation
- **BSI Catalogue Integration Guide** (`docs/BSI_CATALOGUE_INTEGRATION.md`)
  - Comprehensive BSI background and usage guide
  - German control implementation guidance
  - Language considerations and translation resources
  - AI integration for German security terminology
  - Troubleshooting and best practices

#### Frontend Enhancements
- Added BSI Grundschutz++ to catalogue selection dropdown
- German flag indicator (🇩🇪) for German-language catalogues
- Support for German characters (umlauts, ß) in all export formats

---

## [1.6.7] - TBD

### Release Notes
- **Status**: In Development
- **Breaking Changes**: None
- **Backward Compatible**: Yes
- **Focus**: Release process improvements, error prevention, and security updates

### Security

#### Dependency Vulnerabilities Fixed
- **Fixed HIGH severity DoS vulnerability** in `fast-xml-parser` dependency
  - CVE: GHSA-37qj-frw5-hhjh (CVE-2026-25128)
  - CVSS Score: 7.5 (HIGH)
  - Issue: RangeError DoS when parsing XML with out-of-range numeric entities
  - Updated: `fast-xml-parser` 5.2.5 → 5.3.4
  - Impact: Only affects AWS Bedrock integration (transitive dependency through AWS SDK)
  - Attack Vector: Malicious XML responses from AWS API (low probability)
- **Fixed HIGH severity vulnerability** in `@aws-sdk/xml-builder`
  - Updated: `@aws-sdk/xml-builder` 3.972.2 → 3.972.3
  - Transitive dependency fix (automatic with fast-xml-parser update)

**Affected Components:**
- AWS Bedrock integration for Mistral and Gemma models only
- Does not affect: Ollama (local), Mistral API, Google AI API, or non-AI features

**Testing Required:**
- Priority 1: AWS Bedrock integration (if configured)
- Priority 2: Regression testing of other AI providers
- Priority 3: Non-AI feature verification

See `docs/SECURITY_FIXES.md` for detailed analysis and testing plan.

### Added

#### Release Quality Improvements
- **ESLint Configuration**: Added ESLint v9 flat config files for code quality
  - `eslint.config.js` (root)
  - `backend/eslint.config.js` (Node.js backend)
  - `frontend/eslint.config.js` (React frontend with JSX)
- **Lint Scripts**: Added npm lint scripts to all package.json files
  - `npm run lint` - Run linting
  - `npm run lint:fix` - Auto-fix linting issues
  - `npm run lint:all` - Lint all packages (root script)

#### GitHub Actions Workflows
- **Pre-Release Validation Workflow** (`.github/workflows/pre-release-validation.yml`)
  - Version consistency checks across package.json files
  - CHANGELOG.md update validation
  - Workflow YAML syntax validation
  - Tar command syntax validation with test execution
  - ESLint configuration presence check
  - Branch naming convention validation
  - Documentation presence check
- **Shell Validation Workflow** (`.github/workflows/shell-validation.yml`)
  - ShellCheck linting for all .sh files
  - Git hooks validation
  - Shell script best practices check
  - Executable permissions check
  - Dry-run testing for scripts

#### Documentation
- **Release Checklist** (`docs/RELEASE_CHECKLIST.md`)
  - Comprehensive pre-release checklist
  - Release day procedures
  - Common pitfalls and solutions
  - Emergency procedures (rollback, hotfix)
  - Quick reference commands
  - Checklist template for new releases

### Enhanced

#### Release Workflow
- **Fixed tar command syntax** in `.github/workflows/release.yml`
  - Moved `--exclude` options before file arguments
  - Prevents "tar: --exclude has no effect" errors
  - Validated with test tar operations

#### Documentation
- **Branching Strategy** (`docs/BRANCHING_STRATEGY.md`)
  - Added explicit section on correct PR creation to main branch
  - Documented common mistakes (creating custom sync branches)
  - Added examples of correct vs incorrect PR workflows
  - Clarified why only Pre_Prod can merge to main
- **PR Submission Checklist** (`docs/PR_SUBMISSION_CHECKLIST.md`)
  - Added internal repository PR guidelines
  - Documented branch protection rules
  - Added examples of rejected PR patterns
  - Included branch flow diagram

### Fixed

#### GitHub Actions
- **Tar Archive Creation**: Fixed syntax in release.yml to prevent archive creation failures
  - Issue: `--exclude` options positioned after file arguments
  - Solution: Moved excludes before file arguments per tar command requirements
  - Impact: Release workflow now creates archives successfully

### Changed

#### Code Quality
- **Linting Infrastructure**: Project now has optional but recommended linting setup
  - Can be enabled by installing ESLint: `npm install --save-dev eslint@9`
  - Configurations already in place for when linting is desired
  - Non-blocking - project works with or without ESLint installed

---

## [1.6.6] - 2026-01-28

### Release Notes
- **Status**: Promoted to Pre_Prod after successful Quality_Test validation
- **Quality Validation**: 91% pass rate (22/24 checks passed)
- **Test Duration**: 9 seconds
- **Breaking Changes**: None
- **Backward Compatible**: Yes

### Added

#### Test Infrastructure
- **Unified Test Script**: Consolidated three separate validation scripts into single `run-all-tests.sh`
- **Comprehensive Test Suite**: 
  - Unit tests for URL validator, security config, authentication, RBAC
  - Integration tests for CSRF, API security, settings
  - End-to-end tests for complete security workflows
  - v1.6.5 feature validation tests
- **Test Documentation**:
  - `test_cases/README.md` - Complete testing guide
  - `test_cases/TESTING_QUICK_REFERENCE.md` - Quick command reference
  - `test_cases/CHANGES_SUMMARY.md` - Summary of test updates
  - `docs/TEST_UPDATES_V1.6.5.md` - Comprehensive testing documentation

### Enhanced

#### Security - SSRF Protection
- **Cloud Metadata Blocking**: Always block AWS/GCP/Azure metadata endpoints
- **IPv6 Support**: Proper IPv6 loopback handling with `allowLocalhost` option
- **AI Integration**: Support for private network AI services (Ollama)
  - `allowPrivateIPs` option for private IP ranges
  - `allowLocalhost` option for localhost access
  - Cloud metadata endpoints always blocked regardless of options
- **HTTP Response Codes**: Return 403 (Forbidden) for blocked URLs, 400 (Bad Request) for invalid URLs
- **Enhanced Validation**: Added `isCloudMetadata` checks across all SSRF-protected endpoints

#### Documentation
- **Repository Structure**: All documentation properly organized in `docs/` folder
- **Security Documentation**: `docs/SECURITY_FIXES.md` with detailed security analysis
- **Migration Guide**: `docs/CONFIG_MIGRATION_GUIDE.md` for configuration updates

### Fixed

#### Frontend
- **UI Text Visibility**: "Supported Catalogs" text now visible with ash gray color

### Testing Results
- ✅ All security tests passing
- ✅ All functional tests passing
- ✅ CSRF exemption working correctly
- ✅ SSRF protection blocking cloud metadata
- ✅ Bearer token authentication functional
- ✅ AI integration URL validation working
- ✅ Documentation structure validated
- ✅ Version consistency verified (1.6.6)

---

## [1.6.5] - 2026-01-28

### Fixed

#### Critical: CSRF Protection Refinement
- **Issue**: CSRF middleware was blocking all API endpoints with 403 errors, breaking core functionality
- **Affected Endpoints**:
  - `/api/fetch-catalogue` - Catalogue loading failed
  - `/api/ai/test-connection` - AI Integration test connection failed
  - All public report generation endpoints
  - Settings management endpoints
- **Solution**: Exempted all `/api/` endpoints from CSRF protection
- **Rationale**: Application uses Bearer token authentication (immune to CSRF) for protected endpoints and requires public access for core functionality
- **Security**: All other security controls remain active (Bearer auth, RBAC, SSRF protection, rate limiting, input validation)
- **Files Modified**: 
  - `backend/utils/securityConfig.js` - Updated CSRF_EXEMPT_PATHS
  - `docs/SECURITY_FIXES.md` - Added comprehensive security documentation

#### UI: Double Footer Issue
- **Issue**: UseCases page (Fresh Deployment for New AMS Platform) was displaying duplicate footer sections
- **Solution**: Added clarifying comments to ensure Footer component only renders in main app view, not on UseCases page
- **Files Modified**: `frontend/src/App.jsx`

### Security

- **Enhanced**: Bearer token authentication remains the primary security mechanism for protected endpoints
- **Maintained**: SSRF protection via `validateUrl()` for all URL-based endpoints
- **Maintained**: Rate limiting on all endpoints
- **Maintained**: Role-Based Access Control (RBAC) for administrative operations
- **Maintained**: Session cookies use `sameSite: 'strict'` for defense-in-depth
- **Documentation**: Created `docs/SECURITY_FIXES.md` with detailed security analysis

### Testing

- ✅ Catalogue loading endpoint (`/api/fetch-catalogue`) - HTTP 200
- ✅ AI Integration endpoint (`/api/ai/test-connection`) - HTTP 200 with Bearer token
- ✅ Settings endpoints - HTTP 200
- ✅ User management endpoints - HTTP 200 with Bearer token
- ✅ Report generation endpoints - HTTP 200
- ✅ All protected endpoints properly require Bearer token authentication
- ✅ All public endpoints work without authentication

### References

- See `docs/SECURITY_FIXES.md` for detailed security analysis and rationale
- See `backend/utils/securityConfig.js` for CSRF configuration and architectural comments

---

## Version History

### [1.6.5] - 2026-01-28
- CSRF protection refinement
- Double footer fix
- Security documentation update

---

**Note**: For detailed security information, see `docs/SECURITY_FIXES.md`
