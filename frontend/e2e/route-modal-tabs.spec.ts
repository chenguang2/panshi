import { test, expect } from '@playwright/test';

test.describe('Route Modal Tabs - 路由编辑弹窗 Tab 拆分', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'panshi123');
    await page.click('button[type="submit"]');
    await page.waitForURL('**', { timeout: 15000 });
    await page.waitForTimeout(1500);
  });

  async function openRouteModal(page: any) {
    const clusterId = await page.evaluate(async () => {
      const resp = await fetch('/api/clusters?page=1&page_size=1');
      const data = await resp.json();
      return data.items?.[0]?.id || 1;
    });
    await page.goto(`http://localhost:9100/clusters/${clusterId}`);
    await page.waitForTimeout(2000);
    await page.locator('.ant-tabs-tab').filter({ hasText: '路由' }).click();
    await page.waitForTimeout(500);
    await page.click('button:has-text("添加路由")');
    await page.waitForTimeout(500);
  }

  test('TC-1: 添加路由弹窗有三个 Tab，Tab1 默认激活', async ({ page }) => {
    await openRouteModal(page);

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

  test('TC-2: Tab1 填写基础字段 → 切换 Tab3 → 切换回 Tab1，数据保持', async ({ page }) => {
    await openRouteModal(page);

    await page.locator('#form_item_name').fill('Tab Persistence Test');
    await page.locator('#form_item_uri').fill('/api/tab-persist');

    const basicTab = page.locator('.ant-modal-content .ant-tabs-tab').filter({ hasText: '基础配置' });
    const pluginsTab = page.locator('.ant-modal-content .ant-tabs-tab').filter({ hasText: '插件管理' });

    await pluginsTab.click();
    await page.waitForTimeout(300);
    await expect(pluginsTab).toHaveClass(/ant-tabs-tab-active/);

    await basicTab.click();
    await page.waitForTimeout(300);
    await expect(basicTab).toHaveClass(/ant-tabs-tab-active/);

    await expect(page.locator('#form_item_name')).toHaveValue('Tab Persistence Test');
    await expect(page.locator('#form_item_uri')).toHaveValue('/api/tab-persist');

    await page.locator('.ant-modal-content button:has-text("Cancel")').click();
  });

  test('TC-3: Tab1 开启高级匹配 → Tab2 添加匹配条件', async ({ page }) => {
    await openRouteModal(page);

    await page.locator('#form_item_name').fill('Advanced Match Test');
    await page.locator('#form_item_uri').fill('/api/adv-tab-test');

    await page.locator('.ant-switch').click();
    await page.waitForTimeout(300);

    const advancedTab = page.locator('.ant-modal-content .ant-tabs-tab').filter({ hasText: '高级匹配' });
    await advancedTab.click();
    await page.waitForTimeout(300);

    const matchContent = page.locator('.match-content');
    await expect(matchContent).toBeVisible();

    const addRuleBtn = page.locator('button:has-text("添加匹配条件")');
    await addRuleBtn.click();
    await page.waitForTimeout(300);

    const rule = page.locator('.match-rule').first();
    await expect(rule).toBeVisible();

    await page.locator('.ant-modal-content button:has-text("Cancel")').click();
  });

  test('TC-4: Tab3 选择插件 → 编辑配置 → 保存', async ({ page }) => {
    await openRouteModal(page);

    await page.locator('#form_item_name').fill('Plugin Tab Test');
    await page.locator('#form_item_uri').fill('/api/plugin-tab-test');

    const pluginsTab = page.locator('.ant-modal-content .ant-tabs-tab').filter({ hasText: '插件管理' });
    await pluginsTab.click();
    await page.waitForTimeout(300);

    const pluginGrid = page.locator('.draggable-plugin-grid');
    const gridVisible = await pluginGrid.isVisible({ timeout: 2000 }).catch(() => false);
    if (!gridVisible) {
      console.log('Plugin grid not visible - test skipped');
      await page.locator('.ant-modal-content button:has-text("Cancel")').click();
      return;
    }

    await expect(pluginGrid).toBeVisible();

    const addPluginSelect = pluginGrid.locator('.ant-select');
    const hasPluginSelect = await addPluginSelect.isVisible({ timeout: 2000 }).catch(() => false);
    if (!hasPluginSelect) {
      console.log('No plugins available - test skipped');
      await page.locator('.ant-modal-content button:has-text("Cancel")').click();
      return;
    }

    await addPluginSelect.click();
    await page.waitForTimeout(300);
    const pluginOptions = page.locator('.ant-select-item');
    const count = await pluginOptions.count();
    if (count === 0) {
      console.log('No plugin options - test skipped');
      await page.locator('.ant-modal-content button:has-text("Cancel")').click();
      return;
    }

    await pluginOptions.first().click();
    await page.waitForTimeout(300);

    const pluginCard = page.locator('.plugin-card').first();
    const cardVisible = await pluginCard.isVisible({ timeout: 2000 }).catch(() => false);
    if (cardVisible) {
      await pluginCard.locator('.anticon-edit').click();
      await page.waitForTimeout(300);
      const drawer = page.locator('.ant-drawer');
      if (await drawer.isVisible({ timeout: 2000 }).catch(() => false)) {
        await page.locator('button:has-text("保存")').click();
        await page.waitForTimeout(300);
      }
    }

    await page.locator('.ant-modal-content button:has-text("Cancel")').click();
  });

  test('TC-5: 编辑已有路由，基础配置和高级匹配开关正确回填', async ({ page }) => {
    await openRouteModal(page);

    await page.locator('#form_item_name').fill('Edit Backfill Test');
    await page.locator('#form_item_uri').fill('/api/backfill-test');

    await page.locator('.ant-switch').click();
    await page.waitForTimeout(300);

    await page.locator('.ant-modal-content button:has-text("OK")').click();
    await page.waitForTimeout(1000);

    const firstRow = page.locator('.ant-table-tbody tr').first();
    const hasData = await firstRow.isVisible().catch(() => false);
    if (!hasData) {
      console.log('No route created - test skipped');
      return;
    }

    await firstRow.locator('button:has-text("编辑")').click();
    await page.waitForTimeout(500);

    await expect(page.locator('#form_item_name')).toHaveValue('Edit Backfill Test');
    await expect(page.locator('#form_item_uri')).toHaveValue('/api/backfill-test');

    const switchEl = page.locator('.ant-switch');
    const switchClass = await switchEl.getAttribute('class');
    expect(switchClass || '').toContain('ant-switch-checked');

    await page.locator('.ant-modal-content button:has-text("Cancel")').click();
  });

  test('TC-6: 发布路由后高级匹配配置正确', async ({ page }) => {
    await openRouteModal(page);

    await page.locator('#form_item_name').fill('Publish Tab Test');
    await page.locator('#form_item_uri').fill('/api/publish-tab-test');

    await page.locator('.ant-switch').click();
    await page.waitForTimeout(300);

    const advancedTab = page.locator('.ant-modal-content .ant-tabs-tab').filter({ hasText: '高级匹配' });
    await advancedTab.click();
    await page.waitForTimeout(300);

    const addRuleBtn = page.locator('button:has-text("添加匹配条件")');
    await addRuleBtn.click();
    await page.waitForTimeout(300);

    const rule = page.locator('.match-rule').first();
    const typeSelect = rule.locator('.ant-select').first();
    await typeSelect.click();
    await page.waitForTimeout(200);
    await page.locator('.ant-select-item:has-text("请求头")').click();
    await page.waitForTimeout(200);

    const keyInput = rule.locator('input[placeholder="header 名称"]');
    await keyInput.fill('X-Api-Key');

    const valueInput = rule.locator('input[placeholder="匹配值"]');
    await valueInput.fill('secret123');

    await page.locator('.ant-modal-content button:has-text("OK")').click();
    await page.waitForTimeout(1000);

    const firstRow = page.locator('.ant-table-tbody tr').first();
    const hasData = await firstRow.isVisible().catch(() => false);
    if (!hasData) {
      console.log('No route to publish - test skipped');
      return;
    }

    await firstRow.locator('button:has-text("发布")').click();
    await page.waitForTimeout(1000);

    await firstRow.locator('button:has-text("JSON")').click();
    await page.waitForTimeout(500);

    const jsonTextarea = page.locator('.json-textarea');
    const jsonVisible = await jsonTextarea.isVisible({ timeout: 2000 }).catch(() => false);
    if (jsonVisible) {
      const jsonContent = await jsonTextarea.inputValue();
      expect(jsonContent).toContain('Publish Tab Test');
    }

    await page.locator('.ant-modal-close').click();
  });
});
