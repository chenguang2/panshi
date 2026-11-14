/**
 * node-list-column-resize 真机验收（任务 3.2，约定 #21/#51）：
 * ① 窄视口横向滚动 + IP/操作列固定 ② 拖拽调宽实时生效 ③ 刷新保持 ④ popover 重置列宽。
 * 运行：node scripts/verify-node-column-resize.mjs
 */
import { chromium } from 'playwright'
import fs from 'node:fs'

const base = 'http://localhost:12345'
const outDir = '/tmp/opencode/node-column-resize-acceptance'
fs.mkdirSync(outDir, { recursive: true })

const results = []
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —— ' + detail : ''}`)
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console: ' + m.text())
})

try {
  await page.goto(base + '/login', { waitUntil: 'networkidle' })
  await page.fill('#username', 'admin')
  await page.fill('#password', 'panshi123')
  await page.click('.login-btn')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(800)

  // ── ① 窄视口：横向滚动出现，固定列生效 ──
  await page.goto(base + '/nodes', { waitUntil: 'networkidle' })
  await page.waitForSelector('.ant-table-thead th', { timeout: 15000 })
  // 真正的滚动容器是 .ant-table-content（外层 .ant-table 是包装，不滚动）
  const scrollInfo = await page.evaluate(() => {
    const el = document.querySelector('.ant-table-content')
    return el ? { sw: el.scrollWidth, cw: el.clientWidth } : null
  })
  check('窄视口横向滚动出现（scrollWidth > clientWidth）', !!scrollInfo && scrollInfo.sw > scrollInfo.cw, JSON.stringify(scrollInfo))
  // 滚动前记录 IP 列位置（ip 前还有 selection/# 两个固定列，钉位偏移 = 77 而非 0）
  const beforeIpLeft = await page.evaluate(() => {
    const wrap = document.querySelector('.ant-table-content')
    const wrapRect = (wrap ?? document.body).getBoundingClientRect()
    const ths = [...document.querySelectorAll('.ant-table-thead th')]
    const ip = ths.find((t) => t.textContent?.trim() === 'IP')
    return ip ? Math.round(ip.getBoundingClientRect().left - wrapRect.left) : -1
  })
  // 向右滚后 IP 列仍贴左侧、操作列贴右侧
  await page.evaluate(() => {
    const el = document.querySelector('.ant-table-content')
    if (el) el.scrollLeft = 800
  })
  await page.waitForTimeout(400)
  const fixedPos = await page.evaluate(() => {
    const wrap = document.querySelector('.ant-table-content')
    const wrapRect = (wrap ?? document.body).getBoundingClientRect()
    const ths = [...document.querySelectorAll('.ant-table-thead th')]
    const ip = ths.find((t) => t.textContent?.trim() === 'IP')
    const act = ths.find((t) => t.textContent?.includes('操作'))
    return {
      ipLeft: ip ? Math.round(ip.getBoundingClientRect().left - wrapRect.left) : null,
      actRight: act ? Math.round(wrapRect.right - act.getBoundingClientRect().right) : null,
    }
  })
  check('滚动后 IP 列贴左侧固定（偏移≈0）', fixedPos.ipLeft !== null && Math.abs(fixedPos.ipLeft - beforeIpLeft) < 5, JSON.stringify(fixedPos) + ` beforeIp=${beforeIpLeft}`)
  check('滚动后操作列贴右侧固定（偏移≈0）', fixedPos.actRight !== null && Math.abs(fixedPos.actRight) < 30)
  await page.screenshot({ path: outDir + '/01-narrow-scroll.png' })

  // ── ② 拖拽调宽：滚动使目标列离开固定列覆盖带（真实用户用法），再以真实鼠标拖拽 ──
  await page.evaluate(() => {
    const el = document.querySelector('.ant-table-content')
    if (el) el.scrollLeft = 300
  })
  await page.waitForTimeout(300)
  const thEdge = page.locator('.ant-table-thead th', { hasText: 'Edge 安装路径' }).first()
  const handle = thEdge.locator('.col-resize-handle')
  check('拖拽柄存在', (await handle.count()) === 1)
  const before = (await thEdge.boundingBox()).width
  const hb = await handle.boundingBox()
  // 确认手柄此刻不被固定列覆盖（elementFromPoint 应命中手柄自身）
  const intercepted = await page.evaluate(
    ([x, y]) => {
      const el = document.elementFromPoint(x, y)
      return el ? !el.classList.contains('col-resize-handle') : true
    },
    [hb.x + hb.width / 2, hb.y + hb.height / 2],
  )
  check('手柄未被固定列覆盖（可点）', !intercepted)
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x + 140, hb.y + hb.height / 2, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(400)
  const after = (await thEdge.boundingBox()).width
  check('拖拽后列宽实时增加（+100px 级）', after > before + 60, `before=${before.toFixed(0)} after=${after.toFixed(0)}`)
  await page.screenshot({ path: outDir + '/02-after-drag.png' })

  // ── ③ 刷新保持 ──
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.ant-table-thead th', { timeout: 15000 })
  const thEdge2 = page.locator('.ant-table-thead th', { hasText: 'Edge 安装路径' }).first()
  const persisted = (await thEdge2.boundingBox()).width
  check('刷新后列宽保持', Math.abs(persisted - after) < 12, `persisted=${persisted.toFixed(0)} vs after=${after.toFixed(0)}`)

  // ── ④ popover 重置列宽 ──
  await page.click('button:has-text("列配置")')
  await page.waitForTimeout(500)
  const resetBtn = page.locator('button:has-text("重置列宽")')
  check('popover 内「重置列宽」入口存在', (await resetBtn.count()) === 1)
  await resetBtn.click()
  await page.waitForTimeout(600)
  const reset = (await thEdge2.boundingBox()).width
  check('重置后恢复默认 220px', Math.abs(reset - 220) < 12, `reset=${reset.toFixed(0)}`)
  await page.screenshot({ path: outDir + '/03-after-reset.png' })
  // ── ⑤ 列拖拽移动（方案 A）：真实鼠标拖「Edge 安装路径」到「状态」前，刷新保持 ──
  const thOrder = () =>
    page.evaluate(() => [...document.querySelectorAll('.ant-table-thead th')].map((t) => (t.textContent ?? '').trim()))
  const beforeOrder = await thOrder()
  check('移动前列序符合默认（Edge 在状态前隔列）', beforeOrder.indexOf('Edge 安装路径') < beforeOrder.indexOf('状态'), JSON.stringify(beforeOrder))
  // 滚动 300：Edge 标题无遮挡可按下；落点按状态列几何位置取（move/up 为 document 级，指针悬在固定列覆盖层上不影响）
  await page.evaluate(() => {
    const el = document.querySelector('.ant-table-content')
    if (el) el.scrollLeft = 300
  })
  await page.waitForTimeout(300)
  const thDrag = page.locator('.ant-table-thead th', { hasText: 'Edge 安装路径' }).first()
  const db = await thDrag.boundingBox()
  await page.mouse.move(db.x + 40, db.y + db.height / 2)
  await page.mouse.down()
  // 落点取「状态」列实际位置左半（左半 = 插入状态前）
  const thStatus = page.locator('.ant-table-thead th', { hasText: '状态' }).first()
  const sb = await thStatus.boundingBox()
  await page.mouse.move(sb.x + sb.width * 0.25, db.y + db.height / 2, { steps: 10 })
  await page.waitForTimeout(200)
  const hintTarget = await page.evaluate(() => document.querySelector('.th-resize-wrap.drop-before')?.parentElement?.textContent?.trim() ?? '')
  check('指示线落在「状态」列边界', hintTarget === '状态', hintTarget)
  await page.mouse.up()
  await page.waitForTimeout(400)
  const afterOrder = await thOrder()
  const idxEdge = afterOrder.indexOf('Edge 安装路径')
  const idxStatus = afterOrder.indexOf('状态')
  check('拖拽后列序生效（Edge 紧邻状态前）', idxEdge !== -1 && idxStatus !== -1 && idxEdge === idxStatus - 1, JSON.stringify(afterOrder))
  await page.screenshot({ path: outDir + '/05-after-reorder.png' })
  // 刷新保持
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('.ant-table-thead th', { timeout: 15000 })
  const persistedOrder = await thOrder()
  check('刷新后列序保持', JSON.stringify(persistedOrder) === JSON.stringify(afterOrder))
  await page.screenshot({ path: outDir + '/06-reorder-persisted.png' })
} catch (e) {
  check('脚本执行', false, String(e))
  await page.screenshot({ path: outDir + '/99-error.png', fullPage: true }).catch(() => {})
}

await browser.close()
check('无 console/page error', errors.length === 0, errors.slice(0, 3).join(' | '))
console.log(results.join('\n'))
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0)
