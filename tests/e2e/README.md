# End-to-End Testing with Playwright

## Overview

This folder contains E2E tests that simulate real user interactions with the OSCAL Report Generator application.

---

## 🎥 Recording Test Cases from Browser

### Method 1: Playwright Codegen (Recommended)

Playwright can **watch and record** your browser interactions and automatically generate test code!

#### Setup Playwright

```bash
# Install Playwright
npm install --save-dev @playwright/test

# Install browsers
npx playwright install
```

#### Record Your Interactions

```bash
# Start the application
npm run dev

# In another terminal, start Playwright codegen
npx playwright codegen http://localhost:3021

# A browser will open - navigate and interact with your app
# Playwright Inspector will show the generated code in real-time!
```

#### What Gets Recorded

✅ Clicks on buttons and links
✅ Form inputs (username, password, etc.)
✅ Dropdown selections
✅ File uploads
✅ Navigation between pages
✅ Assertions (you can add checkpoints)

#### Save the Generated Code

1. Copy the generated code from Playwright Inspector
2. Paste it into a test file in `tests/e2e/`
3. Add assertions and clean up as needed
4. Run the test!

---

### Method 2: Manual Test Case Creation

Alternatively, you can describe your workflow and I'll create the test cases:

1. Navigate through the app
2. Tell me what you're doing at each step
3. I'll write comprehensive test cases

---

## 🚀 Example Workflow

### Recording a Login → Create SSP → Export flow:

```bash
# Terminal 1: Start app
cd /path/to/project
npm run dev

# Terminal 2: Start recording
npx playwright codegen http://localhost:3021
```

**In the browser that opens:**
1. Click login
2. Enter credentials
3. Select catalog
4. Fill in system info
5. Document controls
6. Export SSP

**Playwright automatically generates:**
```javascript
test('complete SSP workflow', async ({ page }) => {
  await page.goto('http://localhost:3021');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('password');
  await page.getByRole('button', { name: 'Login' }).click();
  // ... and so on
});
```

---

## 📝 Test Case Structure

```javascript
import { test, expect } from '@playwright/test';

test.describe('OSCAL Report Generator E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Setup: Navigate to app
    await page.goto('http://localhost:3021');
  });

  test('User can login and create SSP', async ({ page }) => {
    // Login
    await page.fill('[name="username"]', 'admin');
    await page.fill('[name="password"]', 'Admin#01010101');
    await page.click('button:has-text("Login")');
    
    // Verify login success
    await expect(page).toHaveURL(/.*localhost:3021/);
    await expect(page.locator('text=Admin')).toBeVisible();
    
    // Select catalog
    await page.click('button:has-text("NIST 800-53")');
    
    // Fill system info
    await page.fill('[name="systemName"]', 'Test System');
    
    // ... continue the workflow
    
    // Export SSP
    await page.click('button:has-text("Export SSP")');
    
    // Verify download
    const download = await page.waitForEvent('download');
    expect(download.suggestedFilename()).toContain('.json');
  });
});
```

---

## 🎯 Critical User Flows to Test

### Authentication
- ✅ Login with valid credentials
- ✅ Login with invalid credentials
- ✅ Logout
- ✅ Session timeout
- ✅ Password change

### SSP Creation
- ✅ Select catalog
- ✅ Upload existing SSP
- ✅ Fill system information
- ✅ Document controls
- ✅ Use AI suggestions
- ✅ Save progress
- ✅ Load saved SSP

### Export Functionality
- ✅ Export as JSON
- ✅ Export as PDF
- ✅ Export as Excel
- ✅ Export as CCM

### User Management (Admin)
- ✅ Create new user
- ✅ Deactivate user
- ✅ Reset password
- ✅ Change roles

### Settings
- ✅ Update AI configuration
- ✅ Configure messaging
- ✅ Change system settings

### Comparison Mode
- ✅ Upload two SSPs
- ✅ Compare changes
- ✅ Filter by change type
- ✅ Export comparison

---

## 🛠️ Running E2E Tests

```bash
# Run all E2E tests
npx playwright test

# Run in headed mode (see the browser)
npx playwright test --headed

# Run specific test file
npx playwright test tests/e2e/login.spec.js

# Debug mode (step through tests)
npx playwright test --debug

# Generate HTML report
npx playwright show-report
```

---

## 📊 Test Reports

Playwright generates detailed reports:

```bash
# After running tests
npx playwright show-report
```

Reports include:
- ✅ Screenshots on failure
- ✅ Video recordings
- ✅ Network logs
- ✅ Console logs
- ✅ Traces for debugging

---

## 🎬 Recording Demo

Let's record your first test case together:

1. **Start the app**: `npm run dev`
2. **Start Playwright codegen**: `npx playwright codegen http://localhost:3021`
3. **Navigate through your workflow** - Playwright watches everything
4. **Copy the generated code** from Playwright Inspector
5. **Save it** to a test file
6. **Run it**: `npx playwright test`

---

## 💡 Best Practices

1. **Use descriptive test names** - Clearly state what's being tested
2. **Add assertions** - Verify expected outcomes
3. **Handle async operations** - Wait for elements to load
4. **Use selectors wisely** - Prefer data-testid or role-based selectors
5. **Keep tests independent** - Each test should run standalone
6. **Clean up** - Reset state between tests
7. **Mock external services** - Don't rely on real AI APIs in tests

---

## 🔄 CI/CD Integration

E2E tests run automatically in GitHub Actions:

```yaml
- name: Install Playwright
  run: npm install @playwright/test

- name: Run E2E tests
  run: npx playwright test
```

---

## 📞 Need Help?

1. Check Playwright docs: https://playwright.dev
2. Review example tests in this folder
3. Ask the development team

---

**Happy Testing!** 🚀

