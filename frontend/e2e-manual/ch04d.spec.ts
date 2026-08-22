import { test } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

test('04 global rule full flow', async ({ page }) => {
  await page.goto('http://localhost:12345/global-rules')
  await page.waitForTimeout(1500)
  await page.locator('button', { hasText: '添加全局规则' }).first().click()
  await page.waitForTimeout(800)
  const overlay = page.locator('.modal-overlay:visible')
  await overlay.getByPlaceholder('请输入全局规则名称').fill('全局链路追踪')
  await overlay.locator('select.form-input').selectOption({ label: '演示集群' })
  await overlay.getByPlaceholder('可选描述').fill('为所有请求注入 TraceID，便于全链路日志检索')
  await shot(page, '04-03-gr-basic-filled')
  // 切到插件配置 tab
  await overlay.getByText('插件配置', { exact: true }).click()
  await page.waitForTimeout(1000)
  await shot(page, '04-04-gr-plugin-tab')
})
