import { test, expect } from '@playwright/test';

test.describe('Cluster Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('input#username', 'admin');
    await page.fill('input#password', 'panshi123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test('should navigate to clusters page', async ({ page }) => {
    await page.click('text=Clusters');
    await expect(page.locator('h2')).toContainText('Cluster Management');
  });

  test('should display cluster list', async ({ page }) => {
    await page.click('text=Clusters');
    await expect(page.locator('.ant-table')).toBeVisible();
  });

  test('should open add cluster modal', async ({ page }) => {
    await page.click('text=Clusters');
    await page.click('text=Add Cluster');
    await expect(page.locator('.ant-modal')).toBeVisible();
  });
});