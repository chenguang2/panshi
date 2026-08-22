import { test } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

test('01 create cluster (fixed)', async ({ page }) => {
  await page.goto('http://localhost:12345/clusters')
  await page.waitForTimeout(1500)
  await page.locator('button', { hasText: '新建集群' }).first().click()
  await page.waitForTimeout(800)
  await shot(page, '01-02-cluster-form')
  await page.locator('.modal input').nth(0).fill('演示集群')
  await page.locator('.modal input').nth(1).fill('演示集群')
  await shot(page, '01-03-cluster-form-filled')
  await page.locator('.modal-footer button', { hasText: '创建' }).click()
  await page.waitForTimeout(2500)
  await shot(page, '01-04-cluster-created')
})
