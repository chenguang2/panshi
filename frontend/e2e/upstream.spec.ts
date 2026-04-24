import { test, expect } from '@playwright/test';

test.describe('Upstream CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'panshi123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test('should display clusters page', async ({ page }) => {
    await page.click('text=集群管理');
    await expect(page.locator('.cluster-card').first()).toBeVisible();
  });
});