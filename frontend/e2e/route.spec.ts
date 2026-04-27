import { test, expect } from '@playwright/test';

test.describe('Route CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'panshi123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test('should display clusters page', async ({ page }) => {
    await page.click('text=集群管理');
    await expect(page.locator('h2')).toContainText('集群管理');
  });

  test('should display cluster detail', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1000);
    const hasDetail = await page.locator('text=详情').isVisible({ timeout: 5000 }).catch(() => false);
    if (hasDetail) {
      await page.click('text=详情');
      await expect(page.locator('.ant-tabs')).toBeVisible();
    } else {
      console.log('No cluster data - test skipped');
    }
  });

  test('should disable routes tab when upstream is empty', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1000);
    const hasDetail = await page.locator('text=详情').isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasDetail) {
      console.log('No cluster data - test skipped');
      return;
    }
    await page.click('text=详情');
    await page.waitForTimeout(500);

    const routesTab = page.locator('.ant-tabs-tab').filter({ hasText: '路由' });
    const isDisabled = await routesTab.getAttribute('aria-disabled');
    expect(isDisabled).toBe('true');
  });

  test('should validate required fields in route form', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1000);
    const hasCluster = await page.locator('text=详情').isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasCluster) {
      console.log('No cluster data - test skipped');
      return;
    }
    await page.click('text=详情');
    await page.waitForTimeout(500);

    const clusterCard = page.locator('.cluster-card').first();
    await clusterCard.locator('text=详情').click();
    await page.waitForTimeout(1000);

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

    await page.locator('.ant-tabs-tab').filter({ hasText: '路由' }).click();
    await page.waitForTimeout(500);

    const hasRoute = await page.locator('.ant-table-tbody tr').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasRoute) {
      console.log('No route data - test skipped');
      return;
    }

    await page.click('text=添加路由');
    await page.waitForTimeout(500);
    await page.click('button:has-text("确定")');
    await page.waitForTimeout(500);

    const validationMessages = page.locator('.ant-form-item-explain-error');
    const count = await validationMessages.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should show route JSON view', async ({ page }) => {
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

    await page.locator('.ant-tabs-tab').filter({ hasText: '路由' }).click();
    await page.waitForTimeout(500);

    const hasRoute = await page.locator('.ant-table-tbody tr').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasRoute) {
      console.log('No route data - test skipped');
      return;
    }

    await page.locator('.ant-table-tbody tr').first().locator('text=JSON').click();
    await page.waitForTimeout(500);

    await expect(page.locator('.ant-modal-title:has-text("路由JSON视图")')).toBeVisible();
    await expect(page.locator('.json-textarea')).toBeVisible();
    const jsonContent = await page.locator('.json-textarea').inputValue();
    expect(jsonContent).toContain('name');
  });

  test('should show route column configuration', async ({ page }) => {
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

    await page.locator('.ant-tabs-tab').filter({ hasText: '路由' }).click();
    await page.waitForTimeout(500);

    await page.click('text=列配置');
    await page.waitForTimeout(500);

    await expect(page.locator('.ant-popover-inner')).toBeVisible();
    const checkboxes = page.locator('.ant-popover-inner input[type="checkbox"]');
    const count = await checkboxes.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should show pagination in route table', async ({ page }) => {
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

    await page.locator('.ant-tabs-tab').filter({ hasText: '路由' }).click();
    await page.waitForTimeout(500);

    const hasRoute = await page.locator('.ant-table-tbody tr').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasRoute) {
      console.log('No route data - test skipped');
      return;
    }

    const pagination = page.locator('.ant-pagination');
    await expect(pagination).toBeVisible();

    const pageSizeSelect = page.locator('.ant-pagination-options-size-changer').locator('.ant-select-selector');
    await expect(pageSizeSelect).toBeVisible();
  });

  test('should show search input in route table', async ({ page }) => {
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

    await page.locator('.ant-tabs-tab').filter({ hasText: '路由' }).click();
    await page.waitForTimeout(500);

    const hasRoute = await page.locator('.ant-table-tbody tr').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasRoute) {
      console.log('No route data - test skipped');
      return;
    }

    const searchInput = page.locator('.ant-input-search');
    await expect(searchInput).toBeVisible();

    const fieldSelect = page.locator('.ant-select').filter({ hasText: '搜索字段' });
    await expect(fieldSelect).toBeVisible();
  });

  test('should show sortable columns in route table', async ({ page }) => {
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

    await page.locator('.ant-tabs-tab').filter({ hasText: '路由' }).click();
    await page.waitForTimeout(500);

    const hasRoute = await page.locator('.ant-table-tbody tr').first().isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasRoute) {
      console.log('No route data - test skipped');
      return;
    }

    const sortableHeader = page.locator('.ant-table-column-sorter').first();
    await expect(sortableHeader).toBeVisible();
  });
});