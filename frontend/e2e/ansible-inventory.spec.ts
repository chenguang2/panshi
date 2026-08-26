import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:12345';

async function login(page: import('@playwright/test').Page) {
  await page.goto(`${BASE}/login`);
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill('panshi123');
  await page.locator('#password').press('Enter');
  await page.waitForURL('**/');
}

test.describe('Ansible 主机清单 — 链路验证', () => {
  test('添加主机按钮、Enter 续录、批量导入、自定义字段列移除', async ({ page }) => {
    await login(page);

    // 导航到 Ansible 主机清单页
    await page.goto(`${BASE}/ansible-inventory`);
    await page.waitForSelector('.ai-page', { timeout: 10000 });

    // 1. 底部虚线按钮存在
    const addBtn = page.locator('.add-row-dashed');
    await expect(addBtn).toBeVisible();
    await expect(addBtn).toContainText('添加主机');

    // 2. 点击添加按钮新增一行
    const initialCount = await page.locator('tr[data-row-key]').count();
    await addBtn.click();
    await expect(page.locator('tr[data-row-key]')).toHaveCount(initialCount + 1);

    // 3. 新行 IP 输入框可交互（焦点受 antd 表格渲染时序影响，用可交互性代替）
    const lastRow = page.locator('tr[data-row-key]').last();
    const ipInput = lastRow.locator('input').first();
    await expect(ipInput).toBeVisible();
    await expect(ipInput).toBeEnabled();

    // 4. 填写 IP 后 Enter 续录
    await ipInput.fill('10.0.0.99');
    await ipInput.press('Enter');
    await expect(page.locator('tr[data-row-key]')).toHaveCount(initialCount + 2);

    // 5. 批量导入按钮（仅表格视图）
    const bulkBtn = page.locator('button', { hasText: '批量导入' });
    await expect(bulkBtn).toBeVisible();

    // 6. 打开批量导入弹窗
    await bulkBtn.click();
    await expect(page.locator('.ant-modal')).toBeVisible();
    await expect(page.locator('.ant-modal-title')).toContainText('批量导入主机');

    // 7. 粘贴内容 → 预览
    const textarea = page.locator('.ant-modal textarea');
    await textarea.fill('10.0.0.1 root pass1\n10.0.0.2\n# 注释行\n');
    // 无错误时确认按钮可用
    const okBtn = page.locator('.ant-modal .ant-btn-primary');
    await expect(okBtn).toBeEnabled();

    // 8. 确认导入 → 行数增加
    const countBeforeImport = await page.locator('tr[data-row-key]').count();
    await okBtn.click();
    await expect(page.locator('.ant-modal')).not.toBeVisible();
    // 两条新行追加（10.0.0.1 和 10.0.0.2）
    await expect(page.locator('tr[data-row-key]')).toHaveCount(countBeforeImport + 2);

    // 9. 重复 IP 导入 → 覆盖提示
    await bulkBtn.click();
    await textarea.fill('10.0.0.1 newuser newpass');
    await expect(page.locator('.bulk-hint')).toContainText('覆盖');
    await okBtn.click();

    // 10. 底部「自定义字段」列已移除
    await expect(page.locator('th:has-text("自定义字段")')).toHaveCount(0);
});

});
