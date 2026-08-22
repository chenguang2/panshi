import { test, expect } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

test('01 create cluster', async ({ page }) => {
  await page.goto('http://localhost:12345/clusters')
  await page.waitForTimeout(1500)
  await shot(page, '01-01-cluster-list-empty')
  // 打开新建集群弹窗
  await page.locator('button', { hasText: '新建集群' }).first().click()
  await page.waitForTimeout(800)
  await shot(page, '01-02-cluster-form')
  // 填写表单
  await page.locator('.modal input').nth(0).fill('演示集群')
  await page.locator('.modal input').nth(1).fill('演示集群')
  await page.locator('.modal textarea, .modal input[type="text"]').last().fill('操作手册演示用集群')
  await shot(page, '01-03-cluster-form-filled')
  // 保存
  await page.locator('.modal button', { hasText: '保存' }).click()
  await page.waitForTimeout(2000)
  await shot(page, '01-04-cluster-created')
})
