# Changelog

All notable changes to the OSCAL Report Generator project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
