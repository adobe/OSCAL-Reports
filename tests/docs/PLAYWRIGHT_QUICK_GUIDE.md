# Playwright Inspector - Quick Guide

## 🎬 How to Record and Save Tests

### Step-by-Step Process

---

## Step 1: Start Your Application

Open Terminal 1:
```bash
cd /Users/mkesharw/Documents/OSCAL_Reports
npm run dev
```

Wait until you see:
```
VITE ready in XXX ms
Local: http://localhost:3021
```

---

## Step 2: Open Playwright Inspector (Codegen)

Open Terminal 2:
```bash
cd /Users/mkesharw/Documents/OSCAL_Reports
npx playwright codegen http://localhost:3021
```

**What Opens:**

1. **Browser Window** (left side)
   - This is where you interact with your app
   - Everything you do here is recorded

2. **Playwright Inspector** (right side)
   - Shows generated code in real-time
   - Has toolbar with buttons
   - Code appears as you interact

---

## Step 3: Use the Playwright Inspector Interface

### Playwright Inspector Layout

```
┌─────────────────────────────────────────┐
│  Playwright Inspector                   │
├─────────────────────────────────────────┤
│  [Record] [Pause] [Resume] [Step Over] │  ← Toolbar
│  [Assert] [Pick Locator] [Copy]        │
├─────────────────────────────────────────┤
│                                         │
│  Generated Code:                        │
│                                         │
│  import { test, expect } from '@pl...  │
│                                         │
│  test('test', async ({ page }) => {    │
│    await page.goto('http://...');      │
│    await page.click('button#login');   │
│    // ... more code appears as you     │
│    // interact with the browser!       │
│  });                                    │
│                                         │
│                                         │
└─────────────────────────────────────────┘
```

### Important Buttons

- **🔴 Record** - Click to start/stop recording (usually auto-starts)
- **⏸️ Pause** - Pause recording temporarily
- **▶️ Resume** - Resume recording
- **Assert** - Add verification checks (element exists, text visible, etc.)
- **Pick Locator** - Find the selector for an element
- **📋 Copy** - Copy all generated code

---

## Step 4: Record Your Workflow

In the **Browser Window** (left), interact with your app:

1. Click "Login"
2. Enter username: `admin`
3. Enter password: `Admin#01010101`
4. Click "Login" button
5. Navigate to "User Management"
6. Click "Add User"
7. ... etc.

Watch the **Playwright Inspector** (right) - code appears automatically!

---

## Step 5: Add Assertions (Optional but Recommended)

To add verification checks:

1. Click the **"Assert"** button in the Inspector
2. Click on an element in the browser you want to verify
3. Choose assertion type:
   - ✅ "is visible"
   - ✅ "has text"
   - ✅ "has value"
   - ✅ "is checked"
   - etc.

This adds code like:
```javascript
await expect(page.locator('text=Welcome')).toBeVisible();
```

---

## Step 6: Copy the Generated Code

### Option 1: Use Copy Button

1. Look at the **Playwright Inspector** toolbar
2. Find the **📋 Copy** button
3. Click it - all code is copied to clipboard!

### Option 2: Select and Copy

1. Click in the code area
2. Select all (Cmd+A on Mac, Ctrl+A on Windows)
3. Copy (Cmd+C or Ctrl+C)

---

## Step 7: Save to .spec.js File

### Method A: Using Cursor/IDE

1. In your IDE, create new file:
   ```
   tests/e2e/my-workflow.spec.js
   ```

2. Paste the copied code (Cmd+V or Ctrl+V)

3. Clean up the code:
   - Add descriptive test names
   - Add comments
   - Organize into test.describe blocks

### Method B: Using Terminal

```bash
# Create the file
touch tests/e2e/my-workflow.spec.js

# Open in editor
code tests/e2e/my-workflow.spec.js
# or
nano tests/e2e/my-workflow.spec.js

# Paste the code and save
```

---

## Step 8: Run Your Test

```bash
# Run the specific test
npx playwright test tests/e2e/my-workflow.spec.js

# Run in headed mode (see the browser)
npx playwright test tests/e2e/my-workflow.spec.js --headed

# Debug mode (step through)
npx playwright test tests/e2e/my-workflow.spec.js --debug
```

---

## Example: Complete Recording Session

### What You See in Inspector

```javascript
import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  // This code appears automatically as you interact!
  
  await page.goto('http://localhost:3021/');
  await page.getByLabel('Username').click();
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').click();
  await page.getByLabel('Password').fill('Admin#01010101');
  await page.getByRole('button', { name: 'Login' }).click();
  
  // If you clicked "Assert" and checked for "Welcome" text:
  await expect(page.locator('text=Welcome')).toBeVisible();
  
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'User Management' }).click();
});
```

### After Cleaning Up and Saving

