import { test } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

test('01 create demo-cluster', async ({ page }) => {
  await page.goto('http://localhost:12345/clusters')
  await page.waitForTimeout(1500)
  await page.locator('button', { hasText: '新建集群' }).first().click()
  await page.waitForTimeout(600)
  const modal = page.locator('.modal')
  // 名称（小写+中划线）
  await modal.locator('input').nth(0).fill('demo-cluster')
  // 显示名称
  await modal.locator('input').nth(1).fill('演示集群')
  // 描述
  await modal.locator('textarea').fill('操作手册演示集群：承载 192.168.0.13-15 三台预装节点')
  await shot(page, '01-03-cluster-form-filled')
  await modal.locator('.modal-footer button', { hasText: '创建' }).click()
  await page.waitForTimeout(2500)
  await shot(page, '01-04-cluster-created')
})
