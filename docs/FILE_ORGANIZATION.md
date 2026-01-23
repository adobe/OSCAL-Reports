# File Organization Guide

**Last Updated:** 2026-01-23

---

## Directory Structure

```
OSCAL_Reports/
├── .cursor/              # Cursor IDE settings
├── .github/              # GitHub templates and workflows
│   ├── workflows/        # CI/CD automation
│   ├── CONTRIBUTING.md
│   ├── BRANCHING_QUICKSTART.md
│   ├── DEPLOYMENT_QUICKSTART.md
│   └── PULL_REQUEST_TEMPLATE.md
├── .validation/          # Automated validation rules
│   ├── best_practices.json
│   ├── security_rules.json
│   └── README.md
├── backend/              # Backend Node.js/Express application
│   ├── auth/             # Authentication & authorization
│   ├── middleware/       # Express middleware
│   ├── utils/            # Utility functions
│   ├── server.js         # Main server file
│   └── package.json
├── config/               # Application configuration
│   └── app/              # Runtime configuration files
│       ├── config.json   # Application settings
│       └── users.json    # User accounts
├── docs/                 # 📚 ALL DOCUMENTATION GOES HERE
│   ├── AI_ARCHITECTURE_SECURITY.md
│   ├── ARCHITECTURE.md
│   ├── BEST_PRACTICES.md
│   ├── BRANCHING_STRATEGY.md
│   ├── CLOUD_DEPLOYMENT.md
│   ├── DEPLOYMENT.md
│   ├── DOCKER_HUB_GUIDE.md
│   ├── FILE_ORGANIZATION.md (this file)
│   ├── GITHUB_ACTIONS_DEPLOYMENT.md
│   ├── PR_SUBMISSION_CHECKLIST.md
│   ├── QUALITY_ASSURANCE.md
│   ├── README.md (documentation index)
│   ├── SECURITY_FIXES_KODIAK.md
│   ├── SECURITY_QUICK_REFERENCE.md
│   ├── TESTING_AUTOMATION_SUMMARY.md
│   ├── TESTING_QUICK_START.md
│   ├── TESTING_STRATEGY.md
│   ├── TRUENAS_APP_CATALOG.md
│   ├── TRUENAS_INSTALLATION.md
│   ├── TRUENAS_QUICK_REFERENCE.md
│   └── VALIDATION_SYSTEM.md
├── frontend/             # React/Vite frontend application
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── contexts/     # React contexts
│   │   ├── services/     # API services
│   │   └── utils/        # Frontend utilities
│   └── package.json
├── sample_output/        # Example OSCAL outputs
├── scripts/              # Build and deployment scripts
├── test_cases/           # All test files
│   ├── backend/
│   │   ├── unit/         # Unit tests
│   │   ├── integration/  # Integration tests
│   │   └── e2e/          # End-to-end tests
│   ├── README.md
│   ├── TEST_COVERAGE_REPORT.md
│   └── TESTING_GUIDE.md
├── truenas-apps-format/  # TrueNAS catalog format
│   ├── oscal-report-generator/
│   ├── CONVERSION_GUIDE.md
│   └── QUICK_START.md
├── .cursorrules          # AI behavior guidelines
├── .gitignore
├── docker-compose.yml
├── Dockerfile
├── LICENSE               # GPL-3.0 license
├── package.json          # Root package management
├── README.md             # Project overview (if exists)
└── setup.sh              # Setup script
```

---

## Documentation Organization Rules

### ✅ DO: Place Documentation in docs/

**All documentation files (.md) MUST be placed in the `docs/` folder**, except:
- `README.md` at root (project overview)
- `LICENSE` at root
- Component-specific READMEs in their directories

### ❌ DON'T: Create Files at Root

**NEVER create these at root:**
- ❌ Temporary .txt files (AI_FIX.txt, SUMMARY.txt, etc.)
- ❌ Troubleshooting .md files
- ❌ Credential files (credentials.txt, passwords.txt)
- ❌ Summary documents
- ❌ Quick reference files (unless moving to docs/)

### Cleanup After Troubleshooting

When troubleshooting issues:
1. Create temporary files in `/tmp` or local desktop
2. Once resolved, consolidate findings into proper docs/ documentation
3. Delete all temporary files
4. Update relevant permanent documentation

---

## Where to Place New Documentation

| Document Type | Location | Example |
|---------------|----------|---------|
| **Architecture** | `docs/ARCHITECTURE.md` or similar | System design, data flow |
| **Security** | `docs/SECURITY_*.md` | SSRF fixes, CSRF protection |
| **Deployment** | `docs/DEPLOYMENT.md` or `docs/*_DEPLOYMENT.md` | AWS, Azure, Docker guides |
| **Testing** | `docs/TESTING_*.md` | Test strategy, coverage |
| **TrueNAS** | `docs/TRUENAS_*.md` | TrueNAS-specific guides |
| **Docker** | `docs/DOCKER_*.md` | Docker Hub, containers |
| **GitHub Actions** | `docs/GITHUB_ACTIONS_*.md` | CI/CD workflows |
| **Quick References** | `docs/*_QUICK_REFERENCE.md` | Command cheat sheets |
| **Best Practices** | `docs/BEST_PRACTICES.md` | Coding standards |
| **Troubleshooting** | Add to existing docs or create `docs/TROUBLESHOOTING.md` | Common issues |

---

## Documentation Naming Conventions

