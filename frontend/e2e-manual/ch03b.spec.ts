import { test } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

test('03 edge-env select cluster+node and read', async ({ page }) => {
  await page.goto('http://localhost:12345/edge-env')
  await page.waitForTimeout(1500)
  // 选择集群
  const selects = page.locator('.form-input, select')
  await selects.nth(1).selectOption({ label: '演示集群' })
  await page.waitForTimeout(1200)
  // 选择节点
  await selects.nth(2).selectOption({ index: 1 }).catch(async () => {
    await selects.nth(2).selectOption({ label: '192.168.0.13' })
  })
  await page.waitForTimeout(1500)
  await shot(page, '03-02-edgeenv-selected')
  // 获取配置模板
  await page.locator('button', { hasText: '获取配置模板' }).first().click()
  await page.waitForTimeout(8000)
  await shot(page, '03-03-edgeenv-template')
})
