import { test } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

test('06 finish plugin config', async ({ page }) => {
  await page.goto('http://localhost:12345/plugin-configs')
  await page.waitForTimeout(1500)
  await page.locator('button', { hasText: /添加插件组/ }).first().click()
  await page.waitForTimeout(800)
  const overlay = page.locator('.modal-overlay:visible')
  await overlay.getByPlaceholder(/插件组名称/).fill('日志插件组')
  await overlay.locator('select.form-input').selectOption({ label: '演示集群' })
  await overlay.getByPlaceholder('可选描述').fill('集中管理请求日志记录，供路由引用')
  await overlay.getByText('插件配置', { exact: true }).click()
  await page.waitForTimeout(800)
  await overlay.getByText(/数据处理\s*\(\d\)/).click()
  await page.waitForTimeout(600)
  await overlay.getByText('日志记录', { exact: false }).first().click()
  await page.waitForTimeout(1000)
  await shot(page, '06-04-pc-log-selected')
  await overlay.locator('.modal-footer button', { hasText: '创建' }).click()
  await page.waitForTimeout(2000)
  await shot(page, '06-05-pc-created')
})
