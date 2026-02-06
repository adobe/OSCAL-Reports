# OSCAL Security Assessment Results (SAR) Guide

## Overview

This guide explains the Security Assessment Results (SAR) export functionality, its relationship to NIST SP 800-53, and how to use it for compliance reporting.

## What is OSCAL SAR?

Security Assessment Results (SAR) is an OSCAL document model that captures the results of a security assessment, including:

- **Assessment objectives** - What you're testing for
- **Assessment methods** - How you're testing
- **Observations** - What was observed during testing
- **Findings** - Results and compliance status
- **Evidence** - Supporting documentation

## SAR vs SSP: Understanding the Difference

### System Security Plan (SSP)
- **Purpose**: Documents how security controls are *implemented*
- **Audience**: System owners, implementers
- **Content**: Control descriptions, implementation details, responsible parties
- **When to use**: Planning phase, implementation documentation

### Security Assessment Results (SAR)
- **Purpose**: Documents how security controls were *assessed* and results
- **Audience**: Assessors, auditors, compliance teams
- **Content**: Testing objectives, methods, findings, evidence, compliance status
- **When to use**: After testing/assessment, for audit reporting

## NIST SP 800-53 Field Mapping

The application properly maps fields to NIST SP 800-53 requirements:

| Application Field | OSCAL SAR Structure | NIST SP 800-53 Field | Purpose |
|-------------------|---------------------|----------------------|---------|
| Assessment/Testing Objective | `local-objective` → `description` | `assessment-objective` | Defines what you're verifying |
| Testing Method | `assessment-method` → `description` | `assessment-method` | Describes how you're testing |
| Testing Frequency | `assessment-method` → `part` → `props` | Assessment frequency | How often testing occurs |
| Control Status | `finding` → `target` → `status` | Assessment status | Satisfied/Not-satisfied |
| Evidence Location | `observation` → `props` | Evidence reference | Links to supporting documentation |

## OSCAL SAR Document Structure

```json
{
  "assessment-results": {
    "uuid": "<generated-uuid>",
    "metadata": { ... },
    "import-ap": {
      "href": "#assessment-plan"
    },
    "local-definitions": {
      "objectives-and-methods": [
        {
          "control-id": "ac-1",
          "description": "Verify that access control policies...",
          "parts": []
        }
      ],
      "activities": [...]
    },
    "results": [
      {
        "uuid": "<result-uuid>",
        "title": "Security Assessment Results",
        "start": "2025-02-05T...",
        "end": "2025-02-05T...",
        "observations": [...],
        "findings": [...],
        "reviewed-controls": {...}
      }
    ]
  }
}
```

### Key Components

#### 1. Local Objectives
Maps to the **Assessment/Testing Objective** field:

```json
{
  "control-id": "ac-1",
  "description": "Verify that access controls prevent unauthorized data access",
  "parts": []
}
```

#### 2. Assessment Methods
Maps to the **Testing Method** field:

```json
{
  "uuid": "<method-uuid>",
  "description": "Review access control logs and perform penetration testing",
  "part": {
    "name": "assessment",
    "props": [
      {
        "name": "method",
        "value": "TEST"
      },
      {
        "name": "testing-frequency",
        "value": "Quarterly"
      }
    ]
  }
}
```

#### 3. Observations
Documents what was observed during assessment:

```json
{
  "uuid": "<observation-uuid>",
  "description": "Control implementation observation...",
  "methods": ["TEST"],
  "types": ["control-objective"],
  "collected": "2025-02-05T...",
  "relevant-evidence": [...]
}
```

#### 4. Findings
Provides assessment results and compliance status:

```json
{
  "uuid": "<finding-uuid>",
  "title": "Assessment Finding for ac-1",
  "description": "Assessment objective and findings...",
  "related-observations": [...],
  "target": {
    "target-id": "ac-1",
    "status": "satisfied",
    "implementation": "implemented"
  }
}
```

## How to Export SAR

### Step 1: Complete Testing & Evidence Section

For each control, fill in:

1. **Assessment/Testing Objective** (top of section)
   - Define what you're verifying
   - Example: "Verify that access controls prevent unauthorized data access"

2. **Evidence Location**
   - Document where evidence is stored
   - Example: "SharePoint/Assessments/AC-1-Evidence.pdf"

3. **Testing Method**
   - Describe how you tested
   - Example: "Reviewed access logs and performed access control testing"

4. **Testing Frequency**
   - How often testing occurs
   - Options: Daily, Weekly, Monthly, Quarterly, Annually

5. **Last Test Date**
   - When testing was last performed

### Step 2: Export SAR Document

1. Click **"Export SAR (Assessment Results)"** button
2. Select validation options (if desired)
3. Download the `assessment-results.json` file

### Step 3: Use the SAR Document

- Submit to auditors for compliance verification
- Include in FedRAMP submission packages
- Use with OSCAL-compliant tools for automated assessment
- Archive for audit trail and historical records

## Assessment Methods

The SAR generator automatically determines assessment method type based on control type:

| Control Type | Assessment Method | Description |
|--------------|-------------------|-------------|
| Automated by Tools | TEST | Automated testing and verification |
| Policy | EXAMINE | Document review and examination |
| Process | INTERVIEW + EXAMINE | Interviews and document review |
| Orchestrated | TEST | Testing procedures |

## Best Practices

### 1. Clear Testing Objectives
- Be specific about what you're verifying
- Align with control requirements
- Use measurable criteria

**Good Example:**
> "Verify that multi-factor authentication is enforced for all privileged accounts and cannot be bypassed"

**Poor Example:**
> "Check MFA"

### 2. Detailed Testing Methods
- Describe the specific tests performed
- Include tools and techniques used
- Document test scope

**Good Example:**
> "Performed penetration testing using Burp Suite to verify authentication bypass is not possible. Reviewed IAM logs for the past 30 days to confirm MFA is enforced."

**Poor Example:**
> "Tested authentication"

### 3. Proper Evidence Management
- Store evidence in accessible locations
- Use consistent naming conventions
- Include dates in evidence filenames
- Example: `AC-1_MFA_Testing_2025-02-05.pdf`

### 4. Regular Testing Frequency
- Align with risk level and compliance requirements
- Higher risk controls = more frequent testing
- Document any deviations from schedule

## Integration with Other OSCAL Documents

SAR documents reference other OSCAL documents:

```mermaid
graph LR
    A[Catalog] -->|Referenced by| B[SSP]
    B -->|Implemented controls| C[Assessment Plan]
    C -->|Defines testing| D[SAR]
    D -->|Findings lead to| E[POA&M]
```

- **Catalog**: NIST 800-53 control definitions
- **SSP**: How controls are implemented
- **Assessment Plan**: How assessment will be conducted
- **SAR**: Assessment results and findings
- **POA&M**: Remediation plan for findings

## Compliance Requirements

### FedRAMP
- SAR required for Initial Authorization
- Annual SAR required for Continuous Monitoring
- Must include assessment objectives and methods per NIST SP 800-53A

### StateRAMP
- Similar requirements to FedRAMP
- SAR documents assessment results

### FISMA
- SAR supports FISMA compliance reporting
- Documents control effectiveness

### Other Frameworks
- ISO 27001: Use SAR for audit evidence
- SOC 2: Map testing procedures to SAR
- CMMC: Document assessment results

## Troubleshooting

### SAR Export Fails
- Check that controls have required fields populated
- Verify Testing Objective and Testing Method are filled
- Check browser console for error details

### Validation Warnings
- SAR validation uses same rules as SSP
- Enable specific validation options to identify issues
- Empty fields are replaced with `No_Input_Recorded` placeholder

### Missing Assessment Data
- Ensure Testing & Evidence section is complete
- Required: Control ID (automatic)
- Optional but recommended: All testing fields

## Additional Resources

- [NIST OSCAL SAR Model](https://pages.nist.gov/OSCAL/concepts/layer/assessment/assessment-results/)
- [NIST SP 800-53A](https://csrc.nist.gov/publications/detail/sp/800-53a/rev-5/final) - Assessment Procedures
- [FedRAMP SAR Template](https://www.fedramp.gov/templates/)

## Support

For questions or issues:
1. Check this documentation
2. Review TROUBLESHOOTING.md
3. Contact the assessment team
4. Refer to NIST OSCAL documentation

---

**Document Version**: 1.0  
**Last Updated**: February 5, 2025  
**Author**: Mukesh Kesharwani
