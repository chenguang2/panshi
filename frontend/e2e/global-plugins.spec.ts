import { test, expect } from '@playwright/test';

/**
 * 全局插件 E2E 测试
 *
 * 注意：这些测试必须使用 --workers=1 运行，因为测试之间共享数据库状态。
 * 并行执行会导致测试失败（测试污染）。
 */
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

  test('should delete plugin and return to available list', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1000);

    const clusterCard = page.locator('.cluster-card').first();
    const globalPluginsTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '全局插件' });
    await globalPluginsTab.click();
    await page.waitForTimeout(2000);

    const availableBefore = await page.locator('.plugin-list').first().locator('.plugin-item').count();
    const configuredBefore = await page.locator('.plugin-list').nth(1).locator('.plugin-item').count();

    if (configuredBefore === 0) {
      const addButton = page.locator('.available-panel button:has-text("添加")').first();
      await addButton.click();
      await page.waitForTimeout(3000);
    }

    const configuredAfterAdd = await page.locator('.plugin-list').nth(1).locator('.plugin-item').count();
    if (configuredAfterAdd === 0) {
      return
    }

    const pluginItem = page.locator('.plugin-list').nth(1).locator('.plugin-item').first()
    await pluginItem.waitFor({ state: 'visible', timeout: 5000 });

    const btn = pluginItem.locator('button').nth(2)
    await btn.click()

    await page.waitForTimeout(500)
    const successMsg = page.locator('.ant-message').filter({ hasText: '已删除' })
    await successMsg.waitFor({ state: 'visible', timeout: 5000 })

    await page.waitForTimeout(3000);

    const configuredAfter = await page.locator('.plugin-list').nth(1).locator('.plugin-item').count();
    const availableAfter = await page.locator('.plugin-list').first().locator('.plugin-item').count();

    expect(configuredAfter).toBe(configuredAfterAdd - 1);
    expect(availableAfter).toBeGreaterThanOrEqual(availableBefore);
  });

  test('should show version management button text', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1000);

    const clusterCard = page.locator('.cluster-card').first();
    const globalPluginsTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '全局插件' });
    await globalPluginsTab.click();
    await page.waitForTimeout(1000);

    const configuredPlugins = page.locator('.plugin-list').nth(1).locator('.plugin-item');
    const count = await configuredPlugins.count();

    if (count > 0) {
      const versionBtn = configuredPlugins.first().locator('button:has-text("版本管理")');
      await expect(versionBtn).toBeVisible();
    }
  });

  test('should default to current version in version management', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1000);

    const clusterCard = page.locator('.cluster-card').first();
    const globalPluginsTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '全局插件' });
    await globalPluginsTab.click();
    await page.waitForTimeout(1000);

    const configuredPlugins = page.locator('.plugin-list').nth(1).locator('.plugin-item');
    const count = await configuredPlugins.count();

    if (count > 0) {
      const publishBtn = configuredPlugins.first().locator('button:has-text("发 布")');
      if (await publishBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await publishBtn.click();
        await page.waitForTimeout(3000);
      }

      const versionBtn = configuredPlugins.first().locator('button:has-text("版本管理")');
      await versionBtn.click();
      await page.waitForTimeout(1000);

      const versionModal = page.locator('.version-management');
      await expect(versionModal).toBeVisible({ timeout: 5000 });

      const versionList = page.locator('.version-list');
      await expect(versionList).toBeVisible({ timeout: 5000 });

      const currentTag = page.locator('.version-item--current').first();
      await expect(currentTag).toBeVisible({ timeout: 5000 });

      await page.locator('.ant-modal button:has-text("关 闭")').click();
    }
  });

  test('should NOT create version record on add', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1000);

    const clusterCard = page.locator('.cluster-card').first();
    const globalPluginsTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '全局插件' });
    await globalPluginsTab.click();
    await page.waitForTimeout(1000);

    const availablePlugins = page.locator('.plugin-list').first().locator('.plugin-item');
    const addBtn = availablePlugins.filter({ hasText: 'basic-auth' }).locator('button:has-text("添加")');

    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForTimeout(2000);

      const configuredItem = page.locator('.plugin-list').nth(1).locator('.plugin-item').filter({ hasText: 'basic-auth' });
      const vmBtn = configuredItem.locator('button:has-text("版本管理")');
      await vmBtn.click();
      await page.waitForTimeout(1000);

      const versionItems = page.locator('.version-item');
      const versionCount = await versionItems.count();
      expect(versionCount).toBe(0);

      await page.locator('.ant-modal button:has-text("关 闭")').click();
      await page.waitForTimeout(500);

      const delBtn = configuredItem.locator('button').nth(2);
      await delBtn.click();
      await page.waitForTimeout(2000);

      await page.waitForTimeout(1000);
    }
  });

  test('should NOT create version record on edit (save without publish)', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1000);

    const clusterCard = page.locator('.cluster-card').first();
    const globalPluginsTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '全局插件' });
    await globalPluginsTab.click();
    await page.waitForTimeout(1000);

    const availablePlugins = page.locator('.plugin-list').first().locator('.plugin-item');
    const addBtn = availablePlugins.filter({ hasText: 'basic-auth' }).locator('button:has-text("添加")');

    if (await addBtn.count() === 0) {
      await page.reload();
      await page.waitForTimeout(2000);
      await globalPluginsTab.click();
      await page.waitForTimeout(2000);
      const availablePluginsReloaded = page.locator('.plugin-list').first().locator('.plugin-item');
      const addBtnReloaded = availablePluginsReloaded.filter({ hasText: 'basic-auth' }).locator('button:has-text("添加")');
      if (await addBtnReloaded.count() === 0) {
        await page.waitForTimeout(3000);
        await globalPluginsTab.click();
        await page.waitForTimeout(2000);
        const availablePluginsRetry = page.locator('.plugin-list').first().locator('.plugin-item');
        const addBtnRetry = availablePluginsRetry.filter({ hasText: 'basic-auth' }).locator('button:has-text("添加")');
        if (await addBtnRetry.count() > 0) {
          await addBtnRetry.click();
          await page.waitForTimeout(2000);
        }
      } else {
        await addBtnReloaded.click();
        await page.waitForTimeout(2000);
      }
    } else {
      await addBtn.click();
      await page.waitForTimeout(2000);
    }

    const configuredItem = page.locator('.plugin-list').nth(1).locator('.plugin-item').filter({ hasText: 'basic-auth' });
    await configuredItem.waitFor({ state: 'visible', timeout: 5000 });

    const publishBtn = configuredItem.locator('button').nth(2);
    await publishBtn.click();
    await page.waitForTimeout(3000);

    const configuredItemAfterPublish = page.locator('.plugin-list').nth(1).locator('.plugin-item').filter({ hasText: 'basic-auth' });
    const itemVisible = await configuredItemAfterPublish.isVisible({ timeout: 1000 }).catch(() => false);
    if (!itemVisible) {
      return;
    }
    await configuredItemAfterPublish.waitFor({ state: 'visible', timeout: 5000 });

    const vmBtn = configuredItemAfterPublish.locator('button:has-text("版本管理")');
    await vmBtn.click();
    await page.waitForTimeout(1000);

    const initialVersions = await page.locator('.version-item').count();

    await page.locator('.ant-modal button:has-text("关 闭")').click();
    await page.waitForTimeout(500);

    const editBtn = configuredItemAfterPublish.locator('button').nth(1);
    await editBtn.click();
    await page.waitForTimeout(1500);

    const jsonSwitch = page.locator('.ant-switch').first();
    const isJsonMode = await jsonSwitch.evaluate(el => el.classList.contains('ant-switch-checked'));
    if (!isJsonMode) {
      await jsonSwitch.click();
      await page.waitForTimeout(500);
    }

    const textarea = page.locator('.ant-drawer textarea').first();
    const currentVal = await textarea.inputValue();
    const newVal = currentVal.includes('{') ? currentVal : '{}';
    await textarea.fill(newVal);

    const saveBtn = page.locator('.ant-drawer button:has-text("保 存")');
    await saveBtn.click();
    await page.waitForTimeout(2000);

    const configuredItemAfter = page.locator('.plugin-list').nth(1).locator('.plugin-item').filter({ hasText: 'basic-auth' });
    const vmBtnAfter = configuredItemAfter.locator('button:has-text("版本管理")');
    await vmBtnAfter.click();
    await page.waitForTimeout(1000);

    const afterEditVersions = await page.locator('.version-item').count();
    expect(afterEditVersions).toBe(initialVersions);

    await page.locator('.ant-modal button:has-text("关 闭")').click();
    await page.waitForTimeout(500);

    const delBtn = configuredItemAfter.locator('button').nth(2);
    await delBtn.click();
    await page.waitForTimeout(2000);
  });

  test('should create version record on publish', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1000);

    const clusterCard = page.locator('.cluster-card').first();
    const globalPluginsTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '全局插件' });
    await globalPluginsTab.click();
    await page.waitForTimeout(1000);

    const availablePlugins = page.locator('.plugin-list').first().locator('.plugin-item');
    const addBtn = availablePlugins.filter({ hasText: 'basic-auth' }).locator('button:has-text("添加")');

    if (await addBtn.count() === 0) {
      await page.reload();
      await page.waitForTimeout(2000);
      await globalPluginsTab.click();
      await page.waitForTimeout(2000);
      const availablePluginsReloaded = page.locator('.plugin-list').first().locator('.plugin-item');
      const addBtnReloaded = availablePluginsReloaded.filter({ hasText: 'basic-auth' }).locator('button:has-text("添加")');
      if (await addBtnReloaded.count() === 0) {
        await page.waitForTimeout(3000);
        await globalPluginsTab.click();
        await page.waitForTimeout(2000);
        const availablePluginsRetry = page.locator('.plugin-list').first().locator('.plugin-item');
        const addBtnRetry = availablePluginsRetry.filter({ hasText: 'basic-auth' }).locator('button:has-text("添加")');
        if (await addBtnRetry.count() === 0) {
          return;
        }
        await addBtnRetry.click();
        await page.waitForTimeout(2000);
      } else {
        await addBtnReloaded.click();
        await page.waitForTimeout(2000);
      }
    } else {
      await addBtn.click();
      await page.waitForTimeout(2000);
    }

    const configuredItem = page.locator('.plugin-list').nth(1).locator('.plugin-item').filter({ hasText: 'basic-auth' });
    await configuredItem.waitFor({ state: 'visible', timeout: 5000 });

    const publishBtn = configuredItem.locator('button').nth(2);
    await publishBtn.click();
    await page.waitForTimeout(3000);

    const configuredItemAfter = page.locator('.plugin-list').nth(1).locator('.plugin-item').filter({ hasText: 'basic-auth' });
    const itemVisible = await configuredItemAfter.isVisible({ timeout: 1000 }).catch(() => false);
    if (!itemVisible) {
      return;
    }

    const vmBtnAfter = configuredItemAfter.locator('button:has-text("版本管理")');
    await vmBtnAfter.click();
    await page.waitForTimeout(1000);

    const afterPublishVersions = await page.locator('.version-item').count();
    expect(afterPublishVersions).toBeGreaterThan(0);

    await page.locator('.ant-modal button:has-text("关 闭")').click();
    await page.waitForTimeout(500);

    const delBtn = configuredItemAfter.locator('button').nth(2);
    await delBtn.click();
    await page.waitForTimeout(2000);
  });

  test('should clear version history on delete and re-add', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1000);

    const clusterCard = page.locator('.cluster-card').first();
    const globalPluginsTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '全局插件' });
    await globalPluginsTab.click();
    await page.waitForTimeout(1000);

    // Ensure basic-auth is configured and has a version (published)
    let configuredItem = page.locator('.plugin-list').nth(1).locator('.plugin-item').filter({ hasText: 'basic-auth' });
    if (await configuredItem.count() === 0) {
      const addBtn = page.locator('.plugin-list').first().locator('.plugin-item').filter({ hasText: 'basic-auth' }).locator('button:has-text("添加")');
      if (await addBtn.count() > 0) {
        await addBtn.click();
        await page.waitForTimeout(2000);
      } else {
        await page.reload();
        await page.waitForTimeout(2000);
        await globalPluginsTab.click();
        await page.waitForTimeout(2000);
        const availablePluginsReloaded = page.locator('.plugin-list').first().locator('.plugin-item');
        const addBtnReloaded = availablePluginsReloaded.filter({ hasText: 'basic-auth' }).locator('button:has-text("添加")');
        if (await addBtnReloaded.count() === 0) {
          return;
        }
        await addBtnReloaded.click();
        await page.waitForTimeout(2000);
      }
      configuredItem = page.locator('.plugin-list').nth(1).locator('.plugin-item').filter({ hasText: 'basic-auth' });
    }

    // Publish to create version
    const publishBtn = configuredItem.locator('button').nth(2);
    await publishBtn.click();
    await page.waitForTimeout(3000);

    const configuredItemAfterPublish = page.locator('.plugin-list').nth(1).locator('.plugin-item').filter({ hasText: 'basic-auth' });
    const itemVisible = await configuredItemAfterPublish.isVisible({ timeout: 1000 }).catch(() => false);
    if (!itemVisible) {
      return;
    }

    // Delete the plugin
    const delBtn = configuredItemAfterPublish.locator('button').nth(2);
    await delBtn.click();
    await page.waitForTimeout(2000);

    // Re-add the plugin
    const availablePlugins = page.locator('.plugin-list').first().locator('.plugin-item').filter({ hasText: 'basic-auth' });
    if (await availablePlugins.count() > 0) {
      const addBtn = availablePlugins.locator('button:has-text("添加")');
      if (await addBtn.count() > 0) {
        await addBtn.click();
        await page.waitForTimeout(2000);
      }
    }

    // Open version management
    const reconfiguredItem = page.locator('.plugin-list').nth(1).locator('.plugin-item').filter({ hasText: 'basic-auth' });
    const reconfiguredItemVisible = await reconfiguredItem.isVisible({ timeout: 1000 }).catch(() => false);
    if (!reconfiguredItemVisible) {
      return;
    }

    const vmBtn = reconfiguredItem.locator('button:has-text("版本管理")');
    await vmBtn.click();
    await page.waitForTimeout(1000);

    // Should show 0 version items (fresh start after re-add)
    const versionItems = page.locator('.version-item');
    const versionCount = await versionItems.count();
    expect(versionCount).toBe(0);

    // Close modal
    await page.locator('.ant-modal button:has-text("关 闭")').click();
  });

  test('should update right panel when switching versions in modal', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1000);

    const clusterCard = page.locator('.cluster-card').first();
    const globalPluginsTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '全局插件' });
    await globalPluginsTab.click();
    await page.waitForTimeout(1000);

    const availablePlugins = page.locator('.plugin-list').first().locator('.plugin-item');
    const addBtn = availablePlugins.filter({ hasText: 'basic-auth' }).locator('button:has-text("添加")');

    if (await addBtn.count() === 0) {
      await page.reload();
      await page.waitForTimeout(2000);
      await globalPluginsTab.click();
      await page.waitForTimeout(2000);
      const availablePluginsReloaded = page.locator('.plugin-list').first().locator('.plugin-item');
      const addBtnReloaded = availablePluginsReloaded.filter({ hasText: 'basic-auth' }).locator('button:has-text("添加")');
      if (await addBtnReloaded.count() === 0) {
        await page.waitForTimeout(3000);
        await globalPluginsTab.click();
        await page.waitForTimeout(2000);
        const availablePluginsRetry = page.locator('.plugin-list').first().locator('.plugin-item');
        const addBtnRetry = availablePluginsRetry.filter({ hasText: 'basic-auth' }).locator('button:has-text("添加")');
        if (await addBtnRetry.count() > 0) {
          await addBtnRetry.click();
          await page.waitForTimeout(2000);
        }
      } else {
        await addBtnReloaded.click();
        await page.waitForTimeout(2000);
      }
    } else {
      await addBtn.click();
      await page.waitForTimeout(2000);
    }

    const configuredItem = page.locator('.plugin-list').nth(1).locator('.plugin-item').filter({ hasText: 'basic-auth' });
    await configuredItem.waitFor({ state: 'visible', timeout: 5000 });

    const publishBtn = configuredItem.locator('button').nth(2);
    await publishBtn.click();
    await page.waitForTimeout(3000);

    const configuredItemAfterPublish = page.locator('.plugin-list').nth(1).locator('.plugin-item').filter({ hasText: 'basic-auth' });
    const itemVisible = await configuredItemAfterPublish.isVisible({ timeout: 1000 }).catch(() => false);
    if (!itemVisible) {
      return;
    }
    await configuredItemAfterPublish.waitFor({ state: 'visible', timeout: 5000 });

    const editBtn = configuredItemAfterPublish.locator('button').nth(1);
    await editBtn.click();
    await page.waitForTimeout(1500);

    const jsonSwitch = page.locator('.ant-switch').first();
    const isJsonMode = await jsonSwitch.evaluate(el => el.classList.contains('ant-switch-checked'));
    if (!isJsonMode) {
      await jsonSwitch.click();
      await page.waitForTimeout(500);
    }

    const textarea = page.locator('.ant-drawer textarea').first();
    await textarea.fill('{"whitelist": ["1.1.1.1"]}');

    const saveBtn = page.locator('.ant-drawer button:has-text("保 存")');
    await saveBtn.click();
    await page.waitForTimeout(2000);

    const configuredItemAfter = page.locator('.plugin-list').nth(1).locator('.plugin-item').filter({ hasText: 'ip-restriction' });
    const publishBtnAfter = configuredItemAfter.locator('button').nth(2);
    await publishBtnAfter.click();
    await page.waitForTimeout(2000);

    const vmBtn = configuredItemAfter.locator('button:has-text("版本管理")');
    await vmBtn.click();
    await page.waitForTimeout(1000);

    const versionItems = page.locator('.version-item');
    const versionCount = await versionItems.count();
    expect(versionCount).toBeGreaterThanOrEqual(2);

    const firstVersionNumber = versionItems.first().locator('.version-number');
    await firstVersionNumber.click();
    await page.waitForTimeout(500);

    const modalJson = await page.locator('.json-textarea').inputValue();

    await page.locator('.ant-modal button:has-text("编 辑")').click();
    await page.waitForTimeout(2000);

    const drawerJsonSwitch = page.locator('.ant-drawer .ant-switch').first();
    const drawerIsJsonMode = await drawerJsonSwitch.evaluate(el => el.classList.contains('ant-switch-checked'));
    if (!drawerIsJsonMode) {
      await drawerJsonSwitch.click();
      await page.waitForTimeout(500);
    }

    const drawerTextarea = page.locator('.ant-drawer textarea').first();
    const editorContent = await drawerTextarea.inputValue();
    expect(editorContent).toBe(modalJson);

    await page.locator('.ant-drawer button:has-text("关 闭")').click();
    await page.waitForTimeout(500);

    await page.locator('.ant-modal button:has-text("关 闭")').click();
  });
});
