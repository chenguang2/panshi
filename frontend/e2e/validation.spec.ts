import { test, expect } from '@playwright/test';
import { login, gotoResourcePage } from './helpers/navigation';

test.describe('Node and Upstream Validation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should show node modal validation', async ({ page }) => {
    await gotoResourcePage(page, '节点');
    await expect(page.locator('button:has-text("添加节点")')).toBeVisible({ timeout: 15000 });
    await page.locator('button:has-text("添加节点")').click();
    const modal = page.locator('.modal-overlay').filter({ hasText: '添加节点' });
    await expect(modal).toBeVisible();

    await modal.locator('.btn-primary').filter({ hasText: '保存' }).click();
    await page.waitForTimeout(500);

    const errorMsgs = modal.locator('.form-error');
    expect(await errorMsgs.count()).toBeGreaterThan(0);

    await modal.locator('.modal-close').first().click();
  });

  test('should validate node IP format', async ({ page }) => {
    await gotoResourcePage(page, '节点');
    await expect(page.locator('button:has-text("添加节点")')).toBeVisible({ timeout: 15000 });
    await page.locator('button:has-text("添加节点")').click();
    const modal = page.locator('.modal-overlay').filter({ hasText: '添加节点' });
    await expect(modal).toBeVisible();

    const ipInput = modal.locator('input.form-input').first();
    await ipInput.fill('999.999.999.999');
    await modal.locator('.btn-primary').filter({ hasText: '保存' }).click();
    await page.waitForTimeout(500);

    const errorMsg = modal.locator('.form-error').filter({ hasText: 'IP 地址格式不正确' });
    await expect(errorMsg.first()).toBeVisible();

    await modal.locator('.modal-close').first().click();
  });

  test('should show upstream modal validation', async ({ page }) => {
    await gotoResourcePage(page, '上游');
    await expect(page.locator('button:has-text("新建上游")')).toBeVisible({ timeout: 15000 });
    await page.locator('button:has-text("新建上游")').click();
    const modal = page.locator('.modal-overlay').filter({ hasText: '添加上游' });
    await expect(modal).toBeVisible();

    await modal.locator('.btn-primary').filter({ hasText: '保存' }).click();
    await page.waitForTimeout(500);

    const errorMsgs = modal.locator('.form-error');
    expect(await errorMsgs.count()).toBeGreaterThan(0);

    await modal.locator('.modal-close').first().click();
  });

  test('should show upstream load balance Chinese label', async ({ page }) => {
    await gotoResourcePage(page, '上游');
    const table = page.locator('.ant-table');
    await expect(table).toBeVisible({ timeout: 15000 });

    // 等首行渲染后再查中文标签
    const firstRow = page.locator('.ant-table-tbody tr').first();
    const hasRow = await firstRow.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasRow) {
      test.skip('无上游数据')
      return
    }
    const lbCell = page.locator('.ant-table-tbody').locator('td', { hasText: '加权轮询' }).first()
    await expect(lbCell).toBeVisible({ timeout: 5000 });
  });
});