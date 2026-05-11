import { test, expect } from '@playwright/test';

test.describe('Upstream 高级配置', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'panshi123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
  });

  async function navigateToUpstreamTab(page: any) {
    await page.goto('/clusters');
    await page.waitForTimeout(2000);

    const firstCard = page.locator('.cluster-grid .cluster-card').first();
    await firstCard.waitFor({ timeout: 10000 });

    const tabs = firstCard.locator('.ant-tabs');
    await tabs.waitFor({ timeout: 5000 });

    const upstreamTab = tabs.locator('.ant-tabs-tab').filter({ hasText: '上游' });
    await upstreamTab.click();
    await page.waitForTimeout(1000);
  }

  test('TC-UP-ADV-01: 添加上游弹窗有两个 Tab，基础配置默认激活', async ({ page }) => {
    await navigateToUpstreamTab(page);
    const firstCard = page.locator('.cluster-grid .cluster-card').first();
    await firstCard.locator('button:has-text("添加上游")').click();
    await page.waitForTimeout(800);

    const modal = page.locator('.ant-modal-content');

    await expect(modal.getByRole('tab', { name: '基础配置' })).toBeVisible();
    await expect(modal.getByRole('tab', { name: '高级配置' })).toBeVisible();

    const basicTab = modal.getByRole('tab', { name: '基础配置' }).first();
    const ariaSelected = await basicTab.getAttribute('aria-selected');
    expect(ariaSelected).toBe('true');

    await page.locator('.ant-modal-close').click();
    await page.waitForTimeout(500);
  });

  test('TC-UP-ADV-02: 负载均衡下拉包含四种算法', async ({ page }) => {
    await navigateToUpstreamTab(page);
    const firstCard = page.locator('.cluster-grid .cluster-card').first();
    await firstCard.locator('button:has-text("添加上游")').click();
    await page.waitForTimeout(800);

    const selects = page.locator('.ant-modal-content .ant-select-selector');
    await selects.first().click();
    await page.waitForTimeout(500);

    const options = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content');
    const texts = await options.allTextContents();
    expect(texts).toContain('加权轮询');
    expect(texts).toContain('一致性哈希');
    expect(texts).toContain('延迟最小');
    expect(texts).toContain('最少连接');

    await page.locator('body').click();
    await page.waitForTimeout(300);
    await page.locator('.ant-modal-close').click();
    await page.waitForTimeout(500);
  });

  test('TC-UP-ADV-03: 一致性哈希时含自定义变量选项', async ({ page }) => {
    await navigateToUpstreamTab(page);
    const firstCard = page.locator('.cluster-grid .cluster-card').first();
    await firstCard.locator('button:has-text("添加上游")').click();
    await page.waitForTimeout(800);

    const selects = page.locator('.ant-modal-content .ant-select-selector');
    await selects.first().click();
    await page.waitForTimeout(300);
    await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').getByText('一致性哈希').click();
    await page.waitForTimeout(500);

    await selects.nth(1).click();
    await page.waitForTimeout(300);

    const hashOptions = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content');
    const hashTexts = await hashOptions.allTextContents();
    expect(hashTexts).toContain('内置变量');
    expect(hashTexts).toContain('自定义变量');

    await page.locator('body').click();
    await page.waitForTimeout(300);
    await page.locator('.ant-modal-close').click();
    await page.waitForTimeout(500);
  });

  test('TC-UP-ADV-04: 高级配置未开启时显示提示', async ({ page }) => {
    await navigateToUpstreamTab(page);
    const firstCard = page.locator('.cluster-grid .cluster-card').first();
    await firstCard.locator('button:has-text("添加上游")').click();
    await page.waitForTimeout(800);

    await page.locator('.ant-modal-content').getByRole('tab', { name: '高级配置' }).first().click();
    await page.waitForTimeout(500);

    await expect(page.locator('.advanced-disabled-hint')).toBeVisible();
    await expect(page.locator('.advanced-disabled-hint')).toContainText('高级配置未启用');

    await page.locator('.ant-modal-close').click();
    await page.waitForTimeout(500);
  });

  test('TC-UP-ADV-05: 开启高级配置后提示消失', async ({ page }) => {
    await navigateToUpstreamTab(page);
    const firstCard = page.locator('.cluster-grid .cluster-card').first();
    await firstCard.locator('button:has-text("添加上游")').click();
    await page.waitForTimeout(800);

    await page.locator('.ant-modal-content .ant-switch-inner').click();
    await page.waitForTimeout(500);

    await page.locator('.ant-modal-content').getByRole('tab', { name: '高级配置' }).first().click();
    await page.waitForTimeout(800);

    const advHint = page.locator('.advanced-disabled-hint');
    const isHintVisible = await advHint.isVisible({ timeout: 1000 }).catch(() => false);
    expect(isHintVisible).toBeFalsy();

    await page.locator('.ant-modal-close').click();
    await page.waitForTimeout(500);
  });
});
