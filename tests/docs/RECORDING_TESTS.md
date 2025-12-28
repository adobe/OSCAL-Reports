# 🎥 Recording Browser Interactions as Test Cases

## Yes! You Can Record Your Browser Interactions! 🎉

You can navigate through the OSCAL Report Generator in a browser, and your interactions will be automatically converted into test code!

---

## 🚀 Quick Start (3 Steps)

### Step 1: Install Playwright

```bash
cd /Users/mkesharw/Documents/OSCAL_Reports

# Install Playwright
npm install --save-dev @playwright/test

# Install browsers
npx playwright install
```

### Step 2: Start Your App

```bash
# Terminal 1: Start the application
npm run dev

# Your app will be running at http://localhost:3021
```

### Step 3: Start Recording

```bash
# Terminal 2: Start Playwright codegen
npx playwright codegen http://localhost:3021
```

**What happens:**
- A browser window opens
- Playwright Inspector opens (shows generated code)
- Everything you do in the browser is recorded as code!

---

## 🎬 How It Works

### Visual Recording Process

```
┌─────────────────────────────────────────────────┐
│                                                 │
│  You interact with the app:                     │
│  • Click buttons                                │
│  • Fill forms                                   │
│  • Navigate pages                               │
│  • Upload files                                 │
│  • Select dropdowns                             │
│                                                 │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│                                                 │
│  Playwright automatically generates:            │
│                                                 │
│  await page.click('button#login')               │
│  await page.fill('input[name="username"]', ...) │
│  await page.select('select#catalog', ...)       │
│  await expect(page).toHaveURL(...)              │
│                                                 │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│                                                 │
│  Copy & save as test.spec.js                    │
│  Run: npx playwright test                       │
│  ✅ Test passes! Quality code guaranteed!       │
│                                                 │
└─────────────────────────────────────────────────┘
```

---

## 📋 Example Recording Session

### Scenario: "Login → Create SSP → Export"

**What You Do:**

1. Open `http://localhost:3021`
2. Enter username: `admin`
3. Enter password: `Admin#01010101`
4. Click "Login" button
5. Click "Select Catalog" → Choose "NIST 800-53"
6. Fill in "System Name": `Test System`
7. Click "Export SSP"
8. Download appears

**What Playwright Generates:**

```javascript
import { test, expect } from '@playwright/test';

test('User can create and export SSP', async ({ page }) => {
  // Go to application
  await page.goto('http://localhost:3021');
  
  // Login
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('Admin#01010101');
  await page.getByRole('button', { name: 'Login' }).click();
  
  // Select catalog
  await page.getByText('NIST 800-53').click();
  
  // Fill system info
  await page.getByLabel('System Name').fill('Test System');
  
  // Export
  await page.getByRole('button', { name: 'Export SSP' }).click();
  
  // Verify download
  const download = await page.waitForEvent('download');
  expect(download.suggestedFilename()).toContain('.json');
});
```

**That's it!** Save this code and run it anytime to verify this workflow!

---

## 🎯 Critical Workflows to Record

### 1. Authentication Flows
- ✅ Login as admin
- ✅ Login as regular user
- ✅ Login with wrong password
- ✅ Logout
- ✅ Session timeout

### 2. SSP Creation
- ✅ Start from scratch
- ✅ Upload existing SSP
- ✅ Fill all required fields
- ✅ Save and reload

### 3. Control Documentation
- ✅ Select controls
- ✅ Mark as implemented
- ✅ Add implementation details
- ✅ Use AI suggestions

### 4. Export Functions
- ✅ Export as JSON
- ✅ Export as PDF
- ✅ Export as Excel
- ✅ Export as CCM

### 5. User Management (Admin)
- ✅ Create new user
- ✅ Change user role
- ✅ Deactivate user
- ✅ Reset password

### 6. Settings
- ✅ Configure AI provider
- ✅ Update messaging settings
- ✅ Change system settings

### 7. Comparison Mode
- ✅ Upload two SSPs
- ✅ View differences
- ✅ Filter changes
- ✅ Export comparison

