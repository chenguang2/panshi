import { test, expect } from '@playwright/test';
import { login } from './helpers/navigation';

test.describe('User Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should navigate to user management page', async ({ page }) => {
    await page.hover('text=系统管理');
    await page.click('text=用户管理');
    await expect(page.locator('.page-header h1')).toContainText('用户管理');
  });

  test('should display all users for admin', async ({ page }) => {
    await page.hover('text=系统管理');
    await page.click('text=用户管理');
    const tableRows = page.locator('.ant-table-tbody tr');
    await expect(tableRows.first()).toBeVisible();
    const count = await tableRows.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('should open add user modal', async ({ page }) => {
    await page.hover('text=系统管理');
    await page.click('text=用户管理');
    await page.click('button:has-text("新建用户")');
    const modal = page.locator('.modal-overlay').filter({ hasText: '新建用户' });
    await expect(modal).toBeVisible();
    await modal.locator('.modal-close').first().click();
  });

  test('admin can see action buttons', async ({ page }) => {
    await page.hover('text=系统管理');
    await page.click('text=用户管理');
    const addBtn = page.locator('button:has-text("新建用户")');
    await expect(addBtn).toBeVisible();
  });
});