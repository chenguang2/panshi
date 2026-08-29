import { test, expect } from '@playwright/test';
import { login, gotoResourcePage } from './helpers/navigation';

test.describe('Route CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should display clusters page', async ({ page }) => {
    await page.click('text=集群管理');
    await expect(page.locator('.cl-card').first()).toBeVisible();
  });

  test('should display cluster detail', async ({ page }) => {
    await page.click('text=集群管理');
    const firstCard = page.locator('.cl-card').first();
    await expect(firstCard).toBeVisible();
    await firstCard.locator('button:has-text("详情")').click();
    const detailModal = page.locator('.modal-overlay').filter({ hasText: '集群详情' });
    await expect(detailModal).toBeVisible();
    await detailModal.locator('.modal-close').click();
  });

  test('should validate required fields in route form', async ({ page }) => {
    await gotoResourcePage(page, '路由');
    const table = page.locator('.route-table');
    await expect(table).toBeVisible({ timeout: 10000 });

    await page.locator('button:has-text("新建路由")').click();
    const modal = page.locator('.modal-overlay').filter({ hasText: '新建路由' });
    await expect(modal).toBeVisible();

    await modal.locator('.btn-primary').filter({ hasText: '保存' }).click();
    await page.waitForTimeout(500);

    const validationMessages = modal.locator('.form-error');
    const count = await validationMessages.count();
    expect(count).toBeGreaterThan(0);

    await modal.locator('.modal-close').first().click();
  });

  test('should show pagination in route table', async ({ page }) => {
    await gotoResourcePage(page, '路由');
    const table = page.locator('.route-table');
    await expect(table).toBeVisible({ timeout: 10000 });

    const pagination = page.locator('.ant-pagination');
    await expect(pagination).toBeVisible();

    const pageSizeSelect = page.locator('.ant-pagination-options-size-changer');
    await expect(pageSizeSelect).toBeVisible();
  });

  test('should show sortable columns in route table', async ({ page }) => {
    await gotoResourcePage(page, '路由');
    const table = page.locator('.route-table');
    await expect(table).toBeVisible({ timeout: 10000 });

    const sortableHeader = page.locator('.ant-table-column-sorter').first();
    await expect(sortableHeader).toBeVisible();
  });
});