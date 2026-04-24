import { test, expect } from '@playwright/test';

test.describe('Login Flow', () => {
  test('should display login page with Chinese text', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('.login-card h2')).toContainText('磐石管理后台');
    await expect(page.locator('input#username')).toBeVisible();
    await expect(page.locator('input#password')).toBeVisible();
  });

  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'panshi123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test('should show error with invalid credentials', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'wrongpassword');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000);
    await expect(page.locator('.ant-message')).toBeVisible();
  });
});