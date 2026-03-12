# 🎯 OSCAL Report Generator V2 - Quality Assurance Guide

**Version:** 1.3.0  
**Last Updated:** December 29, 2025  
**Maintainer:** Mukesh Kesharwani <mukesh.kesharwani@adobe.com>

---

## 📋 Document Purpose

This guide consolidates all quality assurance processes, checklists, and verification procedures for the OSCAL Report Generator V2 project.

---

## 📑 Table of Contents

1. [Development Checklists](#part-1-development-checklists)
2. [Verification Report Template](#part-2-verification-report-template)
3. [BSI Catalogue Integration Testing](#part-3-bsi-catalogue-integration-testing)

---

# ═══════════════════════════════════════════════════════════════════════
# PART 1: DEVELOPMENT CHECKLISTS
# ═══════════════════════════════════════════════════════════════════════

# Release & Quality Checklist

**Project:** OSCAL Report Generator V2  
**Purpose:** Ensure quality and consistency before releases and major changes

---

## 📋 Pre-Release Checklist

Use this checklist before creating a new release:

### Code Quality
- [ ] All tests pass (if tests exist)
- [ ] No linter errors or warnings
- [ ] No console.log or debug statements in production code
- [ ] All JavaScript files have valid syntax (`node -c`)
- [ ] Code follows project conventions (naming, structure, patterns)
- [ ] No commented-out code blocks
- [ ] No TODO comments left unresolved

### Documentation
- [ ] README.md is up to date
- [ ] ARCHITECTURE.md reflects current structure
- [ ] DEPLOYMENT.md has correct instructions
- [ ] All new features are documented
- [ ] API changes are documented
- [ ] Breaking changes clearly marked
- [ ] Migration guide provided (if needed)
- [ ] CHANGELOG.md updated with all changes

### Version Management
- [ ] Version numbers synchronized across all package.json files:
  - [ ] Root package.json
  - [ ] backend/package.json
  - [ ] frontend/package.json
- [ ] Version in build scripts updated (if applicable)
- [ ] Version in Docker labels updated
- [ ] credentials.txt generation uses correct version

### Testing
- [ ] Fresh install works (`./setup.sh install`)
- [ ] Upgrade from previous version works
- [ ] Docker build succeeds
- [ ] Docker container runs and health check passes
- [ ] All API endpoints respond correctly
- [ ] Frontend builds without errors (`npm run build`)
- [ ] Frontend loads and renders correctly
- [ ] Authentication system works
- [ ] RBAC permissions enforced correctly
- [ ] OSCAL export/validation works
- [ ] AI integration works (if configured)

### Security
- [ ] No hardcoded credentials in code
- [ ] No API keys or secrets in repository
- [ ] Environment variables properly documented
- [ ] Input validation on all endpoints
- [ ] Authentication required where needed
- [ ] FIPS 140-2 compliant hashing maintained
- [ ] No known security vulnerabilities

### Configuration
- [ ] config.json.example is up to date
- [ ] users.json.example is up to date
- [ ] Environment variables documented
- [ ] Default values are sensible
- [ ] Port configuration is correct (3020, 3021, 11434)

### Build & Deployment
- [ ] Docker build completes successfully
- [ ] Docker image size is reasonable (<500MB)
- [ ] Multi-stage build optimized
- [ ] Health checks work in container
- [ ] Docker Compose file works
- [ ] TrueNAS deployment file updated
- [ ] Deployment scripts tested

### Git & GitHub
- [ ] All changes committed
- [ ] Commit messages follow convention
- [ ] Branch merged to main/develop
- [ ] Git tag created (vX.Y.Z)
- [ ] GitHub release created
- [ ] Release notes published
- [ ] Assets uploaded (if applicable)

---

## 🔍 Pre-Commit Checklist

Quick checklist before each commit:

### Basic Checks
- [ ] Code follows naming conventions
- [ ] No syntax errors
- [ ] Functions have JSDoc comments (for new/modified functions)
- [ ] Complex logic has explanatory comments
- [ ] No hardcoded values (use constants/config)

### Testing
- [ ] Tested locally (`npm run dev`)
- [ ] No console errors in browser
- [ ] No server errors in terminal
- [ ] Basic functionality works

### Documentation
- [ ] Updated inline comments if needed
- [ ] Updated README if user-facing changes
- [ ] Commit message is descriptive

---

## 🐛 Bug Fix Checklist

When fixing bugs:

### Investigation
- [ ] Bug is reproducible
- [ ] Root cause identified
- [ ] Impact assessed
- [ ] Related issues searched

### Fix Implementation
- [ ] Fix addresses root cause (not symptom)
- [ ] Fix doesn't break existing functionality
- [ ] Error handling improved (if applicable)
- [ ] Logging added for debugging (if applicable)

### Verification
- [ ] Bug no longer occurs
- [ ] Edge cases tested
- [ ] Regression testing performed
- [ ] Documentation updated (if needed)

### Communication
- [ ] Issue updated with fix details
- [ ] Breaking changes communicated
- [ ] Workarounds documented (if needed)

---

## ✨ Feature Addition Checklist

When adding new features:

### Planning
- [ ] Feature requirements clear
- [ ] Design approach decided
- [ ] Breaking changes identified
- [ ] Dependencies identified

### Implementation
- [ ] Code follows existing patterns
- [ ] Proper error handling added
- [ ] Input validation implemented
- [ ] Security considerations addressed
- [ ] Performance impact considered
- [ ] Logging added for important events

### Integration
- [ ] Works with existing features
- [ ] Doesn't break existing functionality
- [ ] Configuration options added (if needed)
- [ ] API endpoints follow RESTful conventions
- [ ] Authentication/authorization proper

### Documentation
- [ ] Feature documented in README
- [ ] API documentation updated
- [ ] Configuration examples provided
- [ ] Screenshots/examples included

### Testing
- [ ] Happy path tested
- [ ] Error paths tested
- [ ] Edge cases tested
- [ ] Integration testing performed

---

## 🔄 Refactoring Checklist

When refactoring code:

### Planning
- [ ] Refactoring scope defined
- [ ] Benefits clearly identified
- [ ] Risks assessed
- [ ] Backward compatibility considered

### Execution
- [ ] Tests pass before refactoring (if exists)
- [ ] Refactoring done incrementally
- [ ] No functional changes mixed with refactoring
- [ ] Tests still pass after refactoring

### Verification
- [ ] All functionality works as before
- [ ] No new bugs introduced
- [ ] Performance not degraded
- [ ] Code is more maintainable

### Documentation
- [ ] Comments updated
- [ ] Documentation reflects new structure
- [ ] ARCHITECTURE.md updated (if significant)

---

## 📦 Dependency Update Checklist

When updating dependencies:

### Preparation
- [ ] Change log reviewed
- [ ] Breaking changes identified
- [ ] Security advisories checked
- [ ] Compatibility verified

### Update
- [ ] Updated in package.json
- [ ] npm install/update run
- [ ] Lock files updated
- [ ] Peer dependencies checked

### Testing
- [ ] Application builds successfully
- [ ] All features work
- [ ] No console warnings
- [ ] Docker build successful

### Documentation
- [ ] Breaking changes documented
- [ ] Migration steps provided (if needed)
- [ ] Minimum versions updated in docs

---

## 🚀 Deployment Checklist

Before deploying to production:

### Pre-Deployment
- [ ] All above checklists completed
- [ ] Backup of current production created
- [ ] Rollback plan prepared
- [ ] Deployment window scheduled
- [ ] Stakeholders notified

### Deployment
- [ ] Build artifacts created
- [ ] Docker image built and tested
- [ ] Configuration files prepared
- [ ] Environment variables set
- [ ] Database migrations run (if applicable)

### Post-Deployment
- [ ] Application starts successfully
- [ ] Health checks passing
- [ ] All endpoints responding
- [ ] Logs monitored for errors
- [ ] User acceptance testing
- [ ] Performance monitoring

### Documentation
- [ ] Deployment logged
- [ ] Issues documented
- [ ] Lessons learned captured

---

## 📊 Verification Commands

Quick commands to verify quality:

```bash
# Check JavaScript syntax
find . -name "*.js" -not -path "*/node_modules/*" -exec node -c {} \;

# Check for console.log
grep -r "console.log" --include="*.js" --include="*.jsx" --exclude-dir=node_modules .

# Check for hardcoded credentials
grep -rE "(password|api_key|secret|token)\s*=\s*['\"]" --include="*.js" --include="*.jsx" --exclude-dir=node_modules .

# Verify Docker build
docker build -t oscal-report-generator:test .

# Verify setup script
./setup.sh verify

# Run debug diagnostics
./setup.sh debug
```

---

## 🎓 Tips for Success

1. **Use the checklist proactively** - Don't wait until the end
2. **Check off items as you go** - Track progress
3. **Don't skip items** - Each has a purpose
4. **Ask for help** - If unsure about any item
5. **Update this checklist** - If new quality gates are identified

---

**Last Updated:** December 25, 2025  
**Version:** 1.0.0  
**Maintainer:** Mukesh Kesharwani



# ═══════════════════════════════════════════════════════════════════════
# PART 2: VERIFICATION REPORT TEMPLATE
# ═══════════════════════════════════════════════════════════════════════

> **Usage:** Copy this template for each release verification.
> Example: `cp docs/QUALITY_ASSURANCE.md docs/VERIFICATION_REPORT_v1.3.0.md`


# 🔍 Verification Report Template

**Project:** OSCAL Report Generator V2  
**Report Date:** YYYY-MM-DD  
**Verified By:** [Your Name]  
**Verification Type:** [Pre-Release / Post-Deployment / Post-Update]

---

## 📋 Executive Summary

**Release Version:** [e.g., 1.3.0]  
**Previous Version:** [e.g., 1.2.7]  
**Verification Status:** ✅ PASSED / ⚠️ PASSED WITH ISSUES / ❌ FAILED  

**Summary:**
Brief 2-3 sentence summary of verification outcome.

---

## ✅ Version Information

Verify version consistency across all package.json files:

- [ ] **Root package.json:** `____________` ✅ / ❌
- [ ] **Backend package.json:** `____________` ✅ / ❌
- [ ] **Frontend package.json:** `____________` ✅ / ❌
- [ ] **Footer displays correct version:** `____________` ✅ / ❌
- [ ] **CHANGELOG.md updated:** ✅ / ❌

**Status:** ✅ PASS / ❌ FAIL  
**Notes:**

---

## 🏗️ Build Verification

Verify that the application builds successfully:

- [ ] **Backend builds without errors:** ✅ / ❌
- [ ] **Frontend builds without errors:** ✅ / ❌
- [ ] **No TypeScript/ESLint errors:** ✅ / ❌
- [ ] **Docker image builds successfully:** ✅ / ❌
- [ ] **Build output size reasonable:** ✅ / ❌

**Backend Build Command:**
```bash
cd backend && npm install && npm run build
```

**Frontend Build Command:**
```bash
cd frontend && npm install && npm run build
```

**Status:** ✅ PASS / ❌ FAIL  
**Notes:**

---

## 🚀 Deployment Verification

Verify deployment process:

- [ ] **Setup script runs without errors:** `./setup.sh install` ✅ / ❌
- [ ] **Services start successfully:** ✅ / ❌
- [ ] **Health check endpoint responds:** `GET /health` ✅ / ❌
- [ ] **Backend accessible on correct port:** ✅ / ❌
- [ ] **Frontend accessible and loads:** ✅ / ❌

**Health Check Response:**
```json
{
  "status": "healthy",
  "version": "x.y.z",
  ...
}
```

**Status:** ✅ PASS / ❌ FAIL  
**Notes:**

---

## 🧪 Feature Testing

### Core Features

#### 1. Authentication & RBAC
- [ ] **User login works:** ✅ / ❌
- [ ] **Session management functional:** ✅ / ❌
- [ ] **Role-based access control enforced:** ✅ / ❌
- [ ] **Admin can manage users:** ✅ / ❌
- [ ] **Password hashing secure (PBKDF2):** ✅ / ❌

**Test Users:**
- Admin: `admin` / `[password]`
- Viewer: `viewer` / `[password]`

**Status:** ✅ PASS / ❌ FAIL  
**Notes:**

---

#### 2. OSCAL Catalog Fetching
- [ ] **Fetch NIST SP 800-53 Rev 5:** ✅ / ❌
- [ ] **Fetch NIST SP 800-53 Rev 4:** ✅ / ❌
- [ ] **Fetch NIST CSF:** ✅ / ❌
- [ ] **Catalog parsing correct:** ✅ / ❌
- [ ] **Controls display properly:** ✅ / ❌

**Test Endpoint:** `POST /api/fetch-catalog`

**Status:** ✅ PASS / ❌ FAIL  
**Notes:**

---

#### 3. SSP Generation
- [ ] **Generate SSP from controls:** ✅ / ❌
- [ ] **Metadata preserved correctly:** ✅ / ❌
- [ ] **Control implementation included:** ✅ / ❌
- [ ] **System information correct:** ✅ / ❌
- [ ] **JSON output valid OSCAL:** ✅ / ❌

**Test Endpoint:** `POST /api/generate-ssp`

**Status:** ✅ PASS / ❌ FAIL  
**Notes:**

---

#### 4. AI Integration
- [ ] **Mistral API configured:** ✅ / ❌ / N/A
- [ ] **Ollama configured:** ✅ / ❌ / N/A
- [ ] **AWS Bedrock configured:** ✅ / ❌ / N/A
- [ ] **AI suggestions generated:** ✅ / ❌
- [ ] **AI telemetry logged (JSONL):** ✅ / ❌
- [ ] **Context-rich logs with ECS fields:** ✅ / ❌

**Test Endpoint:** `POST /api/suggest-control`

**Status:** ✅ PASS / ❌ FAIL  
**Notes:**

---

#### 5. Export Functionality

##### Synchronous Exports (Legacy)
- [ ] **PDF export works:** `POST /api/generate-pdf` ✅ / ❌
- [ ] **Excel export works:** `POST /api/generate-excel` ✅ / ❌
- [ ] **CCM export works:** `POST /api/generate-ccm` ✅ / ❌

##### Asynchronous Exports (Job Queue)
- [ ] **Create PDF job:** `POST /api/jobs/pdf` ✅ / ❌
- [ ] **Create Excel job:** `POST /api/jobs/excel` ✅ / ❌
- [ ] **Create CCM job:** `POST /api/jobs/ccm` ✅ / ❌
- [ ] **Job status endpoint:** `GET /api/jobs/:jobId` ✅ / ❌
- [ ] **Job download endpoint:** `GET /api/jobs/:jobId/download` ✅ / ❌
- [ ] **Job listing works:** `GET /api/jobs` ✅ / ❌
- [ ] **Job cleanup works:** `POST /api/jobs/cleanup` ✅ / ❌

**Status:** ✅ PASS / ❌ FAIL  
**Notes:**

---

#### 6. OSCAL Validation
- [ ] **Validator status check:** `GET /api/validator/status` ✅ / ❌
- [ ] **Validate SSP:** `POST /api/validate` ✅ / ❌
- [ ] **Docker-based validation (if available):** ✅ / ❌ / N/A
- [ ] **Validation errors reported correctly:** ✅ / ❌

**Status:** ✅ PASS / ❌ FAIL  
**Notes:**

---

#### 7. CCM Import
- [ ] **Import CCM Excel file:** `POST /api/import-ccm` ✅ / ❌
- [ ] **Parse controls correctly:** ✅ / ❌
- [ ] **Map to OSCAL structure:** ✅ / ❌

**Status:** ✅ PASS / ❌ FAIL  
**Notes:**

---

#### 8. SSP Comparison
- [ ] **Upload existing SSP:** ✅ / ❌
- [ ] **Extract controls from SSP:** ✅ / ❌
- [ ] **Compare controls:** ✅ / ❌
- [ ] **Highlight differences:** ✅ / ❌

**Status:** ✅ PASS / ❌ FAIL  
**Notes:**

---

## 🔒 Security Verification

- [ ] **HTTPS configured (production):** ✅ / ❌ / N/A
- [ ] **Authentication required for protected endpoints:** ✅ / ❌
- [ ] **RBAC enforced correctly:** ✅ / ❌
- [ ] **No sensitive data in logs:** ✅ / ❌
- [ ] **API keys/secrets not exposed:** ✅ / ❌
- [ ] **CORS configured properly:** ✅ / ❌
- [ ] **SQL injection prevention (N/A - no SQL):** ✅ / ❌ / N/A
- [ ] **XSS prevention in frontend:** ✅ / ❌

**Status:** ✅ PASS / ❌ FAIL  
**Notes:**

---

## 🎨 UI/UX Verification

- [ ] **Frontend loads without console errors:** ✅ / ❌
- [ ] **All pages accessible:** ✅ / ❌
- [ ] **Navigation works correctly:** ✅ / ❌
- [ ] **Forms submit properly:** ✅ / ❌
- [ ] **Error messages display correctly:** ✅ / ❌
- [ ] **Loading indicators work:** ✅ / ❌
- [ ] **Responsive design (mobile/tablet):** ✅ / ❌
- [ ] **Dark mode works (if implemented):** ✅ / ❌ / N/A
- [ ] **Footer displays version and links:** ✅ / ❌

**Browser Testing:**
- [ ] Chrome ✅ / ❌
- [ ] Firefox ✅ / ❌
- [ ] Safari ✅ / ❌
- [ ] Edge ✅ / ❌

**Status:** ✅ PASS / ❌ FAIL  
**Notes:**

---

## 📊 Performance Verification

- [ ] **Backend startup time < 10s:** ✅ / ❌
- [ ] **Frontend initial load < 5s:** ✅ / ❌
- [ ] **API response times reasonable:** ✅ / ❌
- [ ] **No memory leaks observed:** ✅ / ❌
- [ ] **Large exports don't timeout:** ✅ / ❌
- [ ] **Job queue handles concurrent requests:** ✅ / ❌

**Performance Metrics:**
- Backend startup: `______ seconds`
- Frontend load: `______ seconds`
- Average API response: `______ ms`
- PDF generation (100 controls): `______ seconds`

**Status:** ✅ PASS / ❌ FAIL  
**Notes:**

---

## 📝 Documentation Verification

- [ ] **README.md up to date:** ✅ / ❌
- [ ] **ARCHITECTURE.md reflects current state:** ✅ / ❌
- [ ] **DEPLOYMENT.md has correct instructions:** ✅ / ❌
- [ ] **CONFIGURATION.md complete:** ✅ / ❌
- [ ] **CHANGELOG.md updated for this release:** ✅ / ❌
- [ ] **API endpoints documented:** ✅ / ❌
- [ ] **Code comments adequate:** ✅ / ❌
- [ ] **CONTRIBUTING.md exists:** ✅ / ❌

**Status:** ✅ PASS / ❌ FAIL  
**Notes:**

---

## 🐛 Known Issues

List any known issues discovered during verification:

### Issue 1: [Title]
**Severity:** 🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low  
**Description:**  
**Workaround:**  
**Fix Status:** ✅ Fixed / 🔄 In Progress / 📋 Planned

### Issue 2: [Title]
...

---

## 🔄 Regression Testing

Verify that previous functionality still works:

- [ ] **Previous release features working:** ✅ / ❌
- [ ] **No breaking changes introduced:** ✅ / ❌
- [ ] **Existing data/configs compatible:** ✅ / ❌
- [ ] **Migrations successful (if any):** ✅ / ❌ / N/A

**Status:** ✅ PASS / ❌ FAIL  
**Notes:**

---

## 📦 Dependency Verification

- [ ] **No critical security vulnerabilities:** `npm audit` ✅ / ❌
- [ ] **Dependencies up to date:** ✅ / ❌
- [ ] **License compliance:** ✅ / ❌

**NPM Audit Results:**
```
Vulnerabilities:
- Critical: ___
- High: ___
- Medium: ___
- Low: ___
```

**Status:** ✅ PASS / ❌ FAIL  
**Notes:**

---

## 🎯 New Features (This Release)

List and verify new features added in this release:

### Feature 1: [Feature Name]
- [ ] **Implemented as designed:** ✅ / ❌
- [ ] **Tested manually:** ✅ / ❌
- [ ] **Documented:** ✅ / ❌
- [ ] **No side effects:** ✅ / ❌

**Status:** ✅ PASS / ❌ FAIL  
**Notes:**

### Feature 2: [Feature Name]
...

---

## ✅ Final Verification Checklist

Before marking release as verified:

- [ ] **All critical tests passed:** ✅ / ❌
- [ ] **No critical issues remaining:** ✅ / ❌
- [ ] **Documentation complete:** ✅ / ❌
- [ ] **Version bumped correctly:** ✅ / ❌
- [ ] **CHANGELOG updated:** ✅ / ❌
- [ ] **Git commit created:** ✅ / ❌
- [ ] **Git tag created:** ✅ / ❌
- [ ] **Deployment tested:** ✅ / ❌

---

## 📊 Verification Summary

**Total Tests:** _______  
**Passed:** _______ (___%)  
**Failed:** _______  
**Skipped/N/A:** _______

**Overall Status:** ✅ PASSED / ⚠️ PASSED WITH ISSUES / ❌ FAILED

**Recommendation:**
- ✅ **APPROVED FOR RELEASE** - All critical tests passed
- ⚠️ **CONDITIONAL APPROVAL** - Minor issues, acceptable with documented workarounds
- ❌ **NOT APPROVED** - Critical issues must be resolved before release

---

## 📝 Verifier Sign-Off

**Verified By:** [Name]  
**Role:** [Developer / QA / Admin]  
**Date:** YYYY-MM-DD  
**Signature:** _________________________

---

## 📎 Attachments

- [ ] Screenshots of key features
- [ ] Performance test results
- [ ] Security scan reports
- [ ] Browser compatibility matrix
- [ ] Other: _______________

---

**Document Version:** 1.0  
**Last Updated:** 2025-12-29  
**Template Maintained By:** Mukesh Kesharwani



---

# 📊 Document Consolidation Summary

This document consolidates the following QA files (as of December 29, 2025):

| Source File | Lines | Content |
|-------------|-------|---------|
| CHECKLIST.md | varies | Development and release checklists |
| VERIFICATION_REPORT_TEMPLATE.md | 397 | Comprehensive verification template |

**Consolidated Into:** QUALITY_ASSURANCE.md

---

---

# ═══════════════════════════════════════════════════════════════════════
# PART 3: BSI CATALOGUE INTEGRATION TESTING
# ═══════════════════════════════════════════════════════════════════════

> **Purpose:** Testing procedures for BSI Grundschutz++ catalogue integration (German IT security standards).  
> **Reference:** Integration details in [BSI_CATALOGUE_INTEGRATION.md](BSI_CATALOGUE_INTEGRATION.md).

---

## BSI Testing Objectives

- Verify BSI catalogue fetching and parsing
- Validate OSCAL format compatibility
- Test control display and German character (UTF-8) rendering
- Validate SSP generation with BSI controls
- Test all export formats (OSCAL JSON, Excel, PDF, CCM)
- Verify AI suggestions work with German controls
- Ensure backward compatibility with existing catalogues (NIST, ISM, CCCS, IM8)

---

## BSI Pre-Testing Checklist

- [ ] `frontend/src/components/CatalogueInput.jsx` – BSI catalogue in `SAMPLE_CATALOGUES`
- [ ] BSI catalogue URL correct: `https://raw.githubusercontent.com/BSI-Bund/Stand-der-Technik-Bibliothek/main/Anwenderkataloge/Grundschutz++/Grundschutz++-catalog.json`
- [ ] Node.js v20+, npm, browser (Chrome/Firefox/Safari), internet for fetch
- [ ] Optional: Ollama + Mistral 7B for AI suggestion testing

---

## BSI Test Scenarios Summary

| # | Test | Key checks |
|---|------|------------|
| 1 | Catalogue selection and loading | "BSI Grundschutz++ (Kompendium) 🇩🇪" in dropdown; loads without errors; controls displayed; German titles visible |
| 2 | OSCAL format validation | `POST /api/fetch-catalogue` returns 200; `catalogue`, `controls`, `metadata`; control IDs like `APP.1.1.A1`, `SYS.2.1.A5` |
| 3 | German character rendering | ä, ö, ü, ß, Ä, Ö, Ü display correctly; no; search/filter with German keywords |
| 4 | Control implementation | System info + control details accept German/English; umlauts save; data persists |
| 5 | AI suggestions (Mistral 7B) | Suggestions relevant; German context understood; fallback if AI unavailable |
| 6 | Export OSCAL JSON | Valid structure; German text preserved (UTF-8); BSI control IDs |
| 7 | Export Excel (CCM) | German umlauts in cells; control IDs and titles correct; no encoding issues |
| 8 | Export PDF | German characters in PDF; UTF-8 fonts; no boxes or ? |
| 9 | Load existing SSP with BSI | Upload BSI SSP; update catalogue; implementations preserved |
| 10 | Cross-catalogue compatibility | NIST, Australian ISM, Canadian CCCS, Singapore IM8 still load and export |

---

## BSI Expected Results

- BSI catalogue in dropdown with 🇩🇪; fetch/parse no errors
- German characters correct in UI, JSON, Excel, PDF
- All export formats support BSI controls; no regression on other catalogues
- **Performance (guidance):** Catalogue load &lt; 5s; OSCAL export &lt; 2s (50 controls); Excel &lt; 3s; PDF &lt; 5s; AI suggestion &lt; 10s per control (Ollama)

---

## BSI Troubleshooting

| Issue | What to check |
|-------|----------------|
| Catalogue won't load | URL in `CatalogueInput.jsx`; `curl` the BSI URL (expect 200); backend logs; URL validator allows GitHub |
| German characters show as or boxes | Browser UTF-8; `Content-Type: application/json; charset=utf-8`; `<meta charset="UTF-8">` in index.html |
| AI suggestions not working | Ollama running (`curl localhost:11434/api/tags`); Mistral 7B pulled; config `mistralConfig.enabled`; `/api/mistral/status` |
| Export failures | File size/timeout; UTF-8 in export modules; try different browser |

---

## BSI Test Report Template

**Date:** YYYY-MM-DD | **Tester:** [Name] | **Version:** e.g. 1.7.0-rc1 | **Environment:** Dev / Staging / Prod

| Test | Status | Notes |
|------|--------|-------|
| 1. Catalogue selection | ✅ / ❌ | |
| 2. OSCAL validation | ✅ / ❌ | |
| 3. German character rendering | ✅ / ❌ | |
| 4. Control implementation | ✅ / ❌ | |
| 5. AI suggestions | ✅ / ❌ | |
| 6. OSCAL JSON export | ✅ / ❌ | |
| 7. Excel export | ✅ / ❌ | |
| 8. PDF export | ✅ / ❌ | |
| 9. Load existing SSP | ✅ / ❌ | |
| 10. Cross-catalogue compatibility | ✅ / ❌ | |

**Overall:** ✅ All pass / ⚠️ Partial / ❌ Failed  
**Recommendation:** Ready for release / Minor fixes / Major issues

---

**Document Version:** 1.3.0  
**Last Updated:** December 29, 2025  
**Maintainer:** Mukesh Kesharwani <mukesh.kesharwani@adobe.com>


