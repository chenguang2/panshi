import { test, expect } from '@playwright/test';

test.describe('Edge Client Debug Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'panshi123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
    await page.click('text=边缘节点');
    await page.waitForURL('/edge-client');
  });

  test('should display warning banner', async ({ page }) => {
    await expect(page.locator('.ant-alert')).toBeVisible();
    await expect(page.locator('.ant-alert-message')).toContainText('调试模式');
  });

  test('should display all 6 tabs', async ({ page }) => {
    await expect(page.locator('.ant-tabs-nav >> text=上游')).toBeVisible();
    await expect(page.locator('.ant-tabs-nav >> text=路由')).toBeVisible();
    await expect(page.locator('.ant-tabs-nav >> text=全局规则')).toBeVisible();
    await expect(page.locator('.ant-tabs-nav >> text=插件组')).toBeVisible();
    await expect(page.locator('.ant-tabs-nav >> text=插件数据')).toBeVisible();
    await expect(page.locator('.ant-tabs-nav >> text=插件列表')).toBeVisible();
  });

  test('should display node selector', async ({ page }) => {
    await expect(page.locator('.ant-radio-group')).toBeVisible();
    await expect(page.locator('text=按集群选择')).toBeVisible();
    await expect(page.locator('text=手动输入')).toBeVisible();
  });

  test('should display refresh button', async ({ page }) => {
    await expect(page.locator('button:has-text("刷新")')).toBeVisible();
  });

  test('should switch tabs', async ({ page }) => {
    await page.click('.ant-tabs-nav >> text=路由');
    await expect(page.locator('.ant-tabs-tab-active >> text=路由')).toBeVisible();

    await page.click('.ant-tabs-nav >> text=全局规则');
    await expect(page.locator('.ant-tabs-tab-active >> text=全局规则')).toBeVisible();

    await page.click('.ant-tabs-nav >> text=插件组');
    await expect(page.locator('.ant-tabs-tab-active >> text=插件组')).toBeVisible();

    await page.click('.ant-tabs-nav >> text=插件数据');
    await expect(page.locator('.ant-tabs-tab-active >> text=插件数据')).toBeVisible();

    await page.click('.ant-tabs-nav >> text=插件列表');
    await expect(page.locator('.ant-tabs-tab-active >> text=插件列表')).toBeVisible();

    await page.click('.ant-tabs-nav >> text=上游');
    await expect(page.locator('.ant-tabs-tab-active >> text=上游')).toBeVisible();
  });

  test('should show upstream table columns', async ({ page }) => {
    await expect(page.locator('.ant-table-header >> text=ID')).toBeVisible();
    await expect(page.locator('.ant-table-header >> text=名称')).toBeVisible();
    await expect(page.locator('.ant-table-header >> text=类型')).toBeVisible();
    await expect(page.locator('.ant-table-header >> text=节点数')).toBeVisible();
    await expect(page.locator('.ant-table-header >> text=操作')).toBeVisible();
  });

  test('should show route table columns', async ({ page }) => {
    await page.click('.ant-tabs-nav >> text=路由');
    await expect(page.locator('.ant-table-header >> text=ID')).toBeVisible();
    await expect(page.locator('.ant-table-header >> text=名称')).toBeVisible();
    await expect(page.locator('.ant-table-header >> text=URI')).toBeVisible();
    await expect(page.locator('.ant-table-header >> text=方法')).toBeVisible();
    await expect(page.locator('.ant-table-header >> text=上游')).toBeVisible();
  });

  test('should show plugin list table with index', async ({ page }) => {
    await page.click('.ant-tabs-nav >> text=插件列表');
    await expect(page.locator('.ant-table-header >> text=序号')).toBeVisible();
    await expect(page.locator('.ant-table-header >> text=插件名称')).toBeVisible();
  });

  test('should open add upstream modal', async ({ page }) => {
    await page.click('button:has-text("添加上游")');
    await expect(page.locator('.ant-modal-header >> text=创建上游')).toBeVisible();
    await expect(page.locator('input[placeholder="上游名称"]')).toBeVisible();
    await page.click('.ant-modal-close');
  });

  test('should open add route modal', async ({ page }) => {
    await page.click('.ant-tabs-nav >> text=路由');
    await page.click('button:has-text("添加路由")');
    await expect(page.locator('.ant-modal-header >> text=创建路由')).toBeVisible();
    await page.click('.ant-modal-close');
  });

  test('should open add global rule modal', async ({ page }) => {
    await page.click('.ant-tabs-nav >> text=全局规则');
    await page.click('button:has-text("添加规则")');
    await expect(page.locator('.ant-modal-header >> text=创建全局规则')).toBeVisible();
    await page.click('.ant-modal-close');
  });

  test('should open add plugin config modal', async ({ page }) => {
    await page.click('.ant-tabs-nav >> text=插件组');
    await page.click('button:has-text("添加插件组")');
    await expect(page.locator('.ant-modal-header >> text=创建插件组')).toBeVisible();
    await page.click('.ant-modal-close');
  });

  test('should open add plugin metadata modal', async ({ page }) => {
    await page.click('.ant-tabs-nav >> text=插件数据');
    await page.click('button:has-text("添加插件数据")');
    await expect(page.locator('.ant-modal-header >> text=创建插件数据')).toBeVisible();
    await expect(page.locator('input[placeholder*="log_process"]')).toBeVisible();
    await page.click('.ant-modal-close');
  });

  test('should have reload button in plugin metadata tab', async ({ page }) => {
    await page.click('.ant-tabs-nav >> text=插件数据');
    await expect(page.locator('button:has-text("重新加载")')).toBeVisible();
  });
});