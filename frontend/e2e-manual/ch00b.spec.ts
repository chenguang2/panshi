import { test } from '@playwright/test'

test('00 login page (fresh context)', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1680, height: 950 } })
  const p = await ctx.newPage()
  await p.goto('http://localhost:12345/login')
  await p.waitForTimeout(800)
  await p.screenshot({ path: '/tmp/opencode/shots/00-01-login.png' })
  await ctx.close()
})
