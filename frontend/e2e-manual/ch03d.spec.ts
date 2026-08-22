import { test } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

test('03 read edge.env content', async ({ page }) => {
  await page.goto('http://localhost:12345/edge-env')
  await page.waitForTimeout(1500)
  const selects = page.locator('select.form-input')
  await selects.nth(1).selectOption({ label: '演示集群' })
  await page.waitForTimeout(1200)
  await selects.nth(2).selectOption({ index: 1 })
  await page.waitForTimeout(1500)
  await page.locator('button', { hasText: '获取配置模板' }).first().click()
  // 等 SSE 完成（弹窗出现"完成"或关闭按钮可用）
  await page.waitForTimeout(20000)
  await shot(page, '03-03-edgeenv-read-done')
  // 关闭弹窗
  const closeBtn = page.locator('.modal button', { hasText: '关闭' })
  if (await closeBtn.count()) await closeBtn.first().click()
  await page.waitForTimeout(1500)
  // 导出编辑器内容
  const content = await page.evaluate(() => {
    const mon = (window as any).monaco
    if (mon?.editor?.getModels?.().length) return mon.editor.getModels()[0].getValue()
    return null
  })
  console.log('ENV_CONTENT_START>>>' + (content || 'NULL').slice(0, 3000) + '<<<END')
  await shot(page, '03-04-edgeenv-editor')
})
