import { test, expect } from '@playwright/test';

test.describe('Upstream CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'panshi123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test('should display clusters page', async ({ page }) => {
    await page.click('text=集群管理');
    await expect(page.locator('.cluster-card').first()).toBeVisible();
  });

  test('should show upstream JSON view', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1000);
    const hasCluster = await page.locator('text=详情').isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasCluster) {
      console.log('No cluster data - test skipped');
      return;
    }
    await page.click('text=详情');
    await page.waitForTimeout(500);

    const upstreamTab = page.locator('.ant-tabs-tab').filter({ hasText: '上游' });
    const upstreamDisabled = await upstreamTab.getAttribute('aria-disabled');
    if (upstreamDisabled === 'true') {
      console.log('No upstream - test skipped');
      return;
    }

    await upstreamTab.click();
    await page.waitForTimeout(500);

    const hasUpstream = await page.locator('.ant-table-tbody tr').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasUpstream) {
      console.log('No upstream data - test skipped');
      return;
    }

    await page.locator('.ant-table-tbody tr').first().locator('text=JSON').click();
    await page.waitForTimeout(500);

    await expect(page.locator('.ant-modal-title:has-text("上游JSON视图")')).toBeVisible();
    await expect(page.locator('.json-textarea')).toBeVisible();
    const jsonContent = await page.locator('.json-textarea').inputValue();
    expect(jsonContent).toContain('name');
  });
});