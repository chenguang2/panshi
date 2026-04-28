import { test, expect } from '@playwright/test';

test.describe('Global Plugins', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'panshi123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test('should display global plugins tab in cluster card', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1000);

    const clusterCard = page.locator('.cluster-card').first();
    await expect(clusterCard).toBeVisible();

    const globalPluginsTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '全局插件' });
    await expect(globalPluginsTab).toBeVisible();
  });

  test('should switch to global plugins tab', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1000);

    const clusterCard = page.locator('.cluster-card').first();
    const globalPluginsTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '全局插件' });
    await globalPluginsTab.click();
    await page.waitForTimeout(500);

    const globalPluginSelector = page.locator('.global-plugin-selector');
    await expect(globalPluginSelector).toBeVisible({ timeout: 5000 });
  });

  test('should show available plugins list', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1000);

    const clusterCard = page.locator('.cluster-card').first();
    const globalPluginsTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '全局插件' });
    await globalPluginsTab.click();
    await page.waitForTimeout(1000);

    const availablePluginsPanel = page.locator('.panel-header:has-text("可用插件")');
    await expect(availablePluginsPanel).toBeVisible();
  });

  test('should show configured plugins list', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1000);

    const clusterCard = page.locator('.cluster-card').first();
    const globalPluginsTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '全局插件' });
    await globalPluginsTab.click();
    await page.waitForTimeout(1000);

    const configuredPluginsPanel = page.locator('.panel-header:has-text("已配置插件")');
    await expect(configuredPluginsPanel).toBeVisible();
  });

  test('should add a plugin', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1000);

    const clusterCard = page.locator('.cluster-card').first();
    const globalPluginsTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '全局插件' });
    await globalPluginsTab.click();
    await page.waitForTimeout(1000);

    const availablePlugins = page.locator('.plugin-list').first().locator('.plugin-item');
    const count = await availablePlugins.count();

    if (count > 0) {
      const addButton = availablePlugins.first().locator('button:has-text("添加")');
      await addButton.click();
      await page.waitForTimeout(1000);

      const configuredPlugins = page.locator('.plugin-list').nth(1).locator('.plugin-item');
      await expect(configuredPlugins.first()).toBeVisible();
    }
  });

  test('should search plugins', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1000);

    const clusterCard = page.locator('.cluster-card').first();
    const globalPluginsTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '全局插件' });
    await globalPluginsTab.click();
    await page.waitForTimeout(1000);

    const searchInput = page.locator('.plugin-search input');
    await expect(searchInput).toBeVisible();

    await searchInput.fill('ip');
    await page.waitForTimeout(500);

    const pluginCards = page.locator('.plugin-list').first().locator('.plugin-item');
    const count = await pluginCards.count();
    if (count > 0) {
      const firstPluginName = await pluginCards.first().locator('.plugin-name').textContent();
      expect(firstPluginName?.toLowerCase()).toContain('ip');
    }
  });
});
