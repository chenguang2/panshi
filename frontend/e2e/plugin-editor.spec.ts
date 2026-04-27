import { test, expect } from '@playwright/test';

test.describe('Plugin Editor - proxy-rewrite headers', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'panshi123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test('should open plugin selector in route modal', async ({ page }) => {
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

    const pluginsTab = modal.locator('.ant-tabs-tab').filter({ hasText: '插件管理' });
    await pluginsTab.click();
    await page.waitForTimeout(500);

    const pluginSelector = page.locator('.plugin-selector');
    await expect(pluginSelector).toBeVisible({ timeout: 5000 });
  });

  test('should show plugin selector in route modal', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1500);

    const clusterCard = page.locator('.cluster-card').first();
    await clusterCard.locator('.ant-tabs-tab').filter({ hasText: '路由' }).click();
    await page.waitForTimeout(500);

    const addRouteBtn = clusterCard.locator('button:has-text("添加路由")');
    await addRouteBtn.click();
    await page.waitForTimeout(500);

    const modal = page.locator('.ant-modal');
    await expect(modal).toBeVisible();

    const pluginsTab = modal.locator('.ant-tabs-tab').filter({ hasText: '插件管理' });
    await pluginsTab.click();
    await page.waitForTimeout(500);

    const pluginSelector = page.locator('.plugin-selector');
    await expect(pluginSelector).toBeVisible();
  });
});
