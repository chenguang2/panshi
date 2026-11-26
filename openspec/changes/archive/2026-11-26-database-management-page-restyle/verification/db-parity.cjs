/**
 * database-management-page-restyle · parity 取证脚本（方法见 AGENTS #82）
 *
 * 用法（任意目录）：node openspec/changes/database-management-page-restyle/verification/db-parity.cjs
 * 依赖：frontend 的 playwright（绝对路径 require，沿用 ck-parity.cjs 口径）。
 *
 * 三件事：
 *   1) 同一批元素在设计页（file://）与实现页（12345）之间逐项量测计算样式与盒尺寸；
 *   2) 实现页用 route 注入与设计页相同的样本数据（3 连接、待重启关闭），保证「同数据」对比；
 *   3) 另跑一次 pending_restart=true，验证待重启三处提示（页头徽标 / 名称行徽标 / 警示条）。
 */
const path = require('path')
const { chromium } = require('/home/qcg/panshi/frontend/node_modules/playwright')

const OUT = __dirname
const DESIGN = 'file:///home/qcg/panshi/docs/ui/Live-Artifact-5/proposal-c/database-management.html'
const APP = 'http://localhost:12345'

const conns = [
  { id: 'conn_1', type: 'sqlite', name: '本机 SQLite（开发）', path: './data/panshi.db', host: null, port: 5432, database: null, username: null, password_set: false, ssl: false, display_address: './data/panshi.db' },
  { id: 'conn_2', type: 'postgres', name: '生产 PG', path: null, host: '192.168.100.90', port: 5432, database: 'panshi', username: 'panshi', password_set: true, ssl: false, display_address: '192.168.100.90:5432/panshi' },
  { id: 'conn_3', type: 'postgres', name: '预发 PG', path: null, host: '192.168.100.91', port: 5432, database: 'panshi_uat', username: 'panshi', password_set: true, ssl: false, display_address: '192.168.100.91:5432/panshi_uat' },
]

const METRIC_JS = (sel) => {
  const g = (s) => {
    const el = document.querySelector(s)
    if (!el) return null
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return {
      h: Math.round(r.height * 10) / 10,
      pad: cs.padding,
      font: cs.fontSize,
      weight: cs.fontWeight,
      lh: cs.lineHeight,
      color: cs.color,
      bg: cs.backgroundColor,
      radius: cs.borderRadius,
    }
  }
  return {
    h1: g(sel.h1),
    cardhead: g(sel.cardhead),
    hero: g(sel.hero),
    pill: g(sel.pill),
    th: g(sel.th),
    td: g(sel.td),
    statLabel: g(sel.statLabel),
    statValue: g(sel.statValue),
    twoCard: g(sel.twoCard),
    primaryBtn: g(sel.primaryBtn),
  }
}

const DESIGN_SEL = {
  h1: '.page-header h1',
  cardhead: '.db-cardhead',
  hero: '.db-hero',
  pill: '.db-hero .pill',
  th: '.l5-table thead th',
  td: '.l5-table tbody td',
  statLabel: '.db-stat-label',
  statValue: '.db-stat-value',
  twoCard: '.db-two .l5-card',
  primaryBtn: '.page-header-actions .btn-primary',
}

const IMPL_SEL = {
  h1: '.page-header h1',
  cardhead: '.dbm-cardhead',
  hero: '.dbm-hero',
  pill: '.dbm-hero .pill',
  th: '.connection-table thead th',
  td: '.connection-table tbody tr.ant-table-row td',
  statLabel: '.dbb-sum-label',
  statValue: '.dbb-sum-value',
  twoCard: '.dbm-two .l5-card',
  primaryBtn: '.page-header-actions .btn-primary',
}

async function login(page) {
  await page.goto(APP + '/login')
  await page.fill('#username', 'admin')
  await page.fill('#password', 'panshi123')
  await page.click('button[type="submit"]')
  await page.waitForTimeout(1500)
}

async function mockCommon(page, { status, connections, backupConfig, backupHistory }) {
  await page.route('**/api/v1/database/status', (r) => r.fulfill({ json: status }))
  await page.route('**/api/v1/database/connections', (r) => r.fulfill({ json: connections }))
  await page.route('**/api/v1/db-backup/config', (r) => r.fulfill({ json: backupConfig }))
  await page.route('**/api/v1/db-backup/history*', (r) => r.fulfill({ json: backupHistory }))
  await page.route('**/api/v1/database/running-tasks', (r) =>
    r.fulfill({ json: { migration: { in_progress: false }, tasks: [] } }),
  )
  await page.route('**/api/v1/database/migration*', (r) => r.fulfill({ json: [] }))
}

;(async () => {
  const browser = await chromium.launch()

  // 1. 设计页
  const design = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  await design.goto(DESIGN)
  await design.waitForTimeout(200)
  const dMetrics = await design.evaluate(METRIC_JS, DESIGN_SEL)
  await design.screenshot({ path: path.join(OUT, 'design-page.png') })

  // 2. 实现页（同数据注入）
  const impl = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  await mockCommon(impl, {
    status: { active: conns[0], connections_count: 3, version: 7, pending_restart: false },
    connections: conns,
    backupConfig: {
      config: {
        enabled: true,
        targets: [
          { id: 1, name: '局内DR', enabled: true },
          { id: 2, name: '中心机房', enabled: true },
          { id: 3, name: '旧机房', enabled: false },
        ],
        last_success_at: '2025-11-25T03:00:12',
        last_status: 'success',
      },
      status: { applicable: true, in_progress: false, next_run_at: '2025-11-26T03:00:00' },
    },
    backupHistory: {
      total: 1,
      page: 1,
      page_size: 1,
      items: [
        { id: 1, started_at: '2025-11-25T03:00:12', status: 'success', targets: [{ target_id: 1, status: 'success' }, { target_id: 2, status: 'success' }] },
      ],
    },
  })
  await login(impl)
  await impl.goto(APP + '/database-management')
  await impl.waitForTimeout(2500)
  const iMetrics = await impl.evaluate(METRIC_JS, IMPL_SEL)
  await impl.screenshot({ path: path.join(OUT, 'impl-page.png') })

  console.log('design', JSON.stringify(dMetrics, null, 1))
  console.log('impl  ', JSON.stringify(iMetrics, null, 1))

  // 3. 待重启三处提示
  const pending = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  await mockCommon(pending, {
    status: { active: conns[1], connections_count: 3, version: 8, pending_restart: true },
    connections: conns,
    backupConfig: { config: { enabled: false, targets: [] }, status: { applicable: true, in_progress: false, next_run_at: null } },
    backupHistory: { total: 0, page: 1, page_size: 1, items: [] },
  })
  await login(pending)
  await pending.goto(APP + '/database-management')
  await pending.waitForTimeout(2000)
  const pendingState = await pending.evaluate(() => ({
    badges: [...document.querySelectorAll('[data-test="page-stat"]')].map((e) => e.textContent.trim()),
    nameRowBadge: document.querySelector('.dbm-name-row .pending-restart-badge')?.textContent.trim(),
    hint: document.querySelector('.pending-restart-hint')?.textContent.trim().slice(0, 40),
    verdict: document.querySelector('.dbm-verdict .pill')?.textContent.trim(),
    verdictClass: document.querySelector('.dbm-verdict .pill')?.className,
  }))
  console.log('pending', JSON.stringify(pendingState, null, 1))
  await pending.screenshot({ path: path.join(OUT, 'impl-pending.png') })

  await browser.close()
})()
