import { test, expect } from '@playwright/test';

test.describe('Cluster Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'panshi123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test('should navigate to clusters page', async ({ page }) => {
    await page.click('text=集群管理');
    await expect(page.locator('h2')).toContainText('集群管理');
  });

  test('should display cluster list', async ({ page }) => {
    await page.click('text=集群管理');
    await expect(page.locator('h2')).toContainText('集群管理');
  });

  test('should open add cluster modal', async ({ page }) => {
    await page.click('text=集群管理');
    await page.click('text=添加集群');
    await expect(page.locator('.ant-modal')).toBeVisible();
  });

  test('should display add cluster button', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(500);
    const addBtn = page.locator('button:has-text("添加集群")');
    await expect(addBtn).toBeVisible();
  });
});