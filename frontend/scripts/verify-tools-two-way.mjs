/**
 * tools-two-way-panels 真机验收（任务 3.2）：URL / Base64 / YAML↔JSON 互转
 * 三工具两框对等往返——正向 + 反向都在真实页面验证（约定 #21/#51）。
 * 运行：node scripts/verify-tools-two-way.mjs
 */
import { chromium } from 'playwright'
import fs from 'node:fs'

const base = 'http://localhost:12345'
const outDir = '/tmp/opencode/tools-two-way-acceptance'
fs.mkdirSync(outDir, { recursive: true })

const results = []
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —— ' + detail : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text())
})

/** 双 textarea 工具的往返断言：正向左→右、反向右→左，最终左框还原为原文 */
async function roundTrip(tool, original, forwardBtn, reverseBtn, forwardExpect) {
  await page.goto(base + `/tools?tool=${tool}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.tools-content textarea', { timeout: 10000 })
  const tas = page.locator('.tools-content textarea')
  await tas.nth(0).fill(original)
  await page.locator('.panel-actions button', { hasText: forwardBtn }).click()
  await page.waitForTimeout(300)
  const fwd = (await tas.nth(1).inputValue()).trim()
  check(`${tool} 正向（${forwardBtn}）`, fwd.length > 0 && fwd.includes(forwardExpect), fwd.slice(0, 50))
  await page.screenshot({ path: `${outDir}/${tool}-forward.png` })
  // 反向：清左框，从右框发起
  await tas.nth(0).fill('')
  await page.locator('.panel-actions button', { hasText: reverseBtn }).click()
  await page.waitForTimeout(300)
  const back = (await tas.nth(0).inputValue()).replace(/\n+$/, '')
  check(`${tool} 反向（${reverseBtn}）左框还原原文`, back === original, back.slice(0, 50))
  await page.screenshot({ path: `${outDir}/${tool}-reverse.png` })
}

try {
  await page.goto(base + '/login', { waitUntil: 'networkidle' })
  await page.fill('#username', 'admin')
  await page.fill('#password', 'panshi123')
  await page.click('.login-btn')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(800)

  await roundTrip(
    'url',
    'https://example.com?name=张三&age=18',
    '编码 →',
    '← 解码',
    'https%3A%2F%2Fexample.com',
  )
  await roundTrip('base64', 'Hello World', '编码 →', '← 解码', 'SGVsbG8gV29ybGQ=')
  await roundTrip('convert', 'key: value', '转 JSON →', '← 转 YAML', '"key": "value"')

  // 互转右框可编辑（去 readonly）
  await page.goto(base + '/tools?tool=convert', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.tools-content textarea')
  const readonly = await page.locator('.tools-content textarea').nth(1).getAttribute('readonly')
  check('互转右框已放开编辑（无 readonly）', readonly === null)
} catch (e) {
  check('脚本执行', false, String(e))
  await page.screenshot({ path: `${outDir}/99-error.png`, fullPage: true }).catch(() => {})
}

await browser.close()
check('无 console/page error', errors.length === 0, errors.slice(0, 3).join(' | '))
console.log(results.join('\n'))
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0)
