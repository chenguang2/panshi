import { test } from '@playwright/test'
import { readFileSync } from 'fs'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

test('03 edit monaco and publish', async ({ page }) => {
  await page.goto('http://localhost:12345/edge-env')
  await page.waitForTimeout(1500)
  const selects = page.locator('select.form-input')
  await selects.nth(1).selectOption({ label: '演示集群' })
  await page.waitForTimeout(1200)
  await selects.nth(2).selectOption({ index: 1 })
  await page.waitForTimeout(1500)
  // 获取配置模板
  await page.locator('button', { hasText: '获取配置模板' }).first().click()
  await page.waitForTimeout(25000)
  const closeBtn = page.locator('.modal button', { hasText: '关闭' })
  if (await closeBtn.count()) await closeBtn.first().click()
  await page.waitForTimeout(1000)
  // Monaco 全选替换为修改后的内容
  const modified = readFileSync('/tmp/opencode/edge-env-modified.yml', 'utf-8')
  const editor = page.locator('.monaco-editor')
  await editor.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.insertText(modified)
  await page.waitForTimeout(800)
  await shot(page, '03-05-edgeenv-modified')
  // 发布
  await page.locator('button', { hasText: /^发布$/ }).first().click()
  await page.waitForTimeout(2000)
  await shot(page, '03-06-publish-diff')
})
