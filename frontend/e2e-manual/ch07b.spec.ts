import { test } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

test('07 fill+save upstream', async ({ page }) => {
  await page.goto('http://localhost:12345/upstreams')
  await page.waitForTimeout(1500)
  await page.locator('button', { hasText: '新建上游' }).first().click()
  await page.waitForTimeout(800)
  const overlay = page.locator('.modal-overlay:visible')
  await overlay.getByPlaceholder('请输入上游名称').fill('demo-upstream')
  await overlay.locator('select.form-input').first().selectOption({ label: '演示集群' })
  await overlay.getByPlaceholder('描述信息').fill('演示业务后端（节点 OpenResty 默认页）')
  // 节点列表第一行
  const row = overlay.locator('input[placeholder*="主机地址"]')
  await row.fill('192.168.0.13')
  const portInput = overlay.locator('.form-row input[type="number"], input[type="number"]').first()
  await portInput.fill('80')
  await shot(page, '07-03-upstream-filled')
  await overlay.locator('.modal-footer button', { hasText: '保存' }).click()
  await page.waitForTimeout(2000)
  await shot(page, '07-04-upstream-created')
})
