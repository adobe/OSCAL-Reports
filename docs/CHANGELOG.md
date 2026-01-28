# Changelog

All notable changes to the OSCAL Report Generator project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
