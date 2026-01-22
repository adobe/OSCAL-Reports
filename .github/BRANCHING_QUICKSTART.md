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
| **Development** | Active development | Pre_Prod | No |
| **Quality_Test** | QA testing | Pre_Prod | No |
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
git checkout Pre_Prod
git pull
gh pr create --base main --title "Release v1.x.x"
```

---

## ❌ Don't Do This

- ❌ Development/Quality_Test → main (direct)
- ❌ Push directly to main or Pre_Prod
- ❌ Force push to protected branches

## ✅ Do This

- ✅ Use Pull Requests for everything
- ✅ Follow the branch hierarchy
- ✅ Test in Pre_Prod before main
- ✅ Get code reviews

---

## 🔗 Full Documentation

See `docs/BRANCHING_STRATEGY.md` for complete details.

---

**Questions?** Contact: mukesh.kesharwani@adobe.com
