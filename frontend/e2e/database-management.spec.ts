import { test, expect, type Page } from '@playwright/test';

// 串行执行：测试间共享数据库状态（创建 → 测试 → 迁移校验 → 清理）
test.describe.configure({ mode: 'serial' });

const CONN_NAME = `e2e-pg-${Date.now()}`;

async function gotoDatabasePage(page: Page): Promise<void> {
  await page.hover('text=系统管理');
  await page.click('text=数据库管理');
  await expect(page.locator('h2')).toContainText('数据库管理');
}

test.describe('Database Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'panshi123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test('页面渲染：标题、连接列表、数据迁移卡片', async ({ page }) => {
    await gotoDatabasePage(page);
    await expect(page.locator('.add-conn-btn')).toBeVisible();
    await expect(page.locator('.ant-table')).toBeVisible();
    await expect(page.locator('.card-title', { hasText: '数据迁移' })).toBeVisible();
    // 当前数据库状态卡片显示本地 SQLite
    await expect(page.locator('.status-card')).toContainText('SQLite');
  });

  test('添加 PostgreSQL 连接：草稿测试提示 → 保存成功 → 表格出现新行', async ({ page }) => {
    await gotoDatabasePage(page);
    await page.click('.add-conn-btn');
    const modal = page.locator('.ant-modal').filter({ hasText: '添加连接' });
    await expect(modal).toBeVisible();

    // 类型切换为 PostgreSQL
    await modal.locator('.ant-select').first().click();
    await page.locator('.ant-select-dropdown .ant-select-item').filter({ hasText: 'PostgreSQL' }).click();

    // 填写连接字段
    await modal.locator('input[placeholder="连接名称"]').fill(CONN_NAME);
    await modal.locator('input[placeholder="localhost"]').fill('127.0.0.1');
    await modal.locator('input[placeholder="5432"]').fill('5432');
    await modal.locator('input[placeholder="panshi"]').fill('panshi_e2e');
    await modal.locator('input[placeholder="postgres"]').fill('postgres');
    await modal.locator('input[placeholder="如需修改请输入"]').fill('secret123');

    // 未保存前点击「测试连接」→ 提示先保存
    await modal.locator('button:has-text("测试连接")').click();
    await expect(page.locator('.ant-message')).toContainText('请先保存连接');

    // 保存成功
    await modal.locator('.save-conn-btn').click();
    await expect(page.locator('.ant-message')).toContainText('连接已添加');
    await expect(modal).toBeHidden();

    // 表格出现新行，类型标签为 PostgreSQL
    const row = page.locator('.ant-table-tbody tr').filter({ hasText: CONN_NAME });
    await expect(row).toBeVisible();
    await expect(row).toContainText('PostgreSQL');
  });

  test('行内测试连接：PG 未启动时给出错误反馈', async ({ page }) => {
    await gotoDatabasePage(page);
    const row = page.locator('.ant-table-tbody tr').filter({ hasText: CONN_NAME });
    await expect(row).toBeVisible();
    await row.locator('.test-conn-btn').click();
    // 本地未运行 PostgreSQL → 后端返回 success=false → 弹出错误消息（detail 文本来自后端）
    await expect(page.locator('.ant-message .ant-message-notice').first()).toBeVisible();
  });

  test('迁移校验：未选择源/目标时提示错误', async ({ page }) => {
    await gotoDatabasePage(page);
    await page.locator('.migrate-btn').click();
    await expect(page.locator('.ant-message')).toContainText('请选择源数据库与目标数据库');
  });

  test('清理：删除测试连接', async ({ page }) => {
    await gotoDatabasePage(page);
    const row = page.locator('.ant-table-tbody tr').filter({ hasText: CONN_NAME });
    await expect(row).toBeVisible();
    await row.locator('.delete-conn-btn').click();
    await expect(page.locator('.ant-message')).toContainText('连接已删除');
    await expect(row).toHaveCount(0);
  });
});