---

## 💡 Advanced Features

### Adding Assertions

While recording, click "Assert" in Playwright Inspector to add checkpoints:

```javascript
// Assert text is visible
await expect(page.locator('text=Welcome')).toBeVisible();

// Assert URL
await expect(page).toHaveURL(/.*dashboard/);

// Assert element state
await expect(page.getByRole('button')).toBeEnabled();

// Assert text content
await expect(page.locator('h1')).toContainText('OSCAL');
```

### Recording with Different Users

```bash
# Record as admin
npx playwright codegen http://localhost:3021

# Login as admin and perform admin tasks

# Record as regular user
npx playwright codegen http://localhost:3021

# Login as user and perform user tasks
```

### Recording Mobile Interactions

```bash
# Emulate iPhone
npx playwright codegen --device="iPhone 12" http://localhost:3021

# Emulate Pixel
npx playwright codegen --device="Pixel 5" http://localhost:3021
```

---

## 🏃 Running Your Recorded Tests

```bash
# Run all tests
npx playwright test

# Run in headed mode (see the browser)
npx playwright test --headed

# Run specific test
npx playwright test login.spec.js

# Debug mode (step through)
npx playwright test --debug

# Run and show report
npx playwright test && npx playwright show-report
```

---

## 📊 Test Reports

After running tests, view detailed reports:

```bash
npx playwright show-report
```

**Reports include:**
- ✅ Screenshots on failure
- ✅ Video recordings
- ✅ Network activity
- ✅ Console logs
- ✅ Detailed traces

---

## 🔄 Integration with Pre-Commit

Your recorded tests will run automatically before commits!

The `tests/scripts/run_tests.sh` can be enhanced to include E2E tests:

```bash
# In run_tests.sh, add:
run_test_suite \
    "E2E Tests (Playwright)" \
    "npx playwright test --reporter=list" \
    "${PROJECT_ROOT}/tests/e2e"
```

---

## 📝 Best Practices

1. **Record realistic workflows** - Test what users actually do
2. **Add meaningful assertions** - Verify expected outcomes
3. **Name tests descriptively** - Easy to understand what failed
4. **Keep tests independent** - Each test should work standalone
5. **Clean up after tests** - Reset state for next test
6. **Update tests when UI changes** - Keep them in sync

---

## 🎓 Learning Resources

- **Playwright Docs**: https://playwright.dev
- **Codegen Guide**: https://playwright.dev/docs/codegen
- **Best Practices**: https://playwright.dev/docs/best-practices
- **Examples**: `tests/e2e/example-recorded.spec.js`

---

## 🚦 Workflow Summary

```bash
# 1. Install (once)
npm install --save-dev @playwright/test
npx playwright install

# 2. Start app
npm run dev

# 3. Record interactions
npx playwright codegen http://localhost:3021

# 4. Save generated code
# Copy from Playwright Inspector → save as .spec.js

# 5. Run tests
npx playwright test

# 6. View report
npx playwright show-report

# 7. Commit with confidence!
git add .
git commit -m "feat: Add new feature with E2E tests"
```

---

## ✨ Benefits

✅ **No manual test writing** - Just use the app naturally  
✅ **Captures complex interactions** - Multi-step workflows  
✅ **Cross-browser testing** - Chrome, Firefox, Safari, Mobile  
✅ **Visual feedback** - Videos and screenshots  
✅ **Quality assurance** - Only working code reaches GitHub  
✅ **Documentation** - Tests serve as usage examples  
✅ **Regression prevention** - Catch breaking changes early  

---

## 🎉 Let's Record Your First Test!

**Ready to try it?** Follow these steps:

1. Open a terminal and run: `npm run dev`
2. Open another terminal and run: `npx playwright codegen http://localhost:3021`
3. Use the app as you normally would
4. Watch the code being generated!
5. Copy the code and save it
6. Run it: `npx playwright test`

**That's it!** You've just created an automated test case! 🚀

---

**Questions?** Check `tests/e2e/README.md` or the Playwright documentation!

