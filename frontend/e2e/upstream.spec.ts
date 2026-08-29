import { test, expect } from '@playwright/test';
import { login } from './helpers/navigation';

test.describe('Upstream CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('should display clusters page', async ({ page }) => {
    await page.click('text=集群管理');
    await expect(page.locator('.cl-card').first()).toBeVisible();
  });
});