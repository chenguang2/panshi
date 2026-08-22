import { test } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

test('07 create upstream', async ({ page }) => {
  await page.goto('http://localhost:12345/upstreams')
  await page.waitForTimeout(1500)
  await shot(page, '07-01-upstream-empty')
  await page.locator('button', { hasText: '新建上游' }).first().click()
  await page.waitForTimeout(800)
  await shot(page, '07-02-upstream-form')
})
