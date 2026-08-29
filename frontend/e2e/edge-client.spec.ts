import { test, expect, type Page } from '@playwright/test';
import { login } from './helpers/navigation';

test.describe('Edge Client Debug Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.click('text=Edge直连');
    await page.waitForURL('/edge-client');
  });

  /** 选择集群+节点并触发查询；无节点数据时返回 false */
  async function queryFirstNode(page: Page): Promise<boolean> {
    const clusterSelect = page.locator('select').nth(1);
    const clusterCount = await clusterSelect.locator('option').count();
    if (clusterCount <= 1) return false;
    await clusterSelect.selectOption({ index: 1 });
    await page.waitForTimeout(1000);

    const nodeSelect = page.locator('select').nth(2);
    const nodeCount = await nodeSelect.locator('option').count();
    if (nodeCount <= 1) return false;
    await nodeSelect.selectOption({ index: 1 });
    await page.waitForTimeout(800);

    await page.locator('button.btn-primary').first().click();
    await page.waitForTimeout(2000);
    return true;
  }

  test('should display warning banner', async ({ page }) => {
    await expect(page.locator('.ant-alert')).toBeVisible();
    await expect(page.locator('.ant-alert-message')).toContainText('调试模式');
  });

  test('should display resource tabs', async ({ page }) => {
    await expect(page.locator('.ant-tabs-nav >> text=上游')).toBeVisible();
    await expect(page.locator('.ant-tabs-nav >> text=路由')).toBeVisible();
    await expect(page.locator('.ant-tabs-nav >> text=全局规则')).toBeVisible();
    await expect(page.locator('.ant-tabs-nav >> text=插件组')).toBeVisible();
    await expect(page.locator('.ant-tabs-nav >> text=插件元数据')).toBeVisible();
    await expect(page.locator('.ant-tabs-nav >> text=插件列表')).toBeVisible();
  });

  test('should display node selector', async ({ page }) => {
    const modeSelect = page.locator('select').first();
    await expect(modeSelect).toBeVisible();
    const opts = await modeSelect.locator('option').allTextContents();
    expect(opts.join()).toContain('按集群选择');
    expect(opts.join()).toContain('手动输入');
  });

  test('should switch tabs', async ({ page }) => {
    await page.click('.ant-tabs-nav >> text=路由');
    await expect(page.locator('.ant-tabs-tab-active >> text=路由')).toBeVisible();

    await page.click('.ant-tabs-nav >> text=全局规则');
    await expect(page.locator('.ant-tabs-tab-active >> text=全局规则')).toBeVisible();

    await page.click('.ant-tabs-nav >> text=插件组');
    await expect(page.locator('.ant-tabs-tab-active >> text=插件组')).toBeVisible();

    await page.click('.ant-tabs-nav >> text=插件元数据');
    await expect(page.locator('.ant-tabs-tab-active >> text=插件元数据')).toBeVisible();

    await page.click('.ant-tabs-nav >> text=插件列表');
    await expect(page.locator('.ant-tabs-tab-active >> text=插件列表')).toBeVisible();

    await page.click('.ant-tabs-nav >> text=上游');
    await expect(page.locator('.ant-tabs-tab-active >> text=上游')).toBeVisible();
  });

  test('should show route table columns', async ({ page }) => {
    const hasNode = await queryFirstNode(page);
    if (!hasNode) {
      test.skip('无集群/节点数据')
      return
    }
    await page.click('.ant-tabs-nav >> text=路由');
    await expect(page.locator('.ant-table-header >> text=ID').first()).toBeVisible();
    await expect(page.locator('.ant-table-header >> text=名称').first()).toBeVisible();
    await expect(page.locator('.ant-table-header >> text=URI').first()).toBeVisible();
    await expect(page.locator('.ant-table-header >> text=方法').first()).toBeVisible();
  });

  test('should show plugin list table with index', async ({ page }) => {
    const hasNode = await queryFirstNode(page);
    if (!hasNode) {
      test.skip('无集群/节点数据')
      return
    }
    await page.click('.ant-tabs-nav >> text=插件列表');
    await expect(page.locator('.ant-table-header >> text=#').first()).toBeVisible();
    await expect(page.locator('.ant-table-header >> text=插件名称').first()).toBeVisible();
  });

  test('should open add upstream modal', async ({ page }) => {
    await page.click('button:has-text("添加上游")');
    const modal = page.locator('.modal-overlay').filter({ hasText: '添加上游' });
    await expect(modal).toBeVisible();
    await modal.locator('.modal-close').first().click();
  });

  test('should open add route modal', async ({ page }) => {
    await page.click('.ant-tabs-nav >> text=路由');
    await page.click('button:has-text("添加路由")');
    const modal = page.locator('.modal-overlay').filter({ hasText: '添加路由' });
    await expect(modal).toBeVisible();
    await modal.locator('.modal-close').first().click();
  });

  test('should open add global rule modal', async ({ page }) => {
    await page.click('.ant-tabs-nav >> text=全局规则');
    await page.click('button:has-text("添加规则")');
    const modal = page.locator('.modal-overlay').filter({ hasText: '添加全局规则' });
    await expect(modal).toBeVisible();
    await modal.locator('.modal-close').first().click();
  });

  test('should open add plugin config modal', async ({ page }) => {
    await page.click('.ant-tabs-nav >> text=插件组');
    await page.click('button:has-text("添加插件组")');
    const modal = page.locator('.modal-overlay').filter({ hasText: '添加插件组' });
    await expect(modal).toBeVisible();
    await modal.locator('.modal-close').first().click();
  });

  test('should open add plugin metadata modal', async ({ page }) => {
    await page.click('.ant-tabs-nav >> text=插件元数据');
    await page.click('button:has-text("添加插件元数据")');
    const modal = page.locator('.modal-overlay').filter({ hasText: '添加插件元数据' });
    await expect(modal).toBeVisible();
    await modal.locator('.modal-close').first().click();
  });

  test('should have reload button in plugin metadata tab', async ({ page }) => {
    await page.click('.ant-tabs-nav >> text=插件元数据');
    await expect(page.locator('button:has-text("重新加载")').first()).toBeVisible();
  });
});