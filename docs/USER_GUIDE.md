# OSCAL Report Generator - User Guide

## Table of Contents

1. [Getting Started](#getting-started)
2. [Control Management](#control-management)
3. [Testing & Evidence Section](#testing--evidence-section)
4. [Assessment Fields](#assessment-fields)
5. [Exporting Reports](#exporting-reports)
6. [Best Practices](#best-practices)

## Getting Started

### Accessing the Application

1. Open your web browser
2. Navigate to the application URL
3. Log in with your credentials
4. Select or load a catalog (NIST 800-53, BSI, etc.)

### User Roles

Different roles have different permissions:

- **Viewer**: Can view controls, cannot edit
- **Editor**: Can edit most fields, create controls
- **Assessor**: Can edit all fields including Testing Method and Testing Objective
- **Admin**: Full access to all features

## Control Management

### Viewing Controls

Controls are displayed with:
- Control ID (e.g., AC-1, AU-2)
- Control Title
- Implementation Status
- Responsible Party
- Control Type

### Editing Controls

1. Click on a control to expand it
2. Navigate through tabs: Implementation, Roles, Testing & Evidence, Risk
3. Edit fields as needed
4. Changes are auto-saved

### Control Status Options

- **Effective**: Control is implemented and working
- **Implemented**: Control is in place
- **Partial**: Control is partially implemented
- **Planned**: Control will be implemented
- **Ineffective**: Control exists but doesn't work properly
- **Not Implemented**: Control is not in place
- **Not Assessed**: Assessment not yet performed

## Testing & Evidence Section

The Testing & Evidence tab contains all assessment-related information:

### Field Overview

```
Testing & Evidence
├── Control Type
├── Assessment/Testing Objective (NEW)
├── Evidence Location
├── Testing Method
├── Testing Frequency
└── Last Test Date
```

## Assessment Fields

### Assessment/Testing Objective

**Purpose**: Defines what you're trying to verify during assessment.

**When to use**: 
- Required for NIST SP 800-53 compliance
- Part of Security Assessment Results (SAR)
- Helps assessors understand testing goals

**Examples**:

**Good Objectives**:
- "Verify that access controls prevent unauthorized data access"
- "Confirm that encryption is properly implemented for data in transit and at rest"
- "Validate that audit logs capture all security-relevant events"

**Poor Objectives**:
- "Check access" (too vague)
- "Test the system" (not specific)
- "Ensure compliance" (not measurable)

**Permission**: Requires Assessor role to edit

**OSCAL Mapping**: Maps to `assessment-objective` → `local-objective` in SAR

---

### Testing Method

**Purpose**: Describes how you're testing the control.

**When to use**:
- Document the specific testing procedures
- Required for audit and compliance
- Part of SAR export

**Examples**:

**Good Methods**:
- "Review access control logs for the past 30 days and perform penetration testing to verify access restrictions"
- "Examine encryption certificates and perform packet capture analysis to verify TLS 1.2+"
- "Interview system administrators and review audit log configuration files"

**Poor Methods**:
- "Testing" (not descriptive)
- "Manual review" (too generic)
- "Check it" (no detail)

**Permission**: Requires Assessor role to edit

**OSCAL Mapping**: Maps to `assessment-method` → `description` in SAR

---

### Control Type

**Purpose**: Categorizes how the control is implemented.

**Options**:
- **Policy**: Documented policies and procedures
- **Process (Isolated Implementation by Human)**: Manual processes
- **Orchestrated in Clusters or Pools by Tools**: Semi-automated
- **Automated by Tools**: Fully automated controls

**Note**: This affects how Testing Method is interpreted in SAR generation.

---

### Evidence Location

**Purpose**: Documents where evidence of control implementation is stored.

**Examples**:
- "SharePoint/Security/Policies/AccessControl.pdf"
- "AWS S3 bucket: s3://compliance-evidence/ac-1/"
- "Confluence: https://wiki.company.com/security/ac-1"
- "GitHub: github.com/company/security-policies/blob/main/access-control.md"

**Best Practices**:
- Use consistent path formats
- Include version information if applicable
- Ensure paths are accessible to assessors
- Update when evidence location changes

---

### Testing Frequency

**Purpose**: How often the control is tested or assessed.

**Options**:
- **Continuous**: Automated monitoring
- **Daily**: Daily automated checks
- **Weekly**: Weekly testing
- **Monthly**: Monthly assessments
- **Quarterly**: Every 3 months
- **Semi-Annual**: Twice per year
- **Annual**: Once per year
- **Ad-hoc**: As needed basis

**Guidelines**:
- High-risk controls → More frequent testing
- Automated controls → Continuous or daily
- Policy controls → Annual or as updated
- Critical controls → At least quarterly

---

### Last Test Date

**Purpose**: Records when testing was last performed.

**Format**: Use the date picker (YYYY-MM-DD format)

**Best Practices**:
- Update immediately after testing
- Include in audit trail
- Use to track overdue assessments

---

## Exporting Reports

### Export Formats

The application supports multiple export formats:

#### 1. SSP (System Security Plan) in OSCAL
- **Format**: JSON
- **Purpose**: Document control implementations
- **Use**: FedRAMP, FISMA compliance
- **Contains**: Control details, implementations, roles

#### 2. SAR (Security Assessment Results) in OSCAL
- **Format**: JSON
- **Purpose**: Document assessment results
- **Use**: Audit reports, compliance verification
- **Contains**: Assessment objectives, methods, findings, evidence
- **NEW**: Includes proper NIST SP 800-53 field mappings

#### 3. Excel SSP/CCM
- **Format**: XLSX
- **Purpose**: Human-readable spreadsheet
- **Use**: Manual review, distribution
- **Contains**: All control information in spreadsheet format

#### 4. PDF Report
- **Format**: PDF
- **Purpose**: Professional compliance report
- **Use**: Presentations, documentation
- **Contains**: System info, controls, assessment summary

### How to Export

1. **Complete Control Information**
   - Fill in all required fields
   - Complete Testing & Evidence section
   - Update assessment dates

2. **Select Export Type**
   - Click the appropriate export button
   - For SAR: Click "Export SAR (Assessment Results)"

3. **Configure Validation** (Optional)
   - Check validation options if desired
   - Select which aspects to validate
   - Click "Validate OSCAL" to check before export

4. **Download**
   - File downloads automatically
   - Check your browser's download folder

### When to Use Each Export

| Export Type | Best For | Audience |
|-------------|----------|----------|
| SSP (OSCAL) | Implementation documentation | Implementers, system owners |
| SAR (OSCAL) | Assessment results | Auditors, assessors, compliance teams |
| Excel | Collaboration, review | Business stakeholders, reviewers |
| PDF | Presentations, reports | Management, external auditors |

## Best Practices

### 1. Complete Assessment Fields

Always fill in both Assessment Objective and Testing Method:
- **Objective** = What you're verifying
- **Method** = How you're verifying it

### 2. Use Specific Language

**Assessment Objectives should**:
- Be specific and measurable
- Focus on what you're verifying
- Align with control requirements

**Testing Methods should**:
- Describe actual procedures performed
- Include tools and techniques used
- Be detailed enough for repeatability

### 3. Maintain Evidence

- Store evidence in consistent locations
- Use clear naming conventions
- Include dates in evidence filenames
- Keep evidence accessible for audits

### 4. Regular Updates

- Update Last Test Date after each assessment
- Review and update objectives when controls change
- Keep methods current with actual procedures

### 5. Role-Based Workflow

1. **Implementer** completes Implementation tab
2. **System Owner** assigns Roles
3. **Assessor** completes Testing & Evidence
4. **Risk Manager** reviews Risk tab
5. **Compliance Team** exports SAR

### 6. Consistent Naming

Use consistent formats:
- Evidence paths: `Domain/Category/ControlID/Description.ext`
- Dates: YYYY-MM-DD format
- Control IDs: Uppercase (AC-1, not ac-1)

### 7. Testing Frequency Guidelines

| Control Risk Level | Recommended Frequency |
|-------------------|----------------------|
| Critical/High | Quarterly or Continuous |
| Medium | Semi-Annual |
| Low | Annual |
| Automated | Continuous |
| Policy-based | Annual or when updated |

## Troubleshooting

### Cannot Edit Testing Fields

**Issue**: Testing Method and Testing Objective are disabled

**Solution**: These fields require Assessor role
- Contact your administrator for role assignment
- Check user permissions in Settings

### Missing Fields in Export

**Issue**: SAR export doesn't include assessment data

**Solution**: 
- Ensure Assessment/Testing Objective is filled in
- Complete Testing Method field
- Save changes before exporting

### Evidence Not Accessible

**Issue**: Evidence location path doesn't work

**Solution**:
- Verify path is correct
- Ensure proper access permissions
- Use absolute paths when possible
- Test paths before saving

## Additional Resources

- [OSCAL SAR Guide](OSCAL_SAR.md) - Detailed SAR documentation
- [Deployment Guide](DEPLOYMENT_AND_OPERATIONS.md) - Installation and setup
- [Architecture](ARCHITECTURE.md) - Technical details

## Support

For additional help:
1. Check application documentation
2. Review NIST OSCAL specifications
3. Contact your security team
4. Refer to NIST SP 800-53 guidance

---

**Document Version**: 1.0  
**Last Updated**: February 5, 2025  
**Author**: Mukesh Kesharwani
