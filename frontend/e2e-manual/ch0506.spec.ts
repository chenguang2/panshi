import { test } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

test('05 metadata create', async ({ page }) => {
  await page.goto('http://localhost:12345/plugin-metadata')
  await page.waitForTimeout(1500)
  await page.locator('button', { hasText: '添加插件元数据' }).first().click()
  await page.waitForTimeout(600)
  const modal = page.locator('.modal-overlay:visible .modal')
  await modal.locator('select').nth(0).selectOption({ label: '演示集群' })
  await page.waitForTimeout(800)
  // 选择插件（下拉含 name — description）
  const opts = modal.locator('select').nth(1)
  const labels = await opts.locator('option').allTextContents()
  console.log('PLUGIN_OPTIONS:', JSON.stringify(labels))
  await shot(page, '05-02-metadata-form')
})

test('06 plugin config open form', async ({ page }) => {
  await page.goto('http://localhost:12345/plugin-configs')
  await page.waitForTimeout(1500)
  await shot(page, '06-01-pluginconfigs-empty')
  await page.locator('button', { hasText: /添加插件组|新建/ }).first().click()
  await page.waitForTimeout(800)
  await shot(page, '06-02-pc-form')
})
