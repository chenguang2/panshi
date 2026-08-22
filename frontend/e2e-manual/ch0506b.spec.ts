import { test } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

test('05 metadata create+publish', async ({ page }) => {
  await page.goto('http://localhost:12345/plugin-metadata')
  await page.waitForTimeout(1500)
  await page.locator('button', { hasText: '添加插件元数据' }).first().click()
  await page.waitForTimeout(600)
  const modal = page.locator('.modal-overlay:visible .modal')
  await modal.locator('select').nth(0).selectOption({ label: '演示集群' })
  await page.waitForTimeout(800)
  await modal.locator('select').nth(1).selectOption({ index: 2 }) // log_process
  await page.waitForTimeout(400)
  await shot(page, '05-03-metadata-filled')
  await modal.locator('.modal-footer button', { hasText: '保存' }).click()
  await page.waitForTimeout(2000)
  await shot(page, '05-04-metadata-created')
})

test('06 plugin config create', async ({ page }) => {
  await page.goto('http://localhost:12345/plugin-configs')
  await page.waitForTimeout(1500)
  await page.locator('button', { hasText: /添加插件组/ }).first().click()
  await page.waitForTimeout(800)
  const overlay = page.locator('.modal-overlay:visible')
  await overlay.getByPlaceholder(/插件组名称/).fill('日志插件组')
  await overlay.locator('select.form-input').selectOption({ label: '演示集群' })
  await overlay.getByPlaceholder('可选描述').fill('集中管理请求日志记录，供路由引用')
  // 插件配置
  await overlay.getByText('插件配置', { exact: true }).click()
  await page.waitForTimeout(800)
  await overlay.getByText(/数据处理\s*\(\d\)/).click().catch(() => {})
  await overlay.getByText(/监控\s*\(\d\)/).click().catch(() => {})
  await page.waitForTimeout(600)
  await shot(page, '06-03-pc-categories')
})
