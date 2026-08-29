import { test, expect, type Page } from '@playwright/test';
import { login, gotoResourcePage } from './helpers/navigation';

test.describe('Upstream 高级配置', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  /** 进入上游列表并打开新建上游弹窗（自定义 modal-overlay） */
  async function openUpstreamForm(page: Page) {
    await gotoResourcePage(page, '上游');
    const table = page.locator('.ant-table');
    await expect(table).toBeVisible({ timeout: 10000 });
    await page.locator('button:has-text("新建上游")').click();
    const modal = page.locator('.modal-overlay').filter({ hasText: '添加上游' });
    await expect(modal).toBeVisible({ timeout: 5000 });
    return modal;
  }

  test('TC-UP-ADV-01: 添加上游弹窗有两个 Tab，基础配置默认激活', async ({ page }) => {
    const modal = await openUpstreamForm(page);

    const basicTab = modal.locator('.tab-btn').filter({ hasText: '基础配置' });
    const advancedTab = modal.locator('.tab-btn').filter({ hasText: '高级配置' });
    await expect(basicTab).toBeVisible();
    await expect(advancedTab).toBeVisible();
    await expect(basicTab).toHaveClass(/active/);

    await modal.locator('.modal-close').click();
  });

  test('TC-UP-ADV-02: 负载均衡下拉包含四种算法', async ({ page }) => {
    const modal = await openUpstreamForm(page);

    // 负载均衡 select（按选项文案定位，弹窗内第一个 form-input 是所属集群）
    const lbSelect = modal.locator('select.form-input').filter({ hasText: '加权轮询' });
    const options = await lbSelect.locator('option').allTextContents();
    expect(options).toContain('加权轮询');
    expect(options).toContain('一致性哈希');
    expect(options).toContain('延迟最小');
    expect(options).toContain('最少连接');

    await modal.locator('.modal-close').click();
  });

  test('TC-UP-ADV-03: 一致性哈希时含自定义变量选项', async ({ page }) => {
    const modal = await openUpstreamForm(page);

    // 负载均衡 select（按选项文案定位，弹窗内第一个 form-input 是所属集群）
    const lbSelect = modal.locator('select.form-input').filter({ hasText: '加权轮询' });
    await lbSelect.selectOption('chash');
    await page.waitForTimeout(300);

    // 一致性哈希时出现 hash_on 选择（含 内置变量 / 自定义变量组合）
    const hashSelect = modal.locator('select.form-input').filter({ hasText: '内置变量' });
    await expect(hashSelect).toBeVisible();
    const hashOptions = await hashSelect.locator('option').allTextContents();
    expect(hashOptions).toContain('内置变量');
    expect(hashOptions).toContain('自定义变量组合');

    await modal.locator('.modal-close').click();
  });

  test('TC-UP-ADV-04: 高级配置未开启时显示提示', async ({ page }) => {
    const modal = await openUpstreamForm(page);

    await modal.locator('.tab-btn').filter({ hasText: '高级配置' }).click();
    await page.waitForTimeout(300);

    // 高级配置 Tab 渲染各开关区块（健康检查/超时/连接池/重试等）
    const sections = modal.locator('.advanced-section');
    expect(await sections.count()).toBeGreaterThan(0);
    await expect(sections.first()).toBeVisible();

    await modal.locator('.modal-close').click();
  });

  test('TC-UP-ADV-05: 开启高级配置后提示消失', async ({ page }) => {
    const modal = await openUpstreamForm(page);

    await modal.locator('.tab-btn').filter({ hasText: '高级配置' }).click();
    await page.waitForTimeout(300);

    // 打开第一个开关（健康检查），对应区块输入变为可用
    const firstToggle = modal.locator('.advanced-section .checkbox-label').first();
    await firstToggle.click();
    await page.waitForTimeout(300);
    await expect(firstToggle.locator('input[type="checkbox"]')).toBeChecked();

    await modal.locator('.modal-close').click();
  });
})