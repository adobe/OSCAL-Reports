# Branching Strategy - Quick Reference

**OSCAL Report Generator** — [adobe/OSCAL-Reports](https://github.com/adobe/OSCAL-Reports)

---

## Branch flow (4 branches)

```
Development (default) → Quality → main / Prod
```

**Retired:** `Pre_Prod` — use `Quality` for integration and staging validation.

---

## Quick rules

| Branch | Purpose | Merges to | Protected |
|--------|---------|-----------|-----------|
| **Development** | Active development (default) | Quality | Recommended |
| **Quality** | Integration / staging validation | main, Prod | Recommended |
| **main** | Production | N/A | Yes |
| **Prod** | Production (parallel) | N/A | Yes |

---

## Quick commands

### Daily development

```bash
git checkout Development
git pull origin Development
# ... changes ...
git push origin Development
```

### Promote to integration

```bash
gh pr create --repo adobe/OSCAL-Reports --base Quality --head Development --title "Merge to Quality"
```

### Release to production

```bash
gh pr create --repo adobe/OSCAL-Reports --base main --head Quality --title "Release v1.x.x"
```

---

## Full documentation

See [docs/GIT_AND_RELEASE.md](../docs/GIT_AND_RELEASE.md).
