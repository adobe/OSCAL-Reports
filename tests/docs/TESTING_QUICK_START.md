# Testing Quick Start Guide

## 🚀 Quick Commands

```bash
# Run all tests (recommended before commit)
./run_tests.sh

# Backend tests only
cd backend && npm test

# Watch mode for TDD
cd backend && npm run test:watch

# Coverage report
cd backend && npm run test:coverage
```

---

## 📝 Commit Workflow

```bash
# 1. Make your changes
vim backend/server.js

# 2. Stage changes
git add .

# 3. Commit (tests run automatically)
git commit -m "feat: Add new feature"

# ✅ If tests pass → Commit succeeds
# ❌ If tests fail → Fix issues and try again

# 4. Push to GitHub
git push
```

---

## 🧪 What Gets Tested

✅ **Unit Tests**: Individual functions  
✅ **Integration Tests**: API endpoints  
✅ **Code Quality**: No console.log, TODO/FIXME  
✅ **Security**: No hardcoded secrets  
✅ **Version**: Synchronized across packages  

---

## ⚠️ If Tests Fail

1. **Read the error message** - It tells you what failed
2. **Fix the issue** - Update your code
3. **Run tests again** - `./run_tests.sh`
4. **Commit when green** - All tests pass

---

## 🔧 Bypass Tests (Emergency Only)

```bash
# NOT RECOMMENDED - Only for emergencies
git commit --no-verify -m "hotfix: Critical fix"
```

⚠️ **Warning**: Tests will still run in GitHub Actions!

---

## 📚 Full Documentation

See `docs/TESTING.md` for complete guide.

---

## 🎯 Test Coverage Goals

- **Current**: ~30%
- **Target**: 80%+
- **View**: `cd backend && npm run test:coverage`

---

## 💡 Tips

- Write tests as you code (TDD)
- Run tests frequently
- Keep tests fast
- One test = one behavior
- Mock external dependencies

---

## 🐛 Common Issues

### "Module not found"
```bash
cd backend && npm install
```

### "Permission denied"
```bash
chmod +x run_tests.sh
chmod +x .git/hooks/pre-commit
```

### "Tests timeout"
```javascript
// Increase timeout in test
test('slow test', async () => {
  // ...
}, 30000); // 30 seconds
```

---

## ✨ Remember

**All tests must pass before committing to GitHub!**

This ensures:
- ✅ High code quality
- ✅ No regressions
- ✅ Stable production
- ✅ Happy users

---

**Need Help?** Check `docs/TESTING.md` or ask the team!

