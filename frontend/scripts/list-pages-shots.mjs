/**
 * 列表页真机抽查脚本（仅验收用，不入库到 e2e 套件）：
 * 登录 → 逐页截图 → 可选交互探针。用法：node scripts/list-pages-shots.mjs [--out DIR] [--tag before]
 */
import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'

const args = process.argv.slice(2)
function argOf(name, fallback) {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const outDir = argOf('--out', '/tmp/opencode/shots')
const tag = argOf('--tag', 'run')
const base = argOf('--base', 'http://localhost:12345')
fs.mkdirSync(outDir, { recursive: true })

const PAGES = [
  { name: 'nodes', path: '/nodes' },
  { name: 'upstreams', path: '/upstreams' },
  { name: 'routes', path: '/routes' },
]

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(`${base}/login`, { waitUntil: 'networkidle' })
await page.fill('#username', 'admin')
await page.fill('#password', 'panshi123')
await page.click('button[type="submit"]')
await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 20000 })
await page.waitForTimeout(1200)

for (const p of PAGES) {
  await page.goto(`${base}${p.path}`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const file = path.join(outDir, `${tag}-${p.name}.png`)
  await page.screenshot({ path: file, fullPage: false })
  const rows = await page.locator('.ant-table-tbody tr').count()
  const groupRows = await page.locator('tr.l5-group-row').count()
  const headers = await page.locator('.ant-table-thead th').allInnerTexts()
  const toolbarButtons = await page.locator('[data-test="toolbar"] button').allInnerTexts().catch(() => [])
  console.log(
    JSON.stringify({
      page: p.name,
      shot: file,
      rows,
      groupRows,
      headers: headers.map((h) => h.replace(/\s+/g, ' ').trim()),
      toolbarButtons,
    }),
  )
}
console.log('console errors:', errors.slice(0, 10))
await browser.close()
