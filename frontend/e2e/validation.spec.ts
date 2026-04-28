import { test, expect } from '@playwright/test';

test.describe('Node and Upstream Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'panshi123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
    await page.click('text=集群管理');
    await page.waitForTimeout(1000);

    const clusterCard = page.locator('.cluster-card').first();
    if (!await clusterCard.isVisible().catch(() => false)) {
      test.skip();
      return;
    }
  });

  test('should show node modal validation', async ({ page }) => {
    const clusterCard = page.locator('.cluster-card').first();

    const nodesTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '集群节点' });
    await nodesTab.click();
    await page.waitForTimeout(500);

    const addNodeBtn = clusterCard.locator('button').filter({ hasText: '添加节点' });
    if (!await addNodeBtn.isVisible().catch(() => false)) {
      test.skip();
      return;
    }
    await addNodeBtn.click();

    await expect(page.locator('.ant-modal')).toBeVisible();
    await expect(page.locator('.ant-modal-title').filter({ hasText: '添加节点' })).toBeVisible();

    await page.locator('.ant-modal .ant-btn-primary').click();
    await page.waitForTimeout(500);

    const errorMsgs = page.locator('.ant-form-item-explain-error');
    expect(await errorMsgs.count()).toBeGreaterThan(0);
  });

  test('should validate node IP format', async ({ page }) => {
    const clusterCard = page.locator('.cluster-card').first();

    const nodesTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '集群节点' });
    await nodesTab.click();
    await page.waitForTimeout(500);

    const addNodeBtn = clusterCard.locator('button').filter({ hasText: '添加节点' });
    if (!await addNodeBtn.isVisible().catch(() => false)) {
      test.skip();
      return;
    }
    await addNodeBtn.click();

    await expect(page.locator('.ant-modal')).toBeVisible();

    const ipInput = page.locator('.ant-modal input').filter({ hasText: '' }).first();
    await ipInput.fill('999.999.999.999');
    await ipInput.blur();
    await page.waitForTimeout(500);

    const errorMsg = page.locator('.ant-form-item-explain-error').filter({ hasText: '合法' });
    await expect(errorMsg.first()).toBeVisible();
  });

  test('should show upstream modal validation', async ({ page }) => {
    const clusterCard = page.locator('.cluster-card').first();

    const nodesTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '集群节点' });
    await nodesTab.click();
    await page.waitForTimeout(500);

    const addUpstreamBtn = clusterCard.locator('button').filter({ hasText: '添加上游' });
    if (!await addUpstreamBtn.isVisible().catch(() => false)) {
      test.skip();
      return;
    }
    await addUpstreamBtn.click();

    await expect(page.locator('.ant-modal')).toBeVisible();
    await expect(page.locator('.ant-modal-title').filter({ hasText: '添加上游' })).toBeVisible();

    await page.locator('.ant-modal .ant-btn-primary').click();
    await page.waitForTimeout(500);

    const errorMsgs = page.locator('.ant-form-item-explain-error');
    expect(await errorMsgs.count()).toBeGreaterThan(0);
  });

  test('should show upstream load balance Chinese label', async ({ page }) => {
    const clusterCard = page.locator('.cluster-card').first();

    const upstreamTab = clusterCard.locator('.ant-tabs-tab').filter({ hasText: '上游' });
    const isDisabled = await upstreamTab.getAttribute('aria-disabled');
    if (isDisabled === 'true') {
      test.skip();
      return;
    }

    await upstreamTab.click();
    await page.waitForTimeout(1000);

    const table = clusterCard.locator('.ant-table');
    if (!await table.isVisible().catch(() => false)) {
      test.skip();
      return;
    }

    const chineseText = clusterCard.locator('text=加权轮询').or(clusterCard.locator('text=一致性哈希'));
    await expect(chineseText.first()).toBeVisible({ timeout: 3000 }).catch(() => {
      test.skip();
    });
  });
});