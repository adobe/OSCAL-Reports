# 🌳 Branching Strategy - Quick Reference

**OSCAL Report Generator V2**

---

## 🎯 Branch Flow

```
Development  ──┐
               ├──> Pre_Prod ──> main (Production)
Quality_Test ──┘
```

---

## 📋 Quick Rules

| Branch | Purpose | Merges To | Protected |
|--------|---------|-----------|-----------|
| **Development** | Active development | Pre_Prod or main | No |
| **Quality_Test** | QA testing | Pre_Prod or main | No |
| **Pre_Prod** | Staging/Pre-production | main | ✅ Yes |
| **main** | Production | N/A | ✅ Yes |

---

## ⚡ Quick Commands

### Start New Feature
```bash
git checkout Development
git pull
git checkout -b feature/my-feature
# ... work on feature ...
git push origin feature/my-feature
gh pr create --base Development
```

### Deploy to Staging (Pre_Prod)
```bash
git checkout Development  # or Quality_Test
git pull
gh pr create --base Pre_Prod --title "Deploy to Staging"
```

### Deploy to Production (main)
```bash
# From Pre_Prod (recommended), Development, or Quality_Test
git checkout Pre_Prod   # or Development / Quality_Test
git pull
gh pr create --base main --head Pre_Prod --title "Release v1.x.x"
```

---

## 🔒 Merging to main

**Allowed:** Development, Quality_Test, or Pre_Prod can merge to main.  
**Blocked:** Feature/custom branches cannot target main.

---

## ❌ Don't Do This

- ❌ **Feature/custom branch → main** (blocked)
- ❌ Push directly to main or Pre_Prod
- ❌ Force push to protected branches

## ✅ Do This

- ✅ Use Pull Requests for everything
- ✅ **Recommended flow:** Development/Quality_Test → Pre_Prod → main (validate in staging first)
- ✅ Allowed: Development, Quality_Test, or Pre_Prod → main
- ✅ Get code reviews

---

## 🔗 Full Documentation

See `docs/BRANCHING_STRATEGY.md` for complete details.

---

**Questions?** Contact: mukesh.kesharwani@adobe.com
