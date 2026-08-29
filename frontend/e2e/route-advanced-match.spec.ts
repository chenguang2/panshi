import { test, expect } from '@playwright/test';
import { login, gotoResourcePage } from './helpers/navigation';

test.describe('Route Advanced Match', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should show advanced match tab in route modal', async ({ page }) => {
    await gotoResourcePage(page, '路由');
    await expect(page.locator('.route-table')).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("新建路由")').click();
    const modal = page.locator('.modal-overlay').filter({ hasText: '新建路由' });
    await expect(modal).toBeVisible();

    await expect(modal.locator('.tab-btn').filter({ hasText: '基础配置' })).toBeVisible();
    await expect(modal.locator('.tab-btn').filter({ hasText: '高级匹配' })).toBeVisible();
    await expect(modal.locator('.tab-btn').filter({ hasText: '插件管理' })).toBeVisible();

    await modal.locator('.modal-close').first().click();
  });

  test('should switch between tabs in route modal', async ({ page }) => {
    await gotoResourcePage(page, '路由');
    await expect(page.locator('.route-table')).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("新建路由")').click();
    const modal = page.locator('.modal-overlay').filter({ hasText: '新建路由' });
    await expect(modal).toBeVisible();

    const basicTab = modal.locator('.tab-btn').filter({ hasText: '基础配置' });
    const advancedTab = modal.locator('.tab-btn').filter({ hasText: '高级匹配' });
    const pluginsTab = modal.locator('.tab-btn').filter({ hasText: '插件管理' });
    await expect(basicTab).toBeVisible();
    await expect(advancedTab).toBeVisible();
    await expect(pluginsTab).toBeVisible();

    await basicTab.click();
    await expect(modal.locator('.form-group').first()).toBeVisible();

    await pluginsTab.click();
    await expect(pluginsTab).toHaveClass(/active/);
    const pluginSelector = modal.locator('.plugin-selector');
    await expect(pluginSelector).toBeVisible();

    await modal.locator('.modal-close').first().click();
  });
});