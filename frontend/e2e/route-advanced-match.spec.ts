import { test, expect } from '@playwright/test';

test.describe('Route Advanced Match', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'panshi123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test('should show advanced match tab in route modal', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1500);

    const clusterCard = page.locator('.cluster-card').first();

    const routesTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '路由' });
    await routesTab.click();
    await page.waitForTimeout(500);

    const addRouteBtn = clusterCard.locator('button:has-text("添加路由")');
    await addRouteBtn.click();
    await page.waitForTimeout(500);

    const modal = page.locator('.ant-modal');
    await expect(modal).toBeVisible();

    const basicTab = modal.locator('.ant-tabs-tab').filter({ hasText: '基础配置' });
    await expect(basicTab).toBeVisible();

    const advancedTab = modal.locator('.ant-tabs-tab').filter({ hasText: '高级匹配' });
    await expect(advancedTab).toBeVisible();

    const pluginsTab = modal.locator('.ant-tabs-tab').filter({ hasText: '插件管理' });
    await expect(pluginsTab).toBeVisible();
  });

  test('should switch between tabs in route modal', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1500);

    const clusterCard = page.locator('.cluster-card').first();

    const routesTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '路由' });
    await routesTab.click();
    await page.waitForTimeout(500);

    const addRouteBtn = clusterCard.locator('button:has-text("添加路由")');
    await addRouteBtn.click();
    await page.waitForTimeout(500);

    const modal = page.locator('.ant-modal');

    const basicTab = modal.locator('.ant-tabs-tab').filter({ hasText: '基础配置' });
    const advancedTab = modal.locator('.ant-tabs-tab').filter({ hasText: '高级匹配' });
    const pluginsTab = modal.locator('.ant-tabs-tab').filter({ hasText: '插件管理' });

    await expect(basicTab).toBeVisible();
    await expect(advancedTab).toBeVisible();
    await expect(pluginsTab).toBeVisible();

    basicTab.click();
    await page.waitForTimeout(200);
    const basicForm = modal.locator('.ant-form');
    await expect(basicForm).toBeVisible();

    pluginsTab.click();
    await page.waitForTimeout(200);
    const pluginSelector = page.locator('.plugin-selector');
    await expect(pluginSelector).toBeVisible();
  });
});
