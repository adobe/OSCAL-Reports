/**
 * Example E2E Test - Recorded with Playwright Codegen
 * 
 * This is an example of what Playwright codegen generates
 * when you interact with your application.
 * 
 * To record your own tests:
 * 1. Start app: npm run dev
 * 2. Run: npx playwright codegen http://localhost:3021
 * 3. Interact with the app - Playwright records everything!
 * 4. Copy generated code and save it here
 */

import { test, expect } from '@playwright/test';

test.describe('OSCAL Report Generator - User Workflows', () => {
  
  test('Complete Login Flow', async ({ page }) => {
    // Navigate to application
    await page.goto('http://localhost:3021');
    
    // Verify login page is displayed
    await expect(page.locator('h1')).toContainText('OSCAL');
    
    // Fill in credentials
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('Admin#01010101');
    
    // Click login button
    await page.getByRole('button', { name: /login/i }).click();
    
    // Wait for navigation and verify logged in
    await expect(page).toHaveURL(/.*localhost:3021/);
    
    // Verify user is logged in (look for user indicator)
    await expect(page.locator('text=admin')).toBeVisible({ timeout: 5000 });
  });

  test('Navigate to Settings', async ({ page }) => {
    // Login first
    await page.goto('http://localhost:3021');
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('Admin#01010101');
    await page.getByRole('button', { name: /login/i }).click();
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Click settings button
    await page.getByRole('button', { name: /settings/i }).click();
    
    // Verify settings modal or page is displayed
    await expect(page.locator('text=Settings')).toBeVisible();
  });

  test('Access User Management (Admin Only)', async ({ page }) => {
    // Login as admin
    await page.goto('http://localhost:3021');
    await page.getByLabel('Username').fill('admin');
    await page.getByLabel('Password').fill('Admin#01010101');
    await page.getByRole('button', { name: /login/i }).click();
    
    await page.waitForLoadState('networkidle');
    
    // Navigate to settings
    await page.getByRole('button', { name: /settings/i }).click();
    
    // Click on User Management (if visible for admin)
    const userManagementButton = page.locator('button:has-text("User Management")');
    if (await userManagementButton.isVisible()) {
      await userManagementButton.click();
      
      // Verify user management interface is displayed
      await expect(page.locator('text=User Management')).toBeVisible();
      await expect(page.getByRole('button', { name: /add.*user/i })).toBeVisible();
    }
  });

  test('Catalog Selection Flow', async ({ page }) => {
    // Login
    await page.goto('http://localhost:3021');
    await page.getByLabel('Username').fill('user');
    await page.getByLabel('Password').fill('User#01010101');
    await page.getByRole('button', { name: /login/i }).click();
    
    await page.waitForLoadState('networkidle');
    
    // Look for catalog selection
    const catalogButton = page.locator('button:has-text("NIST")').first();
    if (await catalogButton.isVisible()) {
      await catalogButton.click();
      
      // Verify controls are loaded
      await expect(page.locator('text=Control')).toBeVisible({ timeout: 10000 });
    }
  });

  test('Logout Flow', async ({ page }) => {
    // Login
    await page.goto('http://localhost:3021');
    await page.getByLabel('Username').fill('user');
    await page.getByLabel('Password').fill('User#01010101');
    await page.getByRole('button', { name: /login/i }).click();
    
    await page.waitForLoadState('networkidle');
    
    // Find and click logout button
    const logoutButton = page.locator('button:has-text("Logout")').or(
      page.locator('button:has-text("Sign Out")')
    );
    
    if (await logoutButton.isVisible()) {
      await logoutButton.click();
      
      // Verify redirected to login
      await expect(page.getByLabel('Username')).toBeVisible();
    }
  });
});

/**
 * INSTRUCTIONS FOR RECORDING YOUR OWN TESTS:
 * 
 * 1. Make sure your app is running:
 *    npm run dev
 * 
 * 2. In a new terminal, run Playwright codegen:
 *    npx playwright codegen http://localhost:3021
 * 
 * 3. A browser window opens with Playwright Inspector
 * 
 * 4. Interact with your app:
 *    - Click buttons
 *    - Fill forms
 *    - Navigate pages
 *    - Upload files
 *    - Everything you do is recorded!
 * 
 * 5. Playwright Inspector shows generated code in real-time
 * 
 * 6. Add assertions by clicking "Assert" in Inspector:
 *    - Assert text is visible
 *    - Assert element exists
 *    - Assert URL contains text
 *    - And more!
 * 
 * 7. Copy the generated code and save it to a .spec.js file
 * 
 * 8. Run your test:
 *    npx playwright test example-recorded.spec.js
 * 
 * 9. View the report:
 *    npx playwright show-report
 */

