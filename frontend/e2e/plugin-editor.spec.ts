import { test, expect } from '@playwright/test';
import { login, gotoResourcePage } from './helpers/navigation';

test.describe('Plugin Editor - proxy-rewrite headers', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should open plugin selector in route modal', async ({ page }) => {
    await gotoResourcePage(page, '路由');
    const table = page.locator('.route-table');
    await expect(table).toBeVisible({ timeout: 10000 });

    await page.locator('button:has-text("新建路由")').click();
    const modal = page.locator('.modal-overlay').filter({ hasText: '新建路由' });
    await expect(modal).toBeVisible();

    // 切到插件管理 Tab，并等待其真正激活（v-show 切换 + 插件异步加载）
    const pluginsTab = modal.locator('.tab-btn').filter({ hasText: '插件管理' });
    await pluginsTab.click();
    await expect(pluginsTab).toHaveClass(/active/);

    const pluginSelector = modal.locator('.plugin-selector');
    await expect(pluginSelector).toBeVisible({ timeout: 8000 });

    await modal.locator('.modal-close').first().click();
  });

  test('should show plugin selector in route modal', async ({ page }) => {
    await gotoResourcePage(page, '路由');
    const table = page.locator('.route-table');
    await expect(table).toBeVisible({ timeout: 10000 });

    await page.locator('button:has-text("新建路由")').click();
    const modal = page.locator('.modal-overlay').filter({ hasText: '新建路由' });
    await expect(modal).toBeVisible();

    const pluginsTab = modal.locator('.tab-btn').filter({ hasText: '插件管理' });
    await pluginsTab.click();
    await expect(pluginsTab).toHaveClass(/active/);

    const pluginSelector = modal.locator('.plugin-selector');
    await expect(pluginSelector).toBeVisible({ timeout: 8000 });

    await modal.locator('.modal-close').first().click();
  });
});