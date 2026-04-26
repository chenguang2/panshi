import { test, expect } from '@playwright/test';

test.describe('Route Advanced Match', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'panshi123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test('should toggle and configure advanced match conditions', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1000);

    const hasCluster = await page.locator('text=详情').isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasCluster) {
      await page.click('text=新建');
      await page.waitForTimeout(500);
      await page.fill('input[placeholder="请输入集群名称"]', 'Test Cluster AM');
      await page.fill('input[placeholder="请输入描述信息"]', 'Test cluster for advanced match');
      await page.click('button:has-text("确定")');
      await page.waitForTimeout(1000);
    }

    await page.locator('text=详情').first().click();
    await page.waitForTimeout(500);

    const upstreamTab = page.locator('.ant-tabs-tab').filter({ hasText: '上游' });
    await upstreamTab.click();
    await page.waitForTimeout(500);

    const hasUpstream = await page.locator('text=编辑').first().isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasUpstream) {
      await page.click('text=新建上游');
      await page.waitForTimeout(500);
      await page.fill('input[placeholder="请输入上游名称"]', 'Test Upstream AM');
      await page.locator('input[id="upstream_type"]').click();
      await page.locator('.ant-select-item:has-text("roundrobin")').click();
      await page.fill('input[placeholder="如: 127.0.0.1:8080"]', '127.0.0.1:8080');
      await page.click('button:has-text("确定")');
      await page.waitForTimeout(1000);
    }

    const routesTab = page.locator('.ant-tabs-tab').filter({ hasText: '路由' });
    await routesTab.click();
    await page.waitForTimeout(500);

    await page.click('text=新建路由');
    await page.waitForTimeout(500);

    await page.fill('input[placeholder="如: /api/*"]', '/test-advanced-match');
    await page.locator('input[id="route_name"]').fill('Test Advanced Match Route');

    const upstreamSelect = page.locator('label:has-text("上游")').locator('..').locator('.ant-select');
    if (await upstreamSelect.isVisible()) {
      await upstreamSelect.click();
      await page.waitForTimeout(300);
      await page.locator('.ant-select-item').first().click();
    }

    const basicTab = page.locator('.ant-tabs-tab').filter({ hasText: '基础配置' });
    await expect(basicTab).toBeVisible();

    const advancedTab = page.locator('.ant-tabs-tab').filter({ hasText: '高级匹配' });
    await expect(advancedTab).toBeVisible();

    const pluginsTab = page.locator('.ant-tabs-tab').filter({ hasText: '插件配置' });
    await expect(pluginsTab).toBeVisible();

    advancedTab.click();
    await page.waitForTimeout(300);

    const advancedMatchSection = page.locator('.route-advanced-match');
    await expect(advancedMatchSection).toBeVisible();

    const enableSwitch = advancedMatchSection.locator('.ant-switch');
    await expect(enableSwitch).toBeVisible();

    await enableSwitch.click();
    await page.waitForTimeout(300);

    const matchContent = advancedMatchSection.locator('.match-content');
    await expect(matchContent).toBeVisible();

    const priorityInput = matchContent.locator('input[type="number"]');
    await expect(priorityInput).toBeVisible();
    await priorityInput.fill('100');

    const addRuleBtn = matchContent.locator('button:has-text("添加匹配条件")');
    await expect(addRuleBtn).toBeVisible();
    await addRuleBtn.click();
    await page.waitForTimeout(300);

    const rule = matchContent.locator('.match-rule').first();
    await expect(rule).toBeVisible();

    const typeSelect = rule.locator('.ant-select').first();
    await typeSelect.click();
    await page.waitForTimeout(200);
    await page.locator('.ant-select-item:has-text("请求头")').click();
    await page.waitForTimeout(200);

    const keyInput = rule.locator('input[placeholder="header 名称"]');
    await keyInput.fill('Host');

    const valueInput = rule.locator('input[placeholder="匹配值"]');
    await valueInput.fill('example.com');

    await page.click('button:has-text("确定")');
    await page.waitForTimeout(500);

    advancedTab.click();
    await page.waitForTimeout(300);

    const enabledSwitch = advancedMatchSection.locator('.ant-switch');
    const isEnabled = await enabledSwitch.locator('..').getAttribute('class');
    expect(isEnabled).toContain('ant-switch-checked');
  });

  test('should switch between tabs correctly', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1000);

    const hasCluster = await page.locator('text=详情').isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasCluster) {
      await page.click('text=新建');
      await page.waitForTimeout(500);
      await page.fill('input[placeholder="请输入集群名称"]', 'Test Cluster Tab');
      await page.fill('input[placeholder="请输入描述信息"]', 'Test cluster for tab switching');
      await page.click('button:has-text("确定")');
      await page.waitForTimeout(1000);
    }

    await page.locator('text=详情').first().click();
    await page.waitForTimeout(500);

    const routesTab = page.locator('.ant-tabs-tab').filter({ hasText: '路由' });
    await routesTab.click();
    await page.waitForTimeout(500);

    await page.click('text=新建路由');
    await page.waitForTimeout(500);

    const basicTab = page.locator('.ant-tabs-tab').filter({ hasText: '基础配置' });
    const advancedTab = page.locator('.ant-tabs-tab').filter({ hasText: '高级匹配' });
    const pluginsTab = page.locator('.ant-tabs-tab').filter({ hasText: '插件配置' });

    await expect(basicTab).toBeVisible();
    await expect(advancedTab).toBeVisible();
    await expect(pluginsTab).toBeVisible();

    await basicTab.click();
    await page.waitForTimeout(200);
    const basicForm = page.locator('.ant-form');
    await expect(basicForm).toBeVisible();

    await pluginsTab.click();
    await page.waitForTimeout(200);
    const pluginSelector = page.locator('.two-column-plugin-selector');
    await expect(pluginSelector).toBeVisible();

    await page.locator('button:has-text("取消")').click();
  });
});
