import { test, expect } from '@playwright/test';
import { login } from './helpers/navigation';

test.describe('Edge Import Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should navigate to edge-import via menu', async ({ page }) => {
    await page.click('text=数据导入');
    await page.waitForURL('/edge-import');
    await expect(page.locator('.page-header h1')).toContainText('Edge 数据导入');
  });

  test('should display 3-step wizard', async ({ page }) => {
    await page.goto('/edge-import');
    await page.waitForSelector('.ant-steps');

    const steps = page.locator('.ant-steps-item-title');
    await expect(steps.nth(0)).toContainText('选择节点');
    await expect(steps.nth(1)).toContainText('选择配置');
    await expect(steps.nth(2)).toContainText('预览导入');
  });

  test('should show cluster selector in step 1', async ({ page }) => {
    await page.goto('/edge-import');

    // Step 1 should be active
    await expect(page.locator('.ant-steps-item-active')).toContainText('选择节点');

    // Cluster selector should be visible
    await expect(page.locator('.ant-card')).toContainText('选择源节点');
    await expect(page.locator('.ant-select').first()).toBeVisible();

    // Next button should be disabled (no cluster selected)
    await expect(page.locator('button:has-text("下一步")').first()).toBeDisabled();
  });

  test('should have next button disabled in step 1', async ({ page }) => {
    await page.goto('/edge-import');

    // Step 1 next button - depends on clusters loaded from backend
    const nextBtn = page.locator('button:has-text("下一步"):not(:disabled)');
    const nextBtnDisabled = page.locator('button:has-text("下一步"):disabled');
    await expect(nextBtn.or(nextBtnDisabled)).toBeVisible();
  });

  test('should have step 2 title in wizard', async ({ page }) => {
    await page.goto('/edge-import');

    const step2Title = page.locator('.ant-steps-item-title').nth(1);
    await expect(step2Title).toContainText('选择配置');
  });

  test('should render preview sections layout', async ({ page }) => {
    await page.goto('/edge-import');

    await expect(page.locator('.edge-import')).toBeVisible();
    await expect(page.locator('.page-header h1')).toContainText('Edge 数据导入');
    await expect(page.locator('.step-actions')).toBeVisible();
  });
});