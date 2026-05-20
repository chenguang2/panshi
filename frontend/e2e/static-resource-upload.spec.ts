import { test, expect } from '@playwright/test';

test.describe('静态资源上传', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'panshi123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test('上传交互流程正常', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1000);

    const clusterCard = page.locator('.cluster-card').first();
    const hasCluster = await clusterCard.isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasCluster) {
      console.log('no cluster data');
      return;
    }
    await clusterCard.locator('.expand-row').click();
    await page.waitForTimeout(500);

    await page.locator('span.dt:has-text("静态资源")').click();
    await page.waitForTimeout(500);

    const uploadBtn = page.locator('button:has-text("上传 ZIP")').first();
    const uploadDisabled = await uploadBtn.isDisabled().catch(() => true);
    if (uploadDisabled) {
      console.log('no static resource to upload');
      return;
    }

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      uploadBtn.click(),
    ]);
    await fileChooser.setFiles('e2e/test-valid.zip');
    await page.waitForTimeout(3000);

    const modal = page.locator('.ant-modal-confirm');
    await expect(modal).toBeVisible({ timeout: 5000 });
  });

  test('API 返回格式包含 storage_path', async ({ page }) => {
    const resp = await page.request.get('http://localhost:9000/api/v1/clusters/1/static-resources');
    const body = await resp.json();
    expect(resp.ok()).toBeTruthy();
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) {
      expect(item).toHaveProperty('storage_path');
    }
  });
});
