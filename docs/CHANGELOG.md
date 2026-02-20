# Changelog

All notable changes to the OSCAL Report Generator project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.7.1] - 2025-02-20

### Release Notes
- **Status**: Released
- **Breaking Changes**: None
- **Backward Compatible**: Yes
- **Focus**: Pass-backed sensitive configuration (secrets in pass, pointers in config)

### Added

#### Pass-backed sensitive configuration
- **Secrets in pass, pointers in config**
  - SSO Integration: All OAuth client secrets (Azure, Google, Okta, GitHub) stored in [pass](https://www.passwordstore.org/); `config.json` holds only pointers (e.g. `{ "_pass": "OSCAL/sso-oauth-azure-client-secret" }`).
  - Messaging: SMTP password and Slack webhook URL stored in pass (`OSCAL/smtp-password`, `OSCAL/slack-webhook-url`).
  - AI Integration: API token and AWS Bedrock credentials stored in pass (`OSCAL/ai-api-token`, `OSCAL/ai-aws-access-key-id`, `OSCAL/ai-aws-secret-access-key`).
  - Backend resolves pointers at runtime via `getResolvedConfig()`; GET APIs return raw config (pointers or masked) so the client never receives resolved secrets.
  - New modules: `backend/utils/passResolver.js`, `backend/utils/sensitiveConfigKeys.js`. Optional env: `OSCAL_PASS_DISABLED=1` to skip pass (local dev), `PASSWORD_STORE_DIR` for store location.

### Documentation
- **DEPLOYMENT.md**: New "Sensitive settings and pass" section with pass entry table and deployment notes (local, TrueNAS/Docker, EC2).
- **ARCHITECTURE.md**: New "Pass-backed sensitive config" subsection under Configuration Security.
- **config.json.example**: Sensitive fields use pointer examples.

---

## [1.7.0] - 2025-02-05

### Release Notes
- **Status**: Released
- **Breaking Changes**: None
- **Backward Compatible**: Yes
- **Focus**: NIST SP 800-53 compliance & Security Assessment Results (SAR) generation

### Added

#### NIST SP 800-53 Compliance Enhancement
- **Assessment/Testing Objective Field** 🎯
  - New field in Testing & Evidence section for assessment objectives
  - Maps to NIST SP 800-53 `assessment-objective` → OSCAL `local-objective`
  - Placed at top of Testing & Evidence section per assessment workflow
  - Role-based access: Requires Assessor role to edit
  - Optional field with AI-powered suggestions
  - Full support across all export formats

#### OSCAL Security Assessment Results (SAR) Generation
- **New SAR Export Format** 📋
  - Complete OSCAL-compliant Security Assessment Results document generation
  - Proper NIST SP 800-53 field mappings:
    - `testingObjective` → `assessment-objective` → `local-objective` → `description`
    - `testingProcedure` → `assessment-method` → `description`
  - Includes observations, findings, and reviewed-controls
  - Assessment metadata with timestamps and assessor information
  - Export button: "Export SAR (Assessment Results)"
  - Separate from SSP export for proper compliance documentation

#### Data Persistence & Integration
- **Excel Import/Export Support**
  - New "Assessment/Testing Objective" column in CCM Excel exports
  - Import/export round-trip support
  - Column positioned logically after Evidence Location

- **AI Suggestion Enhancement**
  - AI-generated suggestions now include Testing Objectives
  - Context-aware objectives based on control family (AC, AU, CM, etc.)
  - Template-based fallbacks for offline/failed AI scenarios
  - Applied across all control templates in suggestion engine

#### Security Enhancements (OWASP Compliance)
- **DoS Prevention** 🛡️
  - Request size limits: Maximum 1000 controls per SAR/SSP generation
  - Metadata size limits: 100KB maximum
  - Prevents resource exhaustion attacks (OWASP API4:2023)

- **Security Audit Logging** 📊
  - Comprehensive logging for SAR/SSP generation
  - IP address tracking for security monitoring
  - Success/failure tracking with timestamps
  - Production-safe error handling (detailed logs in dev only)

- **OWASP Compliance**
  - Full compliance with OWASP Top 10 2025 (10/10 categories)
  - Full compliance with OWASP API Security Top 10 (10/10 categories)
  - Full compliance with OWASP GenAI Top 10 (10/10 categories)
  - Security review documentation included

### Documentation

#### New Documentation
- **User Guide** (`docs/USER_GUIDE.md`) 📖
  - Complete user documentation for all features
  - Assessment fields explanation with examples
  - Testing Objective vs Testing Method guidance
  - Export instructions and best practices
  - Role-based workflows

- **OSCAL SAR Guide** (`docs/OSCAL_SAR.md`) 📘
  - Comprehensive SAR generation documentation
  - NIST SP 800-53 field mapping tables
  - SAR vs SSP comparison and use cases
  - OSCAL document structure examples
  - Compliance requirements (FedRAMP, StateRAMP, FISMA)
  - Troubleshooting guide

- **OWASP Compliance Summary** (see `docs/SECURITY.md`) 🔒
  - Executive security compliance summary
  - Implementation highlights and evidence
  - Security testing checklist
  - Production deployment readiness

- **Security Implementation Review** (see `docs/SECURITY.md`) 🔐
  - Detailed OWASP compliance analysis (all 30 categories)
  - Security enhancements documentation
  - Testing recommendations
  - Action items and monitoring guidelines

#### Updated Documentation
- **README** - Added User Documentation and Security sections
- **Version bump** - All package.json files updated to 1.7.0

### Technical Details

#### Backend Changes
- **New Module**: `backend/sarGenerator.js`
  - Complete SAR document generation
  - OSCAL-compliant sanitization
  - UUID generation for tracking
  - Observations, findings, and reviewed-controls generation

- **New Endpoint**: `POST /api/generate-sar`
  - Security Assessment Results generation
  - Request validation and size limits
  - OSCAL schema validation support
  - Comprehensive error handling and logging

- **Enhanced Endpoints**: `POST /api/generate-ssp`
  - Added request size validation
  - Enhanced security logging
  - Production-safe error handling

- **Updated Modules**:
  - `ccmExport.js` - Added Testing Objective column
  - `ccmImport.js` - Import support for Testing Objective
  - `controlSuggestionEngine.js` - AI suggestions for objectives
  - `server.js` - Security enhancements and SAR endpoint

#### Frontend Changes
- **Updated Components**:
  - `ControlItemCCM.jsx` - Testing Objective field in Testing & Evidence tab
  - `ControlEditModal.jsx` - Testing Objective in modal editor
  - `ControlItem.jsx` - Testing Objective in non-CCM controls
  - `ControlSuggestions.jsx` - AI suggestion display for objectives
  - `ExportButtons.jsx` - New SAR export button
  - `App.jsx` - SAR export handler

### Security

#### OWASP Compliance
- ✅ OWASP Top 10 2025: All 10 categories compliant
- ✅ OWASP API Security Top 10: All 10 categories compliant
- ✅ OWASP GenAI Top 10: All 10 categories compliant

#### Security Features
- Role-Based Access Control (RBAC) for sensitive fields
- Input sanitization and validation
- Request size limits for DoS prevention
- Comprehensive security audit logging
- CSRF protection with Bearer token architecture
- Production-safe error handling
- Rate limiting (100 req/15min per IP)

### Testing

#### Test Coverage
- Input validation tests
- Authorization tests
- DoS prevention tests
- Data integrity tests
- OSCAL validation tests

### Migration Notes

#### For Existing Users
- **No Breaking Changes**: Fully backward compatible
- **Optional Field**: Testing Objective is optional, won't affect existing controls
- **Data Migration**: Not required, new field will be empty for existing controls
- **AI Suggestions**: Will include objectives for new suggestions

#### For Developers
- New field: `testingObjective` in control objects
- New export format: SAR (assessment-results.json)
- New API endpoint: `/api/generate-sar`
- Enhanced security logging in all generation endpoints

### Known Issues
- None

### Upgrade Instructions
1. Pull latest code from repository
2. Run `npm install` in root, backend, and frontend directories
3. Restart servers
4. No database migration needed (client-side storage)
5. Test SAR export functionality
6. Review security documentation

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

See `docs/SECURITY.md` for detailed analysis and testing plan.

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
- **Release Checklist** (see `docs/VERSION_AND_RELEASE.md`)
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
- **Security Documentation**: `docs/SECURITY.md` with detailed security analysis
- **Migration Guide**: `docs/CONFIG_AND_USER_MIGRATION.md` for configuration and user migration

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
  - `docs/SECURITY.md` - Added comprehensive security documentation

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
- **Documentation**: Created `docs/SECURITY.md` with detailed security analysis

### Testing

- ✅ Catalogue loading endpoint (`/api/fetch-catalogue`) - HTTP 200
- ✅ AI Integration endpoint (`/api/ai/test-connection`) - HTTP 200 with Bearer token
- ✅ Settings endpoints - HTTP 200
- ✅ User management endpoints - HTTP 200 with Bearer token
- ✅ Report generation endpoints - HTTP 200
- ✅ All protected endpoints properly require Bearer token authentication
- ✅ All public endpoints work without authentication

### References

- See `docs/SECURITY.md` for detailed security analysis and rationale
- See `backend/utils/securityConfig.js` for CSRF configuration and architectural comments

---

## Version History

### [1.6.5] - 2026-01-28
- CSRF protection refinement
- Double footer fix
- Security documentation update

---

**Note**: For detailed security information, see `docs/SECURITY.md`
