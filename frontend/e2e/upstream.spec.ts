import { test, expect } from '@playwright/test';

test.describe('Upstream CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input#username', 'admin');
    await page.fill('input#password', 'panshi123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test('should display clusters page', async ({ page }) => {
    await page.click('text=Clusters');
    await expect(page.locator('.ant-table').first()).toBeVisible();
  });
});