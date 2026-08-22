import { test } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png` })

test('08 create route', async ({ page }) => {
  await page.goto('http://localhost:12345/routes')
  await page.waitForTimeout(1500)
  await shot(page, '08-01-route-empty')
  await page.locator('button', { hasText: /新建路由|添加路由/ }).first().click()
  await page.waitForTimeout(800)
  await shot(page, '08-02-route-form')
})