### Use Descriptive Names:
- ✅ `SECURITY_FIXES_KODIAK.md` (clear purpose)
- ✅ `AI_ARCHITECTURE_SECURITY.md` (specific topic)
- ✅ `TESTING_AUTOMATION_SUMMARY.md` (describes content)
- ❌ `AI_FIX.md` (too vague)
- ❌ `SUMMARY.txt` (unclear topic)
- ❌ `NOTES.md` (temporary-sounding)

### Use Prefixes for Related Docs:
- `TRUENAS_*` - All TrueNAS documentation
- `DOCKER_*` - All Docker documentation
- `TESTING_*` - All testing documentation
- `SECURITY_*` - All security documentation

---

## File Types and Purposes

### Markdown (.md)
**Use for:** Documentation, guides, references
**Location:** `docs/` folder

### Text (.txt)
**Use for:** Temporary notes during development (DELETE after)
**Location:** NOT in git repository

### JSON (.json)
**Use for:** Configuration, data files
**Location:** 
- `config/app/` - Application config
- `.validation/` - Validation rules
- `backend/` - Schemas

### JavaScript (.js, .jsx)
**Use for:** Application code, tests
**Location:** 
- `backend/` - Server code
- `frontend/src/` - Frontend code
- `test_cases/` - Test files

---

## GitHub-Specific Documentation

### `.github/` Directory:
```
.github/
├── workflows/           # CI/CD YAML files
├── CONTRIBUTING.md      # Contribution guidelines
├── PULL_REQUEST_TEMPLATE.md
├── BRANCHING_QUICKSTART.md
└── DEPLOYMENT_QUICKSTART.md
```

**These are GitHub-specific and stay in `.github/`**

---

## Test Documentation

### `test_cases/` Directory:
```
test_cases/
├── backend/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── README.md                    # Test overview
├── TEST_COVERAGE_REPORT.md      # Coverage details
└── TESTING_GUIDE.md             # How to run tests
```

**Test-specific docs stay in `test_cases/`**

---

## Documentation Index

The `docs/README.md` file serves as the **documentation index**. When adding new documentation:

1. Create the new .md file in `docs/`
2. Add an entry to `docs/README.md`
3. Categorize appropriately (Security, Deployment, Testing, etc.)
4. Include a brief description

---

## Cleanup Checklist

When you notice clutter in root:

- [ ] Check for .txt files → DELETE
- [ ] Check for temporary .md files → Move to docs/ or DELETE
- [ ] Check for credential files → DELETE (use env vars)
- [ ] Check for duplicate docs → Consolidate into existing docs
- [ ] Update `docs/README.md` index
- [ ] Commit cleanup with message: "docs: clean up root directory"

---

## Examples of Good Organization

### ✅ Good:
```
docs/
├── SECURITY_FIXES_KODIAK.md      # Security findings and fixes
├── AI_ARCHITECTURE_SECURITY.md   # AI security architecture
├── TESTING_STRATEGY.md           # Complete testing guide
└── TESTING_QUICK_START.md        # Quick reference
```

### ❌ Bad (What We Fixed):
```
/  (root)
├── AI_INTEGRATION_FIX.txt        # ❌ Temporary troubleshooting
├── PRODUCTION_READY_AI_CONFIG.txt # ❌ Should be in docs/
├── FINAL_AI_FIX_SUMMARY.txt      # ❌ Temporary summary
├── EMAIL_CONNECTION_FIX.md       # ❌ Troubleshooting notes
└── SECURITY_IMPACT_ANALYSIS.md   # ❌ Should consolidate
```

---

## AI Assistant Guidelines

When working with AI assistants (Cursor, etc.):

1. **Always ask where to place new documentation** before creating it
2. **Default to `docs/` for all documentation**
3. **Never create temporary .txt files in the repository**
4. **Consolidate findings into existing docs** when possible
5. **Delete temporary files after troubleshooting** is complete
6. **Update `docs/README.md`** when adding new documentation

These guidelines are enforced in `.cursorrules` at the repository root.

---

## Quick Reference

| Need to... | Do this... |
|------------|------------|
| Document a bug fix | Update relevant doc in `docs/` or create `docs/BUGFIX_DESCRIPTION.md` |
| Create troubleshooting notes | Use local text editor, consolidate into docs/ when done |
| Add security documentation | Create/update `docs/SECURITY_*.md` |
| Document a new feature | Update `docs/ARCHITECTURE.md` or create feature-specific doc |
| Add test documentation | Update `test_cases/TESTING_GUIDE.md` or create in `docs/TESTING_*.md` |
| Quick command reference | Create `docs/*_QUICK_REFERENCE.md` |

---

## Maintaining Organization

### Weekly:
- Check root directory for clutter
- Move misplaced files to proper locations
- Delete old temporary files

### Before PR:
- Verify no temporary files in commit
- Ensure documentation is in `docs/`
- Update `docs/README.md` if needed

### After Troubleshooting:
- Consolidate findings into permanent docs
- Delete all temporary files
- Commit organized documentation

---

## Summary

**The Golden Rule:**

> Keep the repository root clean. Only essential files (LICENSE, README.md, config files, package.json) belong at root. Everything else goes in organized subdirectories, especially `docs/` for all documentation.

**For AI Assistants:**

> ALL documentation files (.md, .txt) MUST go in the `docs/` folder. No exceptions except README.md and LICENSE at root. Delete temporary files after troubleshooting.

---

**Questions?** 
Check `.cursorrules` for AI behavior guidelines or contact the development team.
