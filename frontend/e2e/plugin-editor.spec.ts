import { test, expect } from '@playwright/test';

test.describe('Plugin Editor - proxy-rewrite headers', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'panshi123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test('should add and save set/add/remove headers in proxy-rewrite plugin', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1000);

    const hasCluster = await page.locator('text=详情').isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasCluster) {
      await page.click('text=新建');
      await page.waitForTimeout(500);
      await page.fill('input[placeholder="请输入集群名称"]', 'Test Cluster');
      await page.fill('input[placeholder="请输入描述信息"]', 'Test cluster for plugin');
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
      await page.fill('input[placeholder="请输入上游名称"]', 'Test Upstream');
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

    await page.fill('input[placeholder="如: /api/*"]', '/test-plugin');
    await page.locator('input[id="route_name"]').fill('Test Route');

    const upstreamSelect = page.locator('label:has-text("上游")').locator('..').locator('.ant-select');
    if (await upstreamSelect.isVisible()) {
      await upstreamSelect.click();
      await page.waitForTimeout(300);
      await page.locator('.ant-select-item').first().click();
    }

    const pluginSelector = page.locator('.two-column-plugin-selector');
    await expect(pluginSelector).toBeVisible({ timeout: 5000 });

    const pluginItem = pluginSelector.locator('.plugin-item:has-text("proxy-rewrite")');
    await pluginItem.click();
    await page.waitForTimeout(300);

    const selectedPlugin = pluginSelector.locator('.selected-item:has-text("proxy-rewrite")');
    await expect(selectedPlugin).toBeVisible();

    const editBtn = selectedPlugin.locator('.selected-actions .anticon-edit');
    await editBtn.click();

    const drawer = page.locator('.ant-drawer:has-text("配置插件 - proxy-rewrite")');
    await expect(drawer).toBeVisible({ timeout: 5000 });

    const setSection = drawer.locator('.nested-section:has-text("set")');
    await expect(setSection).toBeVisible();
    await setSection.locator('input[placeholder="header 名称"]').first().fill('X-Api-Version');
    await setSection.locator('input[placeholder="header 值"]').first().fill('v1');
    await setSection.locator('button:has-text("添加")').first().click();
    await page.waitForTimeout(300);
    await expect(setSection.locator('input[disabled]')).toBeVisible();

    const addSection = drawer.locator('.nested-section:has-text("add")');
    await addSection.locator('input[placeholder="header 名称"]').first().fill('X-Request-ID');
    await addSection.locator('input[placeholder="header 值"]').first().fill('12345');
    await addSection.locator('button:has-text("添加")').first().click();
    await page.waitForTimeout(300);

    const removeSection = drawer.locator('.nested-section:has-text("remove")');
    await removeSection.locator('input[placeholder="要删除的 header 名称"]').fill('X-Legacy-Header');
    await removeSection.locator('button:has-text("添加")').first().click();
    await page.waitForTimeout(300);

    const removeTag = removeSection.locator('.remove-tag:has-text("X-Legacy-Header")');
    await expect(removeTag).toBeVisible();

    await removeTag.locator('.ant-tag-close').click();
    await page.waitForTimeout(300);
    await expect(removeTag).not.toBeVisible();

    await drawer.locator('button:has-text("保存")').click();
    await page.waitForTimeout(500);

    const editBtnAgain = selectedPlugin.locator('.selected-actions .anticon-edit');
    await editBtnAgain.click();

    const drawerAgain = page.locator('.ant-drawer:has-text("配置插件 - proxy-rewrite")');
    await expect(drawerAgain).toBeVisible({ timeout: 5000 });

    await expect(drawerAgain.locator('.nested-section:has-text("set")').locator('input[disabled]')).toBeVisible();
    await expect(drawerAgain.locator('.nested-section:has-text("add")').locator('input[disabled]')).toBeVisible();

    await drawerAgain.locator('button:has-text("取消")').click();
  });

  test('should toggle between form mode and JSON mode', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1000);

    const hasCluster = await page.locator('text=详情').isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasCluster) {
      await page.click('text=新建');
      await page.waitForTimeout(500);
      await page.fill('input[placeholder="请输入集群名称"]', 'Test Cluster');
      await page.fill('input[placeholder="请输入描述信息"]', 'Test cluster for plugin');
      await page.click('button:has-text("确定")');
      await page.waitForTimeout(1000);
    }

    await page.locator('text=详情').first().click();
    await page.waitForTimeout(500);

    await page.locator('.ant-tabs-tab').filter({ hasText: '路由' }).click();
    await page.waitForTimeout(500);
    await page.click('text=新建路由');
    await page.waitForTimeout(500);

    const pluginSelector = page.locator('.two-column-plugin-selector');
    await pluginSelector.locator('.plugin-item:has-text("proxy-rewrite")').click();
    await page.waitForTimeout(300);

    await pluginSelector.locator('.selected-item:has-text("proxy-rewrite") .anticon-edit').click();

    const drawer = page.locator('.ant-drawer');
    await expect(drawer).toBeVisible({ timeout: 5000 });

    const jsonSwitch = drawer.locator('.ant-switch');
    await jsonSwitch.click();
    await page.waitForTimeout(300);
    await expect(drawer.locator('textarea')).toBeVisible();

    await jsonSwitch.click();
    await page.waitForTimeout(300);
    await expect(drawer.locator('.form-editor')).toBeVisible();

    await drawer.locator('button:has-text("取消")').click();
  });
});
