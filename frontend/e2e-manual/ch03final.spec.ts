import { test } from '@playwright/test'
import { readFileSync } from 'fs'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

test('03 full: read -> paste edit -> publish', async ({ page }) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('http://localhost:12345/edge-env')
  await page.waitForTimeout(1500)
  const selects = page.locator('select.form-input')
  await selects.nth(1).selectOption({ label: '演示集群' })
  await page.waitForTimeout(1200)
  await selects.nth(2).selectOption({ index: 1 })
  await page.waitForTimeout(1500)
  // 1) 获取配置模板（等待读取弹窗自行完成）
  await page.getByRole('button', { name: '获取配置模板', exact: true }).click()
  // 等读取弹窗出现
  await page.locator('.modal button', { hasText: '关闭' }).first().waitFor({ timeout: 60000 })
  await shot(page, '03-03-edgeenv-read-done')
  await page.locator('.modal button', { hasText: '关闭' }).first().click()
  await page.waitForTimeout(1000)
  // 2) 剪贴板粘贴替换全部内容（绕开 Monaco 自动补全）
  const modified = readFileSync('/tmp/opencode/edge-env-modified.yml', 'utf-8')
  await page.evaluate((t) => navigator.clipboard.writeText(t), modified)
  await page.locator('.monaco-editor').click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Control+V')
  await page.waitForTimeout(1000)
  await shot(page, '03-05-edgeenv-modified')
  // 3) 发布 → diff 弹窗
  await page.getByRole('button', { name: '发布', exact: true }).click()
  await page.waitForTimeout(2500)
  await shot(page, '03-06-publish-diff')
  // 4) 继续选择节点 → 勾选 → 确认发布
  const next = page.locator('.modal-overlay:visible .modal button', { hasText: '继续选择节点' })
  if (await next.count()) {
    await next.first().click()
    await page.waitForTimeout(1500)
    await shot(page, '03-07-publish-nodes')
    const checkbox = page.locator('.modal input[type="checkbox"]').first()
    if (await checkbox.count()) await checkbox.check().catch(() => checkbox.click())
    await page.waitForTimeout(500)
    await shot(page, '03-08-publish-node-checked')
    await page.locator('.modal button', { hasText: '确认发布' }).click()
    await page.waitForTimeout(15000)
    await shot(page, '03-09-publish-progress')
  }
})
