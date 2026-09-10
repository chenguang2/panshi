import { chromium } from 'playwright'
const browser = await chromium.launch()
const page = await browser.newPage()
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 200)))
await page.goto('http://localhost:12345/login', { waitUntil: 'networkidle' })
await page.fill('#username', 'admin')
await page.fill('#password', 'panshi123')
await page.click('button[type="submit"], .login-btn, button:has-text("登录")')
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15000 })
await page.goto('http://localhost:12345/audit-log', { waitUntil: 'networkidle' })
await page.waitForTimeout(2000)
const html = await page.evaluate(() => {
  const bar = document.querySelector('.audit-filter-bar')
  const bc = document.querySelector('.header-breadcrumb')
  return {
    barTag: bar ? bar.children[0]?.tagName : 'NO BAR',
    barHTML: bar ? bar.outerHTML.slice(0, 400) : 'NO BAR',
    breadcrumb: bc ? bc.textContent.trim() : 'NO BC',
    selects: document.querySelectorAll('.audit-filter-bar select').length,
    antdSelects: document.querySelectorAll('.audit-filter-bar .ant-select').length,
  }
})
console.log(JSON.stringify(html, null, 2))
console.log('console errors:', errors.slice(0, 5))
await browser.close()
