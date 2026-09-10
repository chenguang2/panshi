/**
 * 用户操作手册截图脚本（任务 2.1：登录态复用、统一视口、输出 docs/user-manual/images/）。
 *
 * 用法（在 frontend/ 下运行）：
 *   node scripts/manual-screenshots.mjs                    # 按 SHOTS 清单截图
 *   node scripts/manual-screenshots.mjs --only 00-01-login # 只截指定名称
 *   node scripts/manual-screenshots.mjs --out /tmp/shots   # 自定义输出目录（默认 docs/user-manual/images）
 *
 * 环境变量：MANUAL_BASE_URL（默认 http://localhost:12345）、MANUAL_USER / MANUAL_PASS（默认 admin/panshi123）。
 */
import { chromium } from 'playwright'
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FRONTEND_ROOT = resolve(__dirname, '..')
const args = process.argv.slice(2)
const argOf = (flag) => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}

const BASE_URL = process.env.MANUAL_BASE_URL || 'http://localhost:12345'
const OUT_DIR = resolve(argOf('--out') || resolve(FRONTEND_ROOT, '..', 'docs/user-manual/images'))
const ONLY = argOf('--only')
const STATE_FILE = resolve(FRONTEND_ROOT, 'node_modules/.manual-auth-state.json')
const VIEWPORT = { width: 1600, height: 900 } // 统一视口

/** 截图清单：name = 输出文件名（不含扩展名），path = 登录后访问的路由。 */
const SHOTS = [
  { name: '00-01-login', path: '/login', preLogin: true },
  { name: '00-02-dashboard-empty', path: '/' },
  { name: '00-03-db-management', path: '/database' },
  // 按章节补充：{ name: '02-01-cluster-list', path: '/clusters' },
]

mkdirSync(OUT_DIR, { recursive: true })
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: VIEWPORT })

// 登录态复用：已有 storage state 则直接注入，否则登录一次并保存
if (existsSync(STATE_FILE)) {
  await context.addStorageState({ file: STATE_FILE })
  console.log('已复用登录态:', STATE_FILE)
}

const page = await context.newPage()
const needLogin = async () => {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' })
  return page.url().includes('/login')
}

const login = async () => {
  if (!(await needLogin())) return
  await page.fill('#username', process.env.MANUAL_USER || 'admin')
  await page.fill('#password', process.env.MANUAL_PASS || 'panshi123')
  await page.click('button[type="submit"], .login-btn, button:has-text("登录")')
  await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 15_000 })
  await context.storageState({ path: STATE_FILE })
  console.log('登录成功，登录态已保存')
}

await login()

let count = 0
for (const shot of SHOTS) {
  if (ONLY && shot.name !== ONLY) continue
  if (shot.preLogin) {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' })
  } else {
    if (await needLogin()) await login()
    await page.goto(`${BASE_URL}${shot.path}`, { waitUntil: 'networkidle' })
  }
  await page.waitForTimeout(500) // 等待渲染稳定
  const file = resolve(OUT_DIR, `${shot.name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  console.log('已截图:', file)
  count++
}

await browser.close()
console.log(`完成，共 ${count} 张 → ${OUT_DIR}`)
