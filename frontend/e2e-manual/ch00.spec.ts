import { test, expect } from '@playwright/test'

const shot = (page: any, name: string) => page.screenshot({ path: `/tmp/opencode/shots/${name}.png`, fullPage: false })

test('00 login page (logged out view)', async ({ page }) => {
  // 用无痕上下文截登录页
  const ctx = page.context().browser()!.newContext({ viewport: { width: 1680, height: 950 } })
  const p = await ctx.newPage()
  await p.goto('http://localhost:12345/login')
  await p.waitForTimeout(800)
  await p.screenshot({ path: '/tmp/opencode/shots/00-01-login.png' })
  await ctx.close()
})

test('00 empty dashboard + sidebar', async ({ page }) => {
  await page.goto('http://localhost:12345/')
  await page.waitForTimeout(2000)
  await shot(page, '00-02-dashboard-empty')
})

test('00 database management switch page', async ({ page }) => {
  await page.goto('http://localhost:12345/database-management')
  await page.waitForTimeout(1500)
  await shot(page, '00-03-db-management')
})
