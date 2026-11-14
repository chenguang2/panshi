/**
 * tools-help-drawer 真实页面验收（任务 4.1，约定 #51：验收落在用户实际操作的页面）。
 * 直连常驻 dev 服务 http://localhost:12345（约定 #8），不启停服务。
 * 运行：node scripts/verify-tools-help.mjs
 */
import { chromium } from 'playwright'
import fs from 'node:fs'

const base = 'http://localhost:12345'
const outDir = '/tmp/opencode/tools-help-acceptance'
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

try {
  // 登录（#username/#password 为守卫选择器）
  await page.goto(base + '/login', { waitUntil: 'networkidle' })
  await page.fill('#username', 'admin')
  await page.fill('#password', 'panshi123')
  await page.click('.login-btn')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(800)

  // 强制改密弹窗（features.force_default_password_change 开启时）先关掉流程
  if (await page.locator('.ant-modal').count()) {
    check('强制改密弹窗出现', true, '需要人工处理，先截图')
    await page.screenshot({ path: outDir + '/00-force-change-password.png', fullPage: true })
  }

  // ── 1. Lua 工具：打开帮助抽屉 ──
  await page.goto(base + '/tools?tool=lua', { waitUntil: 'networkidle' })
  await page.waitForSelector('.btn-help', { timeout: 15000 })
  await page.click('.btn-help')
  await page.waitForSelector('.ant-drawer-content', { state: 'visible', timeout: 5000 })
  const title1 = (await page.locator('.ant-drawer-title').textContent()) ?? ''
  const bodyText = (await page.locator('.ant-drawer-body').textContent()) ?? ''
  check('抽屉标题跟随工具（Lua 互转 · 帮助）', title1.includes('Lua 互转 · 帮助'), title1)
  check('六段齐全', ['这是什么', '为什么需要它', '什么时候用', '怎么用', '示例', '注意 / 坑'].every((s) => bodyText.includes(s)))
  check('Lua 文档真实内容（pre_functions）', bodyText.includes('pre_functions'))
  check('示例段 mono 块', (await page.locator('.th-pre').count()) === 2)
  check('注意段警告块', (await page.locator('.th-cautions').count()) === 1)
  await page.waitForTimeout(600)
  await page.screenshot({ path: outDir + '/01-lua-drawer.png' })

  // ── 2. 点击遮罩关闭（遮罩即最顶层元素 = 用户点遮罩路径；导航被遮罩拦截已由上轮运行证实）──
  await page.locator('.ant-drawer-mask').click()
  await page.waitForSelector('.ant-drawer-content', { state: 'hidden', timeout: 5000 })
  check('点击遮罩 → 抽屉关闭（视觉隐藏）', !(await page.locator('.ant-drawer-content').isVisible()))
  await page.locator('.nav-item', { hasText: '时间戳' }).click()
  await page.waitForTimeout(400)
  await page.click('.btn-help')
  await page.waitForSelector('.ant-drawer-content', { state: 'visible', timeout: 5000 })
  const title2 = (await page.locator('.ant-drawer-title').textContent()) ?? ''
  const body2 = (await page.locator('.ant-drawer-body').textContent()) ?? ''
  check('重开抽屉内容跟随新工具（时间戳 · naive UTC）', title2.includes('时间戳转换 · 帮助') && body2.includes('naive UTC'), title2)
  await page.waitForTimeout(600)
  await page.screenshot({ path: outDir + '/02-follow-timestamp.png' })

  // ── 3. 关闭抽屉回到现场，输入不清空 ──
  await page.locator('.ant-drawer-close').click()
  await page.waitForSelector('.ant-drawer-content', { state: 'hidden', timeout: 5000 })
  check('抽屉已关闭（视觉隐藏）', !(await page.locator('.ant-drawer-content').isVisible()))
  const tsInput = page.locator('.tools-content textarea').first()
  await tsInput.fill('1793331059')
  await page.waitForTimeout(400)
  const gridText = await page.locator('.result-grid').textContent()
  check('关闭后原工具可用（时间戳输入即算）', gridText.includes('2026'), (gridText ?? '').slice(0, 60))
  await page.screenshot({ path: outDir + '/03-back-to-work.png' })

  // ── 4. Keepalived 长文档：抽屉内滚动、不撑破布局 ──
  await page.goto(base + '/tools?tool=keepalived', { waitUntil: 'networkidle' })
  await page.waitForSelector('.btn-help', { timeout: 15000 })
  await page.click('.btn-help')
  await page.waitForSelector('.ant-drawer-content', { state: 'visible', timeout: 5000 })
  await page.waitForTimeout(600)
  const scroll = await page.evaluate(() => {
    const b = document.querySelector('.ant-drawer-body')
    return b ? { sh: b.scrollHeight, ch: b.clientHeight, overflowY: getComputedStyle(b).overflowY } : null
  })
  check('长文档抽屉内滚动（scrollHeight > clientHeight）', !!scroll && scroll.sh > scroll.ch, JSON.stringify(scroll))
  const noHOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  check('页面无横向溢出', noHOverflow)
  await page.evaluate(() => {
    const b = document.querySelector('.ant-drawer-body')
    if (b) b.scrollTop = b.scrollHeight
  })
  await page.waitForTimeout(300)
  await page.screenshot({ path: outDir + '/04-keepalived-drawer-scrolled.png' })

  // ── 5. 深链直达 + 每个工具头都有帮助按钮 ──
  const keys = ['url', 'json', 'sm4', 'base64', 'yaml', 'diff', 'timestamp', 'jwt', 'convert', 'textdiff', 'ipcalc', 'hash']
  let allHeader = true
  for (const k of ['lua', ...keys, 'keepalived']) {
    await page.goto(base + `/tools?tool=${k}`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.btn-help', { timeout: 10000 })
    if ((await page.locator('.btn-help').count()) !== 1) allHeader = false
  }
  check('14 个工具头部均有帮助入口（深链逐一）', allHeader)
  // 循环后停在最后一个工具，重开抽屉验证标题与内容
  await page.click('.btn-help')
  await page.waitForSelector('.ant-drawer-content', { state: 'visible', timeout: 5000 })
  await page.waitForTimeout(600)
  const titleK = (await page.locator('.ant-drawer-title').textContent()) ?? ''
  check('keepalived 抽屉标题', titleK.includes('Keepalived 配置 · 帮助') || titleK.includes('Keepalived'), titleK)
  check('五处差异文档内容', ((await page.locator('.ant-drawer-body').textContent()) ?? '').includes('五处'))
} catch (e) {
  check('脚本执行', false, String(e))
  await page.screenshot({ path: outDir + '/99-error.png', fullPage: true }).catch(() => {})
}

await browser.close()
check('无 console/page error', errors.length === 0, errors.slice(0, 3).join(' | '))
console.log(results.join('\n'))
const failed = results.filter((r) => r.startsWith('FAIL'))
process.exit(failed.length ? 1 : 0)
