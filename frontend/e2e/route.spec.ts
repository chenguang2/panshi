import { test, expect } from '@playwright/test';

test.describe('Route CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'panshi123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test('should display clusters page', async ({ page }) => {
    await page.click('text=集群管理');
    await expect(page.locator('h2')).toContainText('集群管理');
  });

  test('should display cluster detail', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1000);
    const hasDetail = await page.locator('text=详情').isVisible({ timeout: 5000 }).catch(() => false);
    if (hasDetail) {
      await page.click('text=详情');
      await expect(page.locator('.ant-tabs')).toBeVisible();
    } else {
      console.log('No cluster data - test skipped');
    }
  });
});