import { test, expect } from '@playwright/test';

test.describe('ClusterList Route Modal Tabs - 集群管理页路由弹窗 Tab 验证', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'panshi123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    await page.goto('/clusters');
    await page.waitForTimeout(2000);
  });

  async function openRouteModalFromClusterList(page: any) {
    await page.waitForSelector('.cluster-grid .cluster-card', { timeout: 10000 });

    const firstCard = page.locator('.cluster-grid .cluster-card').first();
    const clusterTabs = firstCard.locator('.ant-tabs');
    await clusterTabs.waitFor({ timeout: 5000 });

    await clusterTabs.locator('.ant-tabs-tab').filter({ hasText: '上游' }).click();
    await page.waitForTimeout(1500);

    await clusterTabs.locator('.ant-tabs-tab').filter({ hasText: '路由' }).click();
    await page.waitForTimeout(1000);

    await firstCard.locator('button:has-text("添加路由")').click();
    await page.waitForTimeout(800);
  }

  test('TC-CL-1: 集群管理页路由弹窗有三个 Tab，Tab1 默认激活', async ({ page }) => {
    await openRouteModalFromClusterList(page);

    await expect(page.locator('.ant-modal-content')).toBeVisible();

    const basicTab = page.locator('.ant-modal-content .ant-tabs-tab').filter({ hasText: '基础配置' });
    const advancedTab = page.locator('.ant-modal-content .ant-tabs-tab').filter({ hasText: '高级匹配' });
    const pluginsTab = page.locator('.ant-modal-content .ant-tabs-tab').filter({ hasText: '插件管理' });

    await expect(basicTab).toBeVisible();
    await expect(advancedTab).toBeVisible();
    await expect(pluginsTab).toBeVisible();

    const activeTab = page.locator('.ant-modal-content .ant-tabs-tab-active .ant-tabs-tab-btn');
    await expect(activeTab).toContainText('基础配置');

    await page.locator('.ant-modal-content button:has-text("Cancel")').click();
  });

  test('TC-CL-2: Tab2 高级匹配未启用时显示提示', async ({ page }) => {
    await openRouteModalFromClusterList(page);

    await page.locator('.ant-modal-content .ant-tabs-tab').filter({ hasText: '高级匹配' }).click();
    await page.waitForTimeout(500);

    const hint = page.locator('.advanced-disabled-hint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('高级匹配未启用');

    await page.locator('.ant-modal-content button:has-text("Cancel")').click();
  });

  test('TC-CL-3: Tab1 开启高级匹配 → Tab2 不再显示提示', async ({ page }) => {
    await openRouteModalFromClusterList(page);

    await page.locator('.ant-modal-content .ant-switch').click();
    await page.waitForTimeout(300);

    await page.locator('.ant-modal-content .ant-tabs-tab').filter({ hasText: '高级匹配' }).click();
    await page.waitForTimeout(500);

    await expect(page.locator('.advanced-tab')).toBeVisible();

    await page.locator('.ant-modal-content button:has-text("Cancel")').click();
  });
});
