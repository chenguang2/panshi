import { test } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

test('04 publish global rule', async ({ page }) => {
  await page.goto('http://localhost:12345/global-rules')
  await page.waitForTimeout(1500)
  await page.locator('.btn-secondary', { hasText: '发布' }).first().click()
  await page.waitForTimeout(1500)
  await shot(page, '04-08-gr-publish-modal')
  // 勾选全部节点
  const boxes = page.locator('.modal-overlay:visible input[type="checkbox"]')
  const n = await boxes.count()
  for (let i = 0; i < n; i++) await boxes.nth(i).check().catch(() => {})
  await page.waitForTimeout(400)
  await shot(page, '04-09-gr-publish-nodes')
  await page.locator('.modal-overlay:visible button', { hasText: /确认|发布/ }).last().click()
  await page.waitForTimeout(15000)
  await shot(page, '04-10-gr-publish-progress')
})
