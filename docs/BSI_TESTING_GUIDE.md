# BSI Catalogue Integration - Testing Guide

**Author**: Mukesh Kesharwani (mukesh.kesharwani@adobe.com)  
**Organization**: Adobe  
**Version**: 1.0.0  
**Date**: February 2026  
**Purpose**: Comprehensive testing guide for BSI Grundschutz++ integration

---

## Table of Contents

1. [Overview](#overview)
2. [Pre-Testing Checklist](#pre-testing-checklist)
3. [Test Environment Setup](#test-environment-setup)
4. [Test Scenarios](#test-scenarios)
5. [Expected Results](#expected-results)
6. [Troubleshooting](#troubleshooting)
7. [Test Report Template](#test-report-template)

---

## Overview

This guide provides step-by-step testing procedures for the BSI Grundschutz++ catalogue integration. Testing validates that German security standards work seamlessly with the existing OSCAL Report Generator infrastructure.

### Testing Objectives

- ✅ Verify BSI catalogue fetching and parsing
- ✅ Validate OSCAL format compatibility
- ✅ Test control display and German character rendering
- ✅ Validate SSP generation with BSI controls
- ✅ Test all export formats (OSCAL JSON, Excel, PDF, CCM)
- ✅ Verify AI suggestions work with German controls
- ✅ Ensure backward compatibility with existing catalogues

---

## Pre-Testing Checklist

### Code Changes Verification

Ensure the following files have been updated:

- [ ] `frontend/src/components/CatalogueInput.jsx` - BSI catalogue added to `SAMPLE_CATALOGUES`
- [ ] `docs/BSI_CATALOGUE_INTEGRATION.md` - Integration documentation created
- [ ] `docs/README.md` - Documentation index updated
- [ ] `docs/ARCHITECTURE.md` - BSI support documented
- [ ] `docs/CHANGELOG.md` - Version 1.7.0 planned features added

### BSI Catalogue URL

**Primary Catalogue**:
```
https://raw.githubusercontent.com/BSI-Bund/Stand-der-Technik-Bibliothek/main/Anwenderkataloge/Grundschutz++/Grundschutz++-catalog.json
```

### System Requirements

- **Node.js**: v20 or higher
- **npm**: Latest version
- **Browser**: Chrome, Firefox, or Safari (latest)
- **Internet**: Required for catalogue fetching
- **Ollama** (optional): For AI suggestions testing

---

## Test Environment Setup

### 1. Start Development Environment

```bash
# Navigate to project root
cd /Users/mkesharw/Documents/OSCAL_Reports

# Install dependencies (if not already done)
npm install
cd frontend && npm install && cd ..
cd backend && npm install && cd ..

# Start development servers
npm run dev
```

**Expected Output**:
```
Backend server running on http://localhost:3020
Frontend dev server running on http://localhost:3021
```

### 2. Verify Services

```bash
# Check backend health
curl http://localhost:3020/health

# Expected: {"status":"ok"}

# Check frontend is accessible
curl -I http://localhost:3021

# Expected: HTTP/1.1 200 OK
```

### 3. Optional: Start Ollama (for AI testing)

```bash
# If using Ollama for AI suggestions
docker run -d -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama
docker exec -it ollama ollama pull mistral:7b

# Verify Ollama
curl http://localhost:11434/api/tags
```

---

## Test Scenarios

### Test 1: Catalogue Selection and Loading

**Objective**: Verify BSI catalogue appears in dropdown and loads successfully

**Steps**:

1. Open browser to `http://localhost:3021`
2. Start new report
3. Look for catalogue selection dropdown
4. Verify "BSI Grundschutz++ (Kompendium) 🇩🇪" is listed
5. Select the BSI catalogue
6. Click "Load Catalogue" (or it auto-loads)
7. Wait for loading to complete

**Expected Results**:

- ✅ BSI catalogue appears with 🇩🇪 flag indicator
- ✅ Loading spinner appears
- ✅ Catalogue loads without errors
- ✅ Controls are displayed in list view
- ✅ German control titles visible (e.g., "Festlegung einer Sicherheitsrichtlinie...")
- ✅ Control counts displayed (total controls, groups, etc.)

**Success Criteria**:
- No console errors
- Controls render properly
- German characters (ä, ö, ü, ß) display correctly

**Screenshot**: Capture catalogue selection screen

---

### Test 2: OSCAL Format Validation

**Objective**: Verify BSI catalogue passes OSCAL validation

**Steps**:

1. Open browser console (F12)
2. Navigate to Network tab
3. Load BSI catalogue (as in Test 1)
4. Find the `/api/fetch-catalogue` request
5. Check response status and body
6. Look for validation messages in console

**Expected Results**:

- ✅ HTTP 200 OK status
- ✅ Response contains `catalogue`, `controls`, `metadata` fields
- ✅ No OSCAL validation errors in console
- ✅ Controls array populated with German controls
- ✅ Control IDs follow BSI format (e.g., `APP.1.1.A1`, `SYS.2.1.A5`)

**Manual Validation**:

```bash
# Fetch catalogue directly
curl -X POST http://localhost:3020/api/fetch-catalogue \
  -H "Content-Type: application/json" \
  -d '{"url":"https://raw.githubusercontent.com/BSI-Bund/Stand-der-Technik-Bibliothek/main/Anwenderkataloge/Grundschutz++/Grundschutz++-catalog.json"}' \
  | jq '.controls | length'

# Expected: Number of controls (e.g., 150+)
```

**Success Criteria**:
- Valid OSCAL structure
- Controls extracted successfully
- No parsing errors

---

### Test 3: Control Display and German Character Rendering

**Objective**: Verify German controls display correctly with proper UTF-8 encoding

**Steps**:

1. Load BSI catalogue
2. Browse through control list
3. Expand 3-5 different controls
4. Check control titles, descriptions, and guidance
5. Test search functionality with German keywords
6. Test filtering by status, family, etc.

**Test German Characters**:

Look for controls containing:
- **ä** (lowercase a-umlaut): "Sicherheitsrichtlinie"
- **ö** (lowercase o-umlaut): "Schöpfung"
- **ü** (lowercase u-umlaut): "Prüfung"
- **ß** (eszett): "Maßnahme"
- **Ä, Ö, Ü** (uppercase umlauts)

**Expected Results**:

- ✅ All German characters render correctly
- ✅ No � (replacement character) or garbled text
- ✅ Control titles fully visible
- ✅ Search works with German keywords
- ✅ Filtering functions properly

**Success Criteria**:
- Perfect UTF-8 rendering
- No character encoding issues
- Search and filter work

**Screenshot**: Capture expanded control with German text

---

### Test 4: Control Implementation (System Info + Control Details)

**Objective**: Test filling in system information and control implementations

**Steps**:

1. Load BSI catalogue
2. Fill in System Information form:
   - System Name: "Test BSI Integration"
   - System Description: "Testing German Grundschutz++ controls"
   - Organization: "Adobe Test Lab"
3. Select 3-5 controls to document
4. For each control, add:
   - Status: "Implemented"
   - Implementation Description: Test with both English and German text
   - Responsible Party: "IT Security Team"
   - Implementation Date: Current date
5. Save progress

**Test Bilingual Implementation**:

Try both:
- **English**: "The organization has implemented a web application security policy..."
- **German**: "Die Organisation hat eine Sicherheitsrichtlinie für Webanwendungen implementiert..."
- **Mixed**: English description with German technical terms

**Expected Results**:

- ✅ System info form accepts input
- ✅ Control fields accept German and English text
- ✅ German umlauts save correctly
- ✅ Data persists in localStorage
- ✅ No validation errors

**Success Criteria**:
- All fields accept bilingual input
- Data saves without corruption
- German characters preserved

---

### Test 5: AI Suggestions (Mistral 7B)

**Objective**: Test AI-powered suggestions for German controls

**Prerequisites**: Ollama running with Mistral 7B model

**Steps**:

1. Load BSI catalogue
2. Expand a control
3. Click "🤖 Get Suggestions" button
4. Review AI-generated suggestions
5. Test with 3 different control types:
   - Access Control (APP.*)
   - Network Security (NET.*)
   - System Integrity (SYS.*)

**Expected Results**:

- ✅ AI suggestions appear within 10 seconds
- ✅ Implementation text is relevant and professional
- ✅ AI understands German control context
- ✅ Suggestions include technical security terminology
- ✅ Confidence score displayed (0.7-0.9 typical)
- ✅ Fallback to pattern matching if AI unavailable

**Test AI Status**:

```bash
# Check AI availability
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3020/api/mistral/status

# Expected: {"available":true,"provider":"ollama","model":"mistral:7b"}
```

**Success Criteria**:
- AI provides relevant suggestions
- Handles German controls appropriately
- Graceful fallback if AI unavailable

---

### Test 6: Export to OSCAL JSON

**Objective**: Generate and validate OSCAL SSP with BSI controls

**Steps**:

1. Complete system info and document 5+ controls
2. Click "Export as OSCAL JSON"
3. Save the exported file as `test-bsi-ssp.json`
4. Open file in text editor
5. Validate structure

**Validation Checks**:

```bash
# Check JSON structure
cat test-bsi-ssp.json | jq '.["system-security-plan"]' > /dev/null
echo "JSON Valid: $?"

# Check for BSI controls
cat test-bsi-ssp.json | jq '.["system-security-plan"]["control-implementation"]["implemented-requirements"] | length'

# Check German text preservation
cat test-bsi-ssp.json | jq '.["system-security-plan"]["control-implementation"]["implemented-requirements"][0].statements[0].description' | grep -E '[äöüßÄÖÜ]'
```

**Expected Results**:

- ✅ Valid OSCAL JSON structure
- ✅ German characters preserved (UTF-8)
- ✅ Control IDs match BSI format
- ✅ Implementation descriptions included
- ✅ Metadata populated correctly
- ✅ File size reasonable (not corrupted)

**Success Criteria**:
- OSCAL validates against schema
- German text intact
- All data present

**File**: Save as `sample_output/test-bsi-ssp.json`

---

### Test 7: Export to Excel (CCM)

**Objective**: Export BSI controls to Excel format

**Steps**:

1. With BSI controls documented, click "Export as Excel"
2. Save file as `test-bsi-ccm.xlsx`
3. Open in Excel or LibreOffice
4. Review sheets and formatting

**Validation Checks**:

- **System Info Sheet**:
  - ✅ All metadata fields populated
  - ✅ German characters render correctly
  
- **Controls Sheet**:
  - ✅ All controls listed
  - ✅ Control IDs correct (BSI format)
  - ✅ German control titles display properly
  - ✅ Implementation descriptions readable
  - ✅ Status, responsible party, dates included
  - ✅ Column formatting appropriate

**Expected Results**:

- ✅ Excel file opens without errors
- ✅ German umlauts display correctly (ä→ä, not ä)
- ✅ Cell widths accommodate German text
- ✅ No encoding issues (Unicode/UTF-8)
- ✅ All data rows present

**Success Criteria**:
- Excel renders German text perfectly
- No truncation or corruption
- Professional formatting

**Screenshot**: Capture Excel with German controls

**File**: Save as `sample_output/test-bsi-ccm.xlsx`

---

### Test 8: Export to PDF

**Objective**: Generate PDF report with BSI controls

**Steps**:

1. With BSI controls documented, click "Export as PDF"
2. Save file as `test-bsi-report.pdf`
3. Open in PDF reader
4. Review document formatting

**Validation Checks**:

- **Cover Page**:
  - ✅ System name and description
  - ✅ Organization name
  - ✅ Date and version
  
- **System Information Section**:
  - ✅ All metadata displayed
  - ✅ German text (if any) renders correctly
  
- **Controls Section**:
  - ✅ Controls organized clearly
  - ✅ Control IDs and titles visible
  - ✅ German control titles render with proper fonts
  - ✅ Umlauts display correctly (ä, ö, ü, ß)
  - ✅ Implementation descriptions formatted
  - ✅ Page breaks appropriate
  - ✅ Headers/footers consistent

**Expected Results**:

- ✅ PDF opens without errors
- ✅ German characters render correctly (not as boxes/?)
- ✅ Font supports UTF-8 (umlauts visible)
- ✅ Professional document formatting
- ✅ All sections included
- ✅ No text overlap or cutoff

**Success Criteria**:
- PDF is readable and professional
- German text renders perfectly
- No font or encoding issues

**Screenshot**: Capture PDF pages with German text

**File**: Save as `sample_output/test-bsi-report.pdf`

---

### Test 9: Load Existing SSP with BSI Catalogue

**Objective**: Test updating BSI catalogue in existing SSP

**Steps**:

1. Start with "Load Existing Report"
2. Upload the `test-bsi-ssp.json` from Test 6
3. Choose "Update to Latest" catalogue
4. Select BSI catalogue again
5. Verify data preservation

**Expected Results**:

- ✅ Existing control implementations preserved
- ✅ New controls marked appropriately
- ✅ German text intact
- ✅ No data loss during update

**Success Criteria**:
- Data migration successful
- German characters preserved
- Existing implementations intact

---

### Test 10: Cross-Catalogue Compatibility

**Objective**: Ensure BSI integration doesn't break existing catalogues

**Steps**:

1. Test loading NIST SP 800-53
2. Test loading Australian ISM
3. Test loading Canadian CCCS
4. Test loading Singapore IM8
5. Verify all still work correctly

**Expected Results**:

- ✅ All existing catalogues load successfully
- ✅ No regression in functionality
- ✅ Export formats work for all catalogues

**Success Criteria**:
- Backward compatibility confirmed
- No breaking changes introduced
- All catalogues functional

---

## Expected Results Summary

### Successful Integration Indicators

- ✅ BSI catalogue appears in dropdown with 🇩🇪 flag
- ✅ Catalogue fetches and parses without errors
- ✅ German characters render correctly throughout UI
- ✅ Controls display with proper BSI control IDs
- ✅ System info and control forms accept bilingual input
- ✅ AI suggestions work with German controls
- ✅ OSCAL JSON export validates and preserves German text
- ✅ Excel export renders German characters correctly
- ✅ PDF export displays umlauts and special characters
- ✅ Existing catalogues remain functional (no regression)

### Performance Benchmarks

- **Catalogue Loading**: < 5 seconds (depends on network)
- **Control Rendering**: < 1 second for 100+ controls
- **OSCAL Export**: < 2 seconds for 50 controls
- **Excel Export**: < 3 seconds for 50 controls
- **PDF Export**: < 5 seconds for 50 controls
- **AI Suggestions**: < 10 seconds per control (Ollama local)

---

## Troubleshooting

### Issue 1: Catalogue Won't Load

**Symptoms**: Error fetching BSI catalogue, timeout, or validation failure

**Solutions**:

1. **Check URL is correct**:
   ```javascript
   // In CatalogueInput.jsx, verify URL:
   url: 'https://raw.githubusercontent.com/BSI-Bund/Stand-der-Technik-Bibliothek/main/Anwenderkataloge/Grundschutz++/Grundschutz++-catalog.json'
   ```

2. **Test URL directly**:
   ```bash
   curl -I https://raw.githubusercontent.com/BSI-Bund/Stand-der-Technik-Bibliothek/main/Anwenderkataloge/Grundschutz++/Grundschutz++-catalog.json
   # Should return HTTP 200
   ```

3. **Check backend logs**:
   - Look for CORS errors
   - Check URL validator (should allow GitHub)
   - Verify OSCAL parser handles BSI format

4. **Try custom URL input**:
   - Manually paste BSI URL
   - Click Load Catalogue
   - Check browser console for errors

---

### Issue 2: German Characters Display as �

**Symptoms**: Umlauts show as replacement characters or boxes

**Solutions**:

1. **Check browser encoding**:
   - Verify browser is set to UTF-8
   - Press F12 → Console → Check encoding warnings

2. **Verify server headers**:
   ```bash
   curl -I http://localhost:3020/api/fetch-catalogue
   # Should include: Content-Type: application/json; charset=utf-8
   ```

3. **Check React rendering**:
   - Ensure `<meta charset="UTF-8">` in `index.html`
   - Verify no encoding transformation in React components

4. **Test with simple German text**:
   - Add test control: "Ä Ö Ü ä ö ü ß"
   - Verify it displays correctly

---

### Issue 3: AI Suggestions Not Working

**Symptoms**: No suggestions, timeout, or generic fallback only

**Solutions**:

1. **Check Ollama is running**:
   ```bash
   curl http://localhost:11434/api/tags
   # Should list mistral:7b
   ```

2. **Verify AI configuration**:
   ```bash
   # Check config/app/config.json
   cat config/app/config.json | jq '.mistralConfig.enabled'
   # Should be true
   ```

3. **Test AI endpoint**:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3020/api/mistral/status
   ```

4. **Check backend logs**:
   - Look for Ollama connection errors
   - Verify model is loaded

---

### Issue 4: Export Failures

**Symptoms**: Excel or PDF export fails or produces corrupted files

**Solutions**:

1. **Check file size**:
   - Large SSPs (500+ controls) may timeout
   - Try exporting fewer controls first

2. **Verify German text in export**:
   - Open exported file
   - Check for encoding issues
   - Verify UTF-8 support in export modules

3. **Test export modules**:
   ```bash
   # Backend logs should show export success
   # No errors from ExcelJS or PDFKit
   ```

4. **Try different browsers**:
   - Some browsers handle downloads differently
   - Test in Chrome, Firefox, Safari

---

## Test Report Template

### BSI Integration Test Report

**Date**: YYYY-MM-DD  
**Tester**: [Name]  
**Version**: 1.7.0-rc1  
**Environment**: Development / Staging / Production

---

#### Test Results Summary

| Test | Status | Notes |
|------|--------|-------|
| 1. Catalogue Selection | ✅ Pass / ❌ Fail | |
| 2. OSCAL Validation | ✅ Pass / ❌ Fail | |
| 3. German Character Rendering | ✅ Pass / ❌ Fail | |
| 4. Control Implementation | ✅ Pass / ❌ Fail | |
| 5. AI Suggestions | ✅ Pass / ❌ Fail | |
| 6. OSCAL JSON Export | ✅ Pass / ❌ Fail | |
| 7. Excel Export | ✅ Pass / ❌ Fail | |
| 8. PDF Export | ✅ Pass / ❌ Fail | |
| 9. Load Existing SSP | ✅ Pass / ❌ Fail | |
| 10. Cross-Catalogue Compatibility | ✅ Pass / ❌ Fail | |

**Overall Result**: ✅ All Tests Pass / ⚠️ Partial / ❌ Failed

---

#### Detailed Findings

**Issues Found**:

1. [Issue description]
   - **Severity**: Critical / High / Medium / Low
   - **Steps to Reproduce**: [...]
   - **Expected**: [...]
   - **Actual**: [...]
   - **Workaround**: [...]

**Performance Notes**:

- Catalogue load time: [X] seconds
- Export times: JSON [X]s, Excel [X]s, PDF [X]s
- UI responsiveness: [Good / Fair / Poor]

**German Character Rendering**:

- UI: ✅ Perfect / ⚠️ Minor issues / ❌ Broken
- OSCAL JSON: ✅ Perfect / ⚠️ Minor issues / ❌ Broken
- Excel: ✅ Perfect / ⚠️ Minor issues / ❌ Broken
- PDF: ✅ Perfect / ⚠️ Minor issues / ❌ Broken

**AI Integration**:

- Provider: Ollama / Mistral API / AWS Bedrock / None
- Suggestions quality: [Excellent / Good / Fair / Poor]
- German context understanding: [Excellent / Good / Fair / Poor]

---

#### Recommendations

- [ ] Ready for release
- [ ] Minor fixes needed
- [ ] Major issues require resolution
- [ ] Additional testing recommended

**Blocker Issues**: [None / List issues]

**Nice-to-Have Improvements**: [List suggestions]

---

#### Sign-Off

**Tested By**: [Name]  
**Date**: [YYYY-MM-DD]  
**Signature**: ___________________

---

## Conclusion

This testing guide ensures comprehensive validation of BSI Grundschutz++ integration. All tests must pass before promoting to v1.7.0 release.

**Next Steps After Testing**:

1. Document any issues in GitHub
2. Fix critical/high severity issues
3. Update documentation with findings
4. Prepare release notes
5. Merge to Pre_Prod branch
6. Schedule v1.7.0 release

---

**For testing questions or issue reporting:**  
📧 mukesh.kesharwani@adobe.com  
🏢 Adobe

**Last Updated**: February 2026
