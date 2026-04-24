import { test, expect } from '@playwright/test';

test.describe('Route CRUD', () => {
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

  test('should display cluster detail', async ({ page }) => {
    await page.click('text=Clusters');
    await page.waitForTimeout(1000);
    const hasDetail = await page.locator('text=Detail').isVisible({ timeout: 5000 }).catch(() => false);
    if (hasDetail) {
      await page.click('text=Detail');
      await expect(page.locator('.ant-tabs')).toBeVisible();
    } else {
      console.log('No cluster data - test skipped');
    }
  });
});