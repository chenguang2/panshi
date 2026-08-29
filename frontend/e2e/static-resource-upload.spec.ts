import { test, expect } from '@playwright/test';
import { login, gotoResourcePage } from './helpers/navigation';

test.describe('静态资源上传', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('静态资源页有上传 ZIP 行内按钮', async ({ page }) => {
    await gotoResourcePage(page, '静态资源');
    const pageRoot = page.locator('.sr-card, .sr-empty');
    await expect(pageRoot.first()).toBeVisible({ timeout: 10000 });

    // 行内上传按钮存在（无资源时为空态——跳过）
    const firstCard = page.locator('.sr-card').first();
    const hasCard = await firstCard.isVisible({ timeout: 3000 }).catch(() => false);
    if (!hasCard) {
      test.skip('无静态资源数据')
      return
    }
    await expect(firstCard.locator('button:has-text("上传 ZIP")')).toBeVisible();
  });

  test('API 返回格式包含 storage_path', async ({ page }) => {
    // 后端已要求认证（Phase 0 安全加固），先登录取 token
    const loginResp = await page.request.post('http://localhost:9100/api/v1/auth/login', {
      data: { username: 'admin', password: 'panshi123' },
    });
    const { access_token } = await loginResp.json();
    const resp = await page.request.get('http://localhost:9100/api/v1/clusters/1/static-resources', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const body = await resp.json();
    expect(resp.ok()).toBeTruthy();
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) {
      expect(item).toHaveProperty('storage_path');
    }
  });
});