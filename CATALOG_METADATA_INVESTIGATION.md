# Catalog Metadata Preservation - Investigation & Fix

**Date**: November 7, 2025  
**Status**: 🔍 Debug Logging Active + Metadata Preservation Implemented

## Issue

The exported OSCAL SSP is not preserving the original catalog metadata and format. The export should:
1. Preserve catalog metadata (published, document-ids, props, links, roles, parties)
2. Preserve control structure (params, props, parts, class)
3. Add implementation details on top of catalog structure

## Changes Applied

### 1. ✅ **Catalog Metadata Preservation** (Lines 332-393)

Now preserving from the source catalog:
- `published` - Publication date
- `document-ids` - Document identifiers
- `props` - Metadata properties
- `links` - Related links
- `roles` - Defined roles
- `locations` - Locations
- `parties` - Organizations/people
- `responsible-parties` - Responsible parties
- `remarks` - Additional remarks

### 2. ✅ **Control Structure Preservation** (Already Implemented)

Preserving from each control:
- `class` - Control classification
- `params` - Control parameters
- `props` - Control properties (catalog + implementation)
- `parts` - Control parts (statement, guidance, etc.)
- All custom fields

### 3. ✅ **Debug Logging Added**

The server now logs:
- Control structure details (params, props, parts, class)
- Catalog metadata details
- Full keys of first control

## Testing Instructions

### Step 1: Perform an Export

1. **Open the application**: http://localhost:3019

2. **Select a catalog** (e.g., NIST SP 800-53, Australian ISM)

3. **Fill in system information**

4. **Document at least one control** with implementation details

5. **Export as OSCAL JSON**

### Step 2: Check Debug Logs

Run this command to see what data the server received:

\`\`\`bash
tail -30 /tmp/oscal-server.log
\`\`\`

Look for:
```
=== DEBUG: First control structure ===
Control ID: AC-1
Has params: true 5
Has props: true 8
Has parts: true 12
Has class: true NIST-800-53
Full control keys: [...list of keys...]
======================================

=== DEBUG: Catalog metadata ===
Metadata keys: [...list of keys...]
Title: NIST SP 800-53 Rev 5
Version: 5.1.1
=================================
```

### Step 3: Examine the Exported File

Open the exported JSON file and verify:

#### ✅ **Catalog Metadata Preserved**
```json
{
  "system-security-plan": {
    "metadata": {
      "title": "...",
      "published": "2020-09-23T00:00:00.000+00:00",   ← From catalog
      "last-modified": "2025-11-07T...",                ← Generated
      "version": "5.1.1",                               ← From catalog
      "oscal-version": "1.1.2",                         ← From catalog
      "document-ids": [...],                            ← From catalog
      "props": [...],                                   ← From catalog
      "links": [...],                                   ← From catalog
      "roles": [...],                                   ← From catalog
      "parties": [...]                                  ← From catalog
    }
  }
}
```

#### ✅ **Control Structure Preserved**
```json
{
  "control-implementation": {
    "implemented-requirements": [
      {
        "uuid": "...",
        "control-id": "AC-1",
        "class": "NIST-800-53",                       ← From catalog
        "description": "Implementation details...",
        "params": [                                    ← From catalog
          {
            "id": "ac-1_prm_1",
            "label": "organization-defined personnel or roles"
          }
        ],
        "props": [                                     ← From catalog + added
          {"name": "label", "value": "AC-1"},         ← From catalog
          {"name": "sort-id", "value": "ac-01"},      ← From catalog
          {"name": "implementation-status", ...}       ← Added by tool
        ],
        "parts": [                                     ← From catalog
          {
            "id": "ac-1_smt",
            "name": "statement",
            "prose": "..."
          },
          {
            "id": "ac-1_gdn",
            "name": "guidance",
            "prose": "..."
          }
        ]
      }
    ]
  }
}
```

## Expected Debug Output

### If Working Correctly:
```
Control ID: AC-1
Has params: true 5       ← Should be true with count > 0
Has props: true 8        ← Should be true with count > 0
Has parts: true 12       ← Should be true with count > 0
Has class: true NIST-800-53  ← Should show catalog class
```

### If NOT Working:
```
Control ID: AC-1
Has params: false 0      ← ❌ Missing params
Has props: false 0       ← ❌ Missing props  
Has parts: false 0       ← ❌ Missing parts
Has class: false undefined  ← ❌ Missing class
```

## Troubleshooting

### If params/props/parts are missing from controls:

**Possible Cause**: The data is not being preserved in the frontend state when controls are updated.

**Check**: Browser console for any errors or warnings when controls are loaded/updated.

### If catalog metadata is missing:

**Possible Cause**: The catalog metadata is not being passed to the export endpoint.

**Check**: The debug logs show what `metadata` keys are available.

## Next Steps

**Please perform a test export and share:**

1. **The debug log output** from `/tmp/oscal-server.log`
2. **A sample of the exported JSON** (first control only)
3. **The original catalog URL** you're using

This will help identify exactly where the data is being lost in the flow:

```
Catalog Fetch → Controls Extract → Frontend State → Export API → SSP Generation
      ↓              ↓                   ↓              ↓             ↓
   [Check1]       [Check2]           [Check3]       [Check4]      [Check5]
```

---

## Server Status

✅ **Running**: http://localhost:3019  
✅ **Debug logging**: Active  
✅ **Metadata preservation**: Implemented  
✅ **Ready for testing**: Yes

**Please test an export now and share the debug logs!** 🔍

