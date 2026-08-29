import { test, expect } from '@playwright/test';
import { login } from './helpers/navigation';

test.describe('Cluster Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should navigate to clusters page', async ({ page }) => {
    await page.click('text=集群管理');
    await expect(page.locator('.page-header h1')).toContainText('集群管理');
  });

  test('should display cluster list', async ({ page }) => {
    await page.click('text=集群管理');
    await expect(page.locator('.cl-card').first()).toBeVisible();
  });

  test('should open add cluster modal', async ({ page }) => {
    await page.click('text=集群管理');
    await page.click('button:has-text("新建集群")');
    const modal = page.locator('.modal-overlay').filter({ hasText: '添加集群' });
    await expect(modal).toBeVisible();
  });

  test('should display add cluster button', async ({ page }) => {
    await page.click('text=集群管理');
    const addBtn = page.locator('button:has-text("新建集群")');
    await expect(addBtn).toBeVisible();
  });

  test('should not contain admin_url and admin_key fields', async ({ page }) => {
    await page.click('text=集群管理');
    await page.click('button:has-text("新建集群")');
    const modal = page.locator('.modal-overlay').filter({ hasText: '添加集群' });
    await expect(modal).toBeVisible();
    await expect(page.locator('text=管理地址')).not.toBeVisible();
    await expect(page.locator('text=管理密钥')).not.toBeVisible();
  });

  test('should show name validation helper', async ({ page }) => {
    await page.click('text=集群管理');
    await page.click('button:has-text("新建集群")');
    const modal = page.locator('.modal-overlay').filter({ hasText: '添加集群' });
    await expect(modal).toBeVisible();
    await expect(page.locator('text=小写字母、数字、中划线组成，中划线不能在首尾')).toBeVisible();
  });

  test('should have delete button in cluster card', async ({ page }) => {
    await page.click('text=集群管理');
    const clusterCard = page.locator('.cl-card').first();
    await expect(clusterCard).toBeVisible();
    const deleteBtn = clusterCard.locator('button:has-text("删除")');
    await expect(deleteBtn).toBeVisible();
  });
});