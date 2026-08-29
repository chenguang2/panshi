import { test, expect } from '@playwright/test';
import { login, gotoResourcePage } from './helpers/navigation';

test.describe('ClusterList Route Modal Tabs - 路由弹窗 Tab 验证', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  /** 进入路由列表并打开新建路由弹窗 */
  async function openRouteModal(page: import('@playwright/test').Page) {
    await gotoResourcePage(page, '路由');
    await expect(page.locator('.route-table')).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("新建路由")').click();
    const modal = page.locator('.modal-overlay').filter({ hasText: '新建路由' });
    await expect(modal).toBeVisible({ timeout: 5000 });
    return modal;
  }

  test('TC-CL-1: 路由弹窗有三个 Tab，基础配置默认激活', async ({ page }) => {
    const modal = await openRouteModal(page);

    const basicTab = modal.locator('.tab-btn').filter({ hasText: '基础配置' });
    const advancedTab = modal.locator('.tab-btn').filter({ hasText: '高级匹配' });
    const pluginsTab = modal.locator('.tab-btn').filter({ hasText: '插件管理' });

    await expect(basicTab).toBeVisible();
    await expect(advancedTab).toBeVisible();
    await expect(pluginsTab).toBeVisible();
    await expect(basicTab).toHaveClass(/active/);

    await modal.locator('.modal-close').first().click();
  });

  test('TC-CL-2: 高级匹配未启用时显示提示', async ({ page }) => {
    const modal = await openRouteModal(page);

    const advancedTab = modal.locator('.tab-btn').filter({ hasText: '高级匹配' });
    await advancedTab.click();
    await expect(advancedTab).toHaveClass(/active/);

    const hint = modal.locator('.advanced-disabled-hint').filter({ hasText: '高级匹配未启用' });
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('高级匹配未启用');

    await modal.locator('.modal-close').first().click();
  });

  test('TC-CL-3: 开启高级匹配后提示消失', async ({ page }) => {
    const modal = await openRouteModal(page);

    // 基础配置中开启高级匹配
    const enableToggle = modal.locator('.checkbox-label', { hasText: '开启高级匹配' });
    await enableToggle.locator('input[type="checkbox"]').check();
    await expect(enableToggle.locator('input[type="checkbox"]')).toBeChecked();

    const advancedTab = modal.locator('.tab-btn').filter({ hasText: '高级匹配' });
    await advancedTab.click();
    await expect(advancedTab).toHaveClass(/active/);

    await expect(modal.locator('.advanced-disabled-hint').filter({ hasText: '高级匹配未启用' })).toHaveCount(0);

    await modal.locator('.modal-close').first().click();
  });
});