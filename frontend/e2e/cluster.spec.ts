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

  test('should not contain admin_url and admin_key fields', async ({ page }) => {
    await page.click('text=集群管理');
    await page.click('text=添加集群');
    await expect(page.locator('.ant-modal')).toBeVisible();
    await expect(page.locator('text=管理地址')).not.toBeVisible();
    await expect(page.locator('text=管理密钥')).not.toBeVisible();
  });

  test('should show name validation helper', async ({ page }) => {
    await page.click('text=集群管理');
    await page.click('text=添加集群');
    await expect(page.locator('.ant-modal')).toBeVisible();
    await expect(page.locator('text=小写字母、数字、中划线组成，中划线不能在首尾')).toBeVisible();
  });

  test('should show delete confirmation modal', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1000);
    const deleteBtn = page.locator('button:has-text("删除")').first();
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      await expect(page.locator('.ant-modal-confirm')).toBeVisible();
      await expect(page.locator('text=确认删除')).toBeVisible();
    }
  });
});