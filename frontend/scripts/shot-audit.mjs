import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

mkdirSync('/tmp/audit-shots', { recursive: true })
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1600, height: 900 } })
const page = await context.newPage()

await page.goto('http://localhost:12345/login', { waitUntil: 'networkidle' })
await page.fill('#username', 'admin')
await page.fill('#password', 'panshi123')
await page.click('button[type="submit"], .login-btn, button:has-text("登录")')
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 })

await page.goto('http://localhost:12345/routes', { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await page.screenshot({ path: '/tmp/audit-shots/routes.png', fullPage: true })
console.log('routes captured')

await page.goto('http://localhost:12345/audit-log', { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
await page.screenshot({ path: '/tmp/audit-shots/audit.png', fullPage: true })
console.log('audit captured')

await browser.close()
