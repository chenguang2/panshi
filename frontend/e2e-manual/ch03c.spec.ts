import { test } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

test('03 edge-env select and read template', async ({ page }) => {
  await page.goto('http://localhost:12345/edge-env')
  await page.waitForTimeout(1500)
  // select#2 = 集群（index 0=搜索框, 1=分组, 2=集群, 3=节点）
  const selects = page.locator('select.form-input')
  await selects.nth(1).selectOption({ label: '演示集群' })
  await page.waitForTimeout(1500)
  await selects.nth(2).selectOption({ index: 1 })
  await page.waitForTimeout(2000)
  await shot(page, '03-02-edgeenv-selected')
  await page.locator('button', { hasText: '获取配置模板' }).first().click()
  // 等读取弹窗出现并完成
  await page.waitForTimeout(12000)
  await shot(page, '03-03-edgeenv-read-modal')
  await page.waitForTimeout(3000)
  await shot(page, '03-04-edgeenv-editor')
})
