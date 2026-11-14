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
  // ── ⑤ 列拖拽移动（方案 1 实时预览）：拖 Edge → 状态前即时换位；Esc 取消；再次拖拽并刷新保持 ──
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
  // 起始点必须在标题文字上（避开固定列覆盖带与插槽死区）
  await page.mouse.move(db.x + 40, db.y + db.height / 2)
  await page.mouse.down()
  // 拖拽全程抓取光标：body 挂类，指针所指任意元素 cursor 均为 grabbing
  const cursorOk = await page.evaluate(() => document.body.classList.contains('col-move-dragging'))
  const bodyCursor = await page.evaluate(() => getComputedStyle(document.body).cursor)
  check('拖拽全程抓取光标（body 类 + 计算光标）', cursorOk && bodyCursor === 'grabbing', `cursor=${bodyCursor}`)
  // 落点取「状态」列实际位置左半（左半 = 插入状态前）
  const thStatus = page.locator('.ant-table-thead th', { hasText: '状态' }).first()
  const sb = await thStatus.boundingBox()
  await page.mouse.move(sb.x + sb.width * 0.25, db.y + db.height / 2, { steps: 10 })
  await page.waitForTimeout(200)
  const liveOrder = await thOrder()
  const liveEdge = liveOrder.indexOf('Edge 安装路径')
  const liveStatus = liveOrder.indexOf('状态')
  check('拖拽中实时换位（未松手 Edge 已紧邻状态前）', liveEdge !== -1 && liveStatus !== -1 && liveEdge === liveStatus - 1, JSON.stringify(liveOrder))
  const srcCls = await page.evaluate(() => document.querySelector('.th-resize-wrap.dragging-source')?.textContent?.trim() ?? '')
  check('源列表头高亮', srcCls === 'Edge 安装路径', srcCls)
  await page.screenshot({ path: outDir + '/05-live-preview.png' })
  // Esc 取消恢复拖前顺序
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  const cancelledOrder = await thOrder()
  check('Esc 取消恢复拖前顺序', JSON.stringify(cancelledOrder) === JSON.stringify(beforeOrder))
  await page.mouse.up()
  await page.waitForTimeout(300)
  // 再次拖拽（不取消）并刷新验证持久化
  await page.mouse.move(db.x + 40, db.y + db.height / 2)
  await page.mouse.down()
  await page.mouse.move(sb.x + sb.width * 0.25, db.y + db.height / 2, { steps: 10 })
  await page.waitForTimeout(200)
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

  // ── ⑥ 上游/路由列表推广（column-personalization-rollout）──
  for (const [path, pageCls, dragCol, targetCol, scrollW, scrollM] of [
    // scrollW/scrollM：拖宽与拖移前的横向滚动位——源列须滚出固定列覆盖带才可命中
    ['/upstreams', 'upstream-table', '目标节点', '协议', 350, 350],
    ['/routes', 'route-table', '优先级', '方法', 350, 340],
  ]) {
    await page.goto(base + path, { waitUntil: 'networkidle' })
    await page.waitForSelector('.ant-table-thead th', { timeout: 15000 })
    const scrollContent = (left) =>
      page.evaluate(
        ([cls, v]) => {
          const el = document.querySelector('.' + cls + ' .ant-table-content')
          if (el) el.scrollLeft = v
        },
        [pageCls, left],
      )
    // 滚动 + 固定列：窄视口滚动容器出现溢出（真正的滚动容器 = .ant-table-content）
    const ov = await page.evaluate((cls) => {
      const el = document.querySelector('.' + cls + ' .ant-table-content')
      return el ? { sw: el.scrollWidth, cw: el.clientWidth } : { sw: 0, cw: 0 }
    }, pageCls)
    check(`${path} 横向滚动出现`, ov.sw > ov.cw, JSON.stringify(ov))
    // 拖宽「目标节点/URI」+80 并刷新保持
    await scrollContent(scrollW)
    await page.waitForTimeout(300)
    const th0 = page.locator('.ant-table-thead th', { hasText: dragCol }).first()
    const h0 = await th0.locator('.col-resize-handle').boundingBox()
    const w0 = (await th0.boundingBox()).width
    await page.mouse.move(h0.x + h0.width / 2, h0.y + h0.height / 2)
    await page.mouse.down()
    await page.mouse.move(h0.x + 90, h0.y + h0.height / 2, { steps: 6 })
    await page.mouse.up()
    await page.waitForTimeout(300)
    const w1 = (await th0.boundingBox()).width
    check(`${path} 拖宽实时生效`, w1 > w0 + 50, `${w0.toFixed(0)}→${w1.toFixed(0)}`)
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForSelector('.ant-table-thead th', { timeout: 15000 })
    await scrollContent(scrollM)
    await page.waitForTimeout(300)
    const th0b = page.locator('.ant-table-thead th', { hasText: dragCol }).first()
    const w2 = (await th0b.boundingBox()).width
    check(`${path} 刷新后列宽保持`, Math.abs(w2 - w1) < 12, `${w2.toFixed(0)}`)
    // 路由页 D4 短拖守卫（在长拖移动前、源列仍在原位时做）：排序列内小幅位移后松手，
    // 真实浏览器在 mouseup 之后才派发 click 且落在本排序列 th 上，必须被拦截（组件测试
    // 因省略 mouseup 盖不住此序列，此处为真机回归守卫）
    if (pageCls === 'route-table') {
      const sortCls = (cls) =>
        page.evaluate((c) => !!document.querySelector('.' + c + ' .ant-table-column-sort'), cls)
      const thS = page.locator('.ant-table-thead th', { hasText: dragCol }).first()
      const sWrap = await thS.locator('.th-resize-wrap').boundingBox()
      const sy = sWrap.y + sWrap.height / 2
      await page.mouse.move(sWrap.x + sWrap.width / 2, sy)
      await page.mouse.down()
      await page.mouse.move(sWrap.x + sWrap.width / 2 + 30, sy, { steps: 4 })
      await page.mouse.up()
      await page.waitForTimeout(400)
      check(`${path} 排序列内短拖位移不触发排序`, !(await sortCls(pageCls)))
    }
    // 拖拽移动：dragCol → targetCol 左半（实时换位）。起点取标题 wrap 中心（短标签列 +60px 会落到 wrap 外）
    const thT = page.locator('.ant-table-thead th', { hasText: targetCol }).first()
    const thD = page.locator('.ant-table-thead th', { hasText: dragCol }).first()
    const tRect = await thT.boundingBox()
    const dWrap = await thD.locator('.th-resize-wrap').boundingBox()
    await page.mouse.move(dWrap.x + dWrap.width / 2, dWrap.y + dWrap.height / 2)
    await page.mouse.down()
    await page.mouse.move(tRect.x + tRect.width * 0.25, dWrap.y + dWrap.height / 2, { steps: 8 })
    await page.waitForTimeout(150)
    await page.mouse.up()
    await page.waitForTimeout(300)
    const orderNow = await page.evaluate(() => [...document.querySelectorAll('.ant-table-thead th')].map((t) => (t.textContent ?? '').trim()))
    check(
      `${path} 拖拽移动生效（${dragCol} 紧邻 ${targetCol} 前）`,
      orderNow.indexOf(dragCol) === orderNow.indexOf(targetCol) - 1,
      JSON.stringify(orderNow),
    )
    await page.screenshot({ path: outDir + `/09-${path.replace('/', '')}-reorder.png` })
    // 路由页 sorter 手势冲突（D4）：长拖不触发排序；纯点击仍可排序（正向对照防断言恒真）
    if (pageCls === 'route-table') {
      const sortCls = (cls) =>
        page.evaluate((c) => !!document.querySelector('.' + c + ' .ant-table-column-sort'), cls)
      check(`${path} 长拖移动未触发排序`, !(await sortCls(pageCls)))
      await page.locator('.ant-table-thead th', { hasText: dragCol }).first().click()
      await page.waitForTimeout(600)
      check(`${path} 纯点击表头仍触发排序`, await sortCls(pageCls))
      await page.screenshot({ path: outDir + '/09-routes-sort-guard.png' })
    }
    // 重置列宽
    await page.click('button:has-text("重置列宽")')
    await page.waitForTimeout(300)
    const w3 = (await th0b.boundingBox()).width
    check(`${path} 重置列宽恢复默认`, Math.abs(w3 - w0) < 12, `${w3.toFixed(0)}`)
  }
await browser.close()
check('无 console/page error', errors.length === 0, errors.slice(0, 3).join(' | '))
console.log(results.join('\n'))
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0)
