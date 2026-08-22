import { test } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

test('04 global rule', async ({ page }) => {
  await page.goto('http://localhost:12345/global-rules')
  await page.waitForTimeout(1500)
  await shot(page, '04-01-globalrules-empty')
  await page.locator('button', { hasText: '添加全局规则' }).first().click()
  await page.waitForTimeout(800)
  await shot(page, '04-02-gr-form')
  const modal = page.locator('.modal-overlay:visible .modal')
  await modal.locator('input[type="text"]').first().fill('全局链路追踪')
  await modal.locator('textarea').fill('为所有请求注入 TraceID，便于全链路日志检索')
  await shot(page, '04-03-gr-form-filled')
})

test('05 plugin metadata', async ({ page }) => {
  await page.goto('http://localhost:12345/plugin-metadata')
  await page.waitForTimeout(1500)
  await shot(page, '05-01-metadata-empty')
  await page.locator('button', { hasText: '添加插件元数据' }).first().click()
  await page.waitForTimeout(600)
  const modal = page.locator('.modal-overlay:visible .modal')
  await modal.locator('select').nth(0).selectOption({ label: '演示集群' })
  await page.waitForTimeout(800)
  await shot(page, '05-02-metadata-form')
})
