import { test, expect } from '@playwright/test';

test.describe('User Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'panshi123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test('should navigate to user management page', async ({ page }) => {
    await page.hover('text=系统管理');
    await page.click('text=用户管理');
    await expect(page.locator('h2')).toContainText('用户管理');
  });

  test('should display all users for admin', async ({ page }) => {
    await page.hover('text=系统管理');
    await page.click('text=用户管理');
    await page.waitForTimeout(500);
    const tableRows = page.locator('.ant-table-tbody tr');
    const count = await tableRows.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('should open add user modal', async ({ page }) => {
    await page.hover('text=系统管理');
    await page.click('text=用户管理');
    await page.click('text=添加用户');
    await expect(page.locator('.ant-modal')).toBeVisible();
  });

  test('admin can see action buttons', async ({ page }) => {
    await page.hover('text=系统管理');
    await page.click('text=用户管理');
    await page.waitForTimeout(500);
    const addBtn = page.locator('button:has-text("添加用户")');
    await expect(addBtn).toBeVisible();
  });
});