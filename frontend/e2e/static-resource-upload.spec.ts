import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

test.describe('静态资源上传', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'panshi123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test('上传 zip 文件后路径正确', async ({ page }) => {
    await page.click('text=集群管理');
    await page.waitForTimeout(1000);

    const hasCluster = await page.locator('text=详情').isVisible({ timeout: 5000 }).catch(() => false);
    if (!hasCluster) {
      console.log('no cluster data');
      return;
    }
    await page.click('text=详情');
    await page.waitForTimeout(500);

    const srTab = page.locator('.ant-tabs-tab').filter({ hasText: '静态资源' });
    await srTab.click();
    await page.waitForTimeout(500);

    const uploadBtn = page.locator('button:has-text("上传ZIP")').first();
    const uploadDisabled = await uploadBtn.isDisabled().catch(() => true);
    if (uploadDisabled) {
      console.log('no static resource to upload');
      return;
    }

    const testDir = path.join(__dirname, '..', 'e2e', 'test-data');
    if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });
    const testZip = path.join(testDir, 'test-upload.zip');

    const { execSync } = require('child_process');
    execSync(`echo "test" > X:/tmp/test.txt && zip "${testZip}" X:/tmp/test.txt 2>nul || echo skip`);

    if (!fs.existsSync(testZip)) {
      fs.writeFileSync(testZip, Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x0A, 0x00, 0x00, 0x00, 0x00, 0x00]));
    }

    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      uploadBtn.click(),
    ]);
    await fileChooser.setFiles(testZip);
    await page.waitForTimeout(2000);

    const modal = page.locator('.ant-modal-confirm');
    await expect(modal).toBeVisible({ timeout: 5000 });

    const modalContent = await modal.textContent();
    expect(modalContent).toContain('管理端文件');
    expect(modalContent).toContain('backend/data/static/');

    await expect(modal).toContainText('✅ 上传成功');
  });
});