```javascript
import { test, expect } from '@playwright/test';

test.describe('User Management Flow', () => {
  test('Admin can access user management', async ({ page }) => {
    // Navigate to application
    await page.goto('http://localhost:3021/');
    
    // Login as admin
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('Admin#01010101');
    await page.getByRole('button', { name: 'Login' }).click();
    
    // Verify login success
    await expect(page.locator('text=Welcome')).toBeVisible();
    
    // Navigate to User Management
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'User Management' }).click();
    
    // Verify User Management page loaded
    await expect(page.locator('h2:has-text("User Management")')).toBeVisible();
  });
});
```

---

## Troubleshooting

### Inspector Doesn't Open

**Problem:** Only browser opens, no Inspector window

**Solution:**
```bash
# Make sure you have the latest version
npm install --save-dev @playwright/test@latest

# Try opening Inspector separately
npx playwright codegen
# Then navigate manually in the browser to localhost:3021
```

### Can't Find Copy Button

**Problem:** Can't see the Copy button in Inspector

**Solution:**
- Look at the top toolbar of the Inspector window
- The copy icon looks like: 📋 or two overlapping squares
- Alternative: Click in code area, Cmd+A (select all), Cmd+C (copy)

### Code Not Appearing

**Problem:** Interacting but no code generates

**Solution:**
1. Check if **Record** button is enabled (should be red/active)
2. Click **Record** button to start recording
3. Make sure you're interacting in the Playwright browser, not your regular browser

### Inspector Window Hidden

**Problem:** Inspector window disappeared

**Solution:**
- Check your taskbar/dock for the Inspector window
- On Mac: Look in Window menu or use Mission Control
- On Windows: Alt+Tab to find it
- Restart: Close browser and run `npx playwright codegen` again

---

## Pro Tips

### 1. Generate Better Locators

Click **"Pick Locator"** button, then click an element to see its selector:
```javascript
// Playwright shows you:
page.locator('#user-menu')
page.getByRole('button', { name: 'Submit' })
page.getByText('Welcome Admin')
```

### 2. Record Multiple Scenarios

You can record different workflows in sequence:
1. Record login flow → Copy → Save as `login.spec.js`
2. Click **Clear** or start fresh
3. Record SSP creation → Copy → Save as `ssp-creation.spec.js`

### 3. Mobile Recording

Record mobile interactions:
```bash
# iPhone
npx playwright codegen --device="iPhone 12" http://localhost:3021

# Android
npx playwright codegen --device="Pixel 5" http://localhost:3021
```

### 4. Save Inspector Output Directly

You can also redirect output to a file:
```bash
npx playwright codegen http://localhost:3021 --target javascript -o tests/e2e/recorded.spec.js
```

The code is saved directly to the file!

---

## Visual Guide

### Where Everything Is

```
Your Screen:
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌──────────────────────┐    ┌─────────────────────────┐  │
│  │                      │    │ Playwright Inspector    │  │
│  │   Browser Window     │    │ ────────────────────── │  │
│  │                      │    │ 🔴 📋 ⏸️ ▶️            │  │
│  │   YOUR APP HERE      │    │ ────────────────────── │  │
│  │                      │    │                         │  │
│  │   [Login]            │    │ import { test } ...     │  │
│  │   Username: [____]   │    │                         │  │
│  │   Password: [____]   │    │ test('test', async     │  │
│  │   [Submit]           │    │   ({ page }) => {      │  │
│  │                      │    │   await page.goto(...) │  │
│  │   👆 Click here      │    │   await page.click...  │  │
│  │                      │    │                         │  │
│  │                      │    │ ← Code appears here!   │  │
│  └──────────────────────┘    └─────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Quick Command Reference

```bash
# Basic recording
npx playwright codegen http://localhost:3021

# Save directly to file
npx playwright codegen http://localhost:3021 -o tests/e2e/my-test.spec.js

# Mobile device
npx playwright codegen --device="iPhone 12" http://localhost:3021

# Custom browser
npx playwright codegen --browser=firefox http://localhost:3021

# With authentication
npx playwright codegen --save-storage=auth.json http://localhost:3021
```

---

## Summary

**To Save Your Recorded Test:**

1. ✅ Start app: `npm run dev`
2. ✅ Start recording: `npx playwright codegen http://localhost:3021`
3. ✅ Interact with your app in the browser
4. ✅ Watch code generate in **Inspector** (right window)
5. ✅ Click **📋 Copy** button in Inspector
6. ✅ Create file: `tests/e2e/my-test.spec.js`
7. ✅ Paste the code (Cmd+V)
8. ✅ Save the file
9. ✅ Run: `npx playwright test tests/e2e/my-test.spec.js`

**That's it!** 🎉

---

Need more help? Check:
- Official Docs: https://playwright.dev/docs/codegen
- Video Tutorial: https://playwright.dev/docs/codegen-intro
- Our Guide: `docs/RECORDING_TESTS.md`

