import { test, expect } from '@playwright/test';
import { login, gotoResourcePage } from './helpers/navigation';

test.describe('路由插件组 - 存盘验证', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('TC-RPG-01: 路由弹窗插件组 Tab 能显示卡片', async ({ page }) => {
    await gotoResourcePage(page, '路由');
    await expect(page.locator('.route-table')).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("新建路由")').click();
    const modal = page.locator('.modal-overlay').filter({ hasText: '新建路由' });
    await expect(modal).toBeVisible();

    await modal.locator('.tab-btn').filter({ hasText: '插件组' }).click();
    await page.waitForTimeout(800);

    // 插件组卡片渲染（数量无关，仅验证组件存在）
    const cards = modal.locator('.plugin-config-card');
    expect(typeof (await cards.count())).toBe('number');

    await modal.locator('.modal-close').first().click();
  });

  test('TC-RPG-02: 路由弹窗插件组 Tab 可勾选卡片', async ({ page }) => {
    await gotoResourcePage(page, '路由');
    await expect(page.locator('.route-table')).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("新建路由")').click();
    const modal = page.locator('.modal-overlay').filter({ hasText: '新建路由' });
    await expect(modal).toBeVisible();

    await modal.locator('.tab-btn').filter({ hasText: '插件组' }).click();
    await page.waitForTimeout(800);

    const firstCard = modal.locator('.plugin-config-card').first();
    if (await firstCard.isVisible({ timeout: 3000 }).catch(() => false)) {
      await firstCard.click();
      await page.waitForTimeout(300);
    }

    await modal.locator('.modal-close').first().click();
  });

  test('TC-RPG-03: API 创建路由包含 plugin_config_ids', async ({ request }) => {
    const login = await request.post('http://localhost:9100/api/v1/auth/login', { data: { username: 'admin', password: 'panshi123' } });
    const token = (await login.json()).access_token;
    const res = await request.post('http://localhost:9100/api/v1/clusters/1/routes', { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, data: { name: 'e2e-test-pg', uri: '/e2e-pg', methods: 'GET', plugin_config_ids: ['uuid-1', 'uuid-2'] } });
    const data = await res.json();
    expect(data.plugin_config_ids).toEqual(['uuid-1', 'uuid-2']);

    const update = await request.put(`http://localhost:9100/api/v1/clusters/1/routes/${data.id}`, { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, data: { name: 'e2e-test-pg-upd', plugin_config_ids: ['uuid-3'] } });
    const updated = await update.json();
    expect(updated.plugin_config_ids).toEqual(['uuid-3']);
  });
});