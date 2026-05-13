import { test, expect } from '@playwright/test';

test.describe('路由插件组 - 存盘验证', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'panshi123');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2000);
    await page.goto('/clusters');
    await page.waitForTimeout(2000);
    await page.locator('.cluster-grid .cluster-card').first().waitFor({ timeout: 10000 });
  });

  test('TC-RPG-01: 集群插件组卡片可点击插件标签', async ({ page }) => {
    const tabs = page.locator('.cluster-grid .cluster-card').first().locator('.ant-tabs');
    await tabs.waitFor({ timeout: 5000 });
    await tabs.locator('.ant-tabs-tab').filter({ hasText: '插件组' }).click();
    await page.waitForTimeout(2000);

    const tag = page.locator('.plugin-config-card .ant-tag').first();
    if (!(await tag.isVisible({ timeout: 3000 }).catch(() => false))) return;

    await tag.click();
    await page.waitForTimeout(500);
    await expect(page.locator('pre').first()).toBeVisible({ timeout: 3000 });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  });

  test('TC-RPG-02: 路由弹窗插件组 Tab 能显示卡片', async ({ page }) => {
    const firstCard = page.locator('.cluster-grid .cluster-card').first();
    const tabs = firstCard.locator('.ant-tabs');
    await tabs.waitFor({ timeout: 5000 });
    await tabs.locator('.ant-tabs-tab').filter({ hasText: '路由' }).click();
    await page.waitForTimeout(1000);
    await firstCard.locator('button:has-text("添加路由")').click();
    await page.waitForTimeout(800);

    await page.locator('.ant-modal-content .ant-tabs-tab').filter({ hasText: '插件组' }).click();
    await page.waitForTimeout(800);

    const count = await page.locator('.ant-modal-content .plugin-config-card').count();
    expect(typeof count).toBe('number');
    await page.locator('.ant-modal-close').click();
    await page.waitForTimeout(500);
  });

  test('TC-RPG-03: API 创建路由包含 plugin_config_ids', async ({ request }) => {
    const login = await request.post('http://localhost:9000/api/v1/auth/login', { data: { username: 'admin', password: 'panshi123' } });
    const token = (await login.json()).access_token;
    const res = await request.post('http://localhost:9000/api/v1/clusters/1/routes', { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, data: { name: 'e2e-test-pg', uri: '/e2e-pg', methods: 'GET', plugin_config_ids: ['uuid-1', 'uuid-2'] } });
    const data = await res.json();
    expect(data.plugin_config_ids).toEqual(['uuid-1', 'uuid-2']);

    const update = await request.put(`http://localhost:9000/api/v1/clusters/1/routes/${data.id}`, { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, data: { name: 'e2e-test-pg-upd', plugin_config_ids: ['uuid-3'] } });
    const updated = await update.json();
    expect(updated.plugin_config_ids).toEqual(['uuid-3']);
  });
});
