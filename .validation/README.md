# Validation Rules Directory

This directory contains the configuration files for the automated validation system.

## Files

### best_practices.json
Defines best practices and coding standards validation rules.

**Categories:**
- Code Quality
- Security
- Documentation
- File Management
- Testing
- Git Hygiene
- Performance
- Dependencies

### security_rules.json
Defines security vulnerability detection patterns.

**Categories:**
- Authentication
- Injection (SQL, XSS, Command)
- Data Exposure
- Cryptography
- File System
- Network
- RegEx (ReDoS)
- Dependencies

**Related (Node backend):** `best_practices.json` includes **BP-SEC-011** — do not import `axios` directly under `backend/`; use `backend/utils/safeAxios.js` (CWE-113 / CodeQL-aligned outbound header hardening).

### learnings.json (auto-generated)
Tracks project-specific security learnings and patterns discovered over time.

**Contains:**
- npm audit history
- Security incidents
- Best practice updates
- Project-specific notes

## Usage

### Validate Code
```bash
./test_cases/scripts/validate_best_practices.sh
```

### Update Rules
```bash
./test_cases/scripts/update_best_practices.sh
```

### Add New Rule

1. Edit `best_practices.json` or `security_rules.json`
2. Add rule to appropriate category
3. Test: `./test_cases/scripts/validate_best_practices.sh`
4. Commit changes

## Rule Structure

```json
{
  "id": "CATEGORY-TYPE-###",
  "name": "Rule name",
  "severity": "critical|error|warning|info",
  "pattern": "regex pattern",
  "exclude": ["patterns to exclude"],
  "message": "User-friendly message",
  "autoFix": false
}
```

## Severity Levels

- **Critical**: Blocks commit, immediate security risk
- **Error**: Blocks commit, must be fixed
- **Warning**: Doesn't block, should be fixed
- **Info**: Informational only

## Documentation

See [docs/VALIDATION_SYSTEM.md](../docs/VALIDATION_SYSTEM.md) for complete documentation.

## Maintenance

- **Review rules**: Quarterly
- **Update patterns**: After security incidents
- **Check npm audit**: Weekly
- **Refine exclusions**: As needed

---

Last Updated: April 2026  
Version: 1.7.18
