import { test } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

// 续跑：四层代理已创建（本地服务转发 8880），仅发布
test('10b stream proxy: publish', async ({ page }) => {
  test.setTimeout(180000)
  await page.goto('http://localhost:12345/stream-proxies')
  await page.waitForTimeout(1500)
  await page.locator('.sp-card', { hasText: '本地服务转发' }).locator('button', { hasText: '发布' }).first().click()
  await page.waitForTimeout(1000)
  const pubModal = page.locator('.modal-overlay:visible').last()
  await pubModal.locator('.action-link', { hasText: '全选' }).first().click()
  await page.waitForTimeout(500)
  await shot(page, '10-06-stream-publish-nodes')
  await pubModal.locator('button', { hasText: '确认发布' }).click()
  await page.waitForTimeout(12000)
  await shot(page, '10-07-stream-publish-result')
})
