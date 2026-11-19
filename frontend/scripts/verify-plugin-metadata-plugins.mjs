/**
 * plugin-metadata-plugins-config 真机验证（tasks 4.4）
 * 直连常驻开发实例（前端 12345 / 后端 12344，勿启停）。
 *
 * 验证链（期望集由 API 精确计算：目录 /plugins/builtin ∩ features.yaml 清单
 * /system/features − 该集群已配置 /clusters/{id}/plugin-metadata）：
 *  A. 独立页默认清单：添加弹窗插件下拉选项 = 期望集（默认 14 ∩ enabled_plugins 13）。
 *  B. features.yaml 热改：plugin_metadata_plugins 追加 redirect → 后端 mtime 热加载
 *     （免重启）→ 前端刷新页面 → 下拉即时出现 redirect。
 *  B2. 无 metadata_schema 插件（redirect）可创建并打开编辑抽屉（表单模式回落路由级
 *     schema + JSON 模式可达）；验证后 API 清理（仅 delete_db，不触 Edge）。
 *  C. 恢复默认清单 → redirect 从下拉消失。
 *  D. 统一管理 Tab 入口（/central-management 集群卡「插件元数据」Tab）：
 *     可用插件面板同清单过滤（默认无 redirect）。
 *
 * 用法：node scripts/verify-plugin-metadata-plugins.mjs（在 frontend/ 下运行）
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FRONT = 'http://localhost:12345'
const API = 'http://localhost:12344/api/v1'
const YAML_PATH = resolve(process.cwd(), '../backend/features.yaml')
const SHOTS = '/tmp/opencode/plugin-metadata-plugins-config'
const MARK = '  - security_super_user\n'
const ADD_LINE = '  - redirect\n'

const results = []
function record(step, ok, detail = '') {
  results.push({ step, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${step}${detail ? ` — ${detail}` : ''}`)
}

// ── API helpers（期望集与清理走后端 API，精确且免 UI 噪声）──
async function apiLogin() {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'panshi123' }),
  })
  const d = await r.json()
  return d.access_token
}
async function apiGet(token, path) {
  const r = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  return r.json()
}
async function expectedOptionValues(token, clusterId) {
  const [feat, catalog, configured] = await Promise.all([
    apiGet(token, '/system/features'),
    apiGet(token, '/plugins/builtin'),
    apiGet(token, `/clusters/${clusterId}/plugin-metadata`),
  ])
  const list = feat.plugin_metadata_plugins || []
  const names = catalog.plugins.map((p) => p.name)
  const conf = new Set((configured.items || []).map((i) => i.plugin_name))
  const allowed = list.length === 0 ? names : names.filter((n) => list.includes(n))
  return allowed.filter((n) => !conf.has(n))
}

function addRedirectToList() {
  const raw = readFileSync(YAML_PATH, 'utf-8')
  if (!raw.includes(MARK)) throw new Error('features.yaml 定位锚（security_super_user 行）缺失')
  writeFileSync(YAML_PATH, raw.replace(MARK, MARK + ADD_LINE))
}
function restoreYaml() {
  const raw = readFileSync(YAML_PATH, 'utf-8')
  writeFileSync(YAML_PATH, raw.replace(MARK + ADD_LINE, MARK))
}

async function login(page) {
  await page.goto(`${FRONT}/login`)
  await page.fill('#username', 'admin')
  await page.fill('#password', 'panshi123')
  await page.click('button[type="submit"]')
  await page.waitForURL(/localhost:12345\/$/) // 独立脚本无 baseURL，等绝对 URL
}

/** 打开添加弹窗并选中指定显示名的集群；返回 (modal, 实际下拉 option value 数组) */
async function openModalAndPickCluster(page, clusterLabel) {
  await page.goto(`${FRONT}/plugin-metadata`)
  await page.locator('button:has-text("添加插件元数据")').first().waitFor({ state: 'visible', timeout: 15000 })
  await page.locator('button:has-text("添加插件元数据")').first().click()
  const modal = page.locator('.modal-overlay').filter({ hasText: '添加插件元数据' })
  await modal.waitFor({ state: 'visible' })
  const clusterSelect = modal.locator('.cluster-select .ant-select-selector')
  await clusterSelect.click()
  const opts = page.locator('.ant-select-dropdown .ant-select-item-option')
  await opts.first().waitFor({ state: 'visible', timeout: 8000 })
  const labels = (await opts.allTextContents()).map((t) => t.trim()).filter((t) => t && !t.includes('选择集群'))
  if (labels.length === 0) throw new Error('开发库无集群可选')
  const want = clusterLabel && labels.includes(clusterLabel) ? clusterLabel : labels[0]
  await opts.filter({ hasText: want }).first().click()
  await page.waitForTimeout(600) // onCreateClusterChange 拉取该集群已配置清单
  return modal
}

async function dropdownValues(modal) {
  const select = modal.locator('select').first()
  await select.waitFor({ state: 'visible' })
  // 期望与断言一律用 option 的 value（插件 name），显示文本的破折号排版不入断言
  return select.locator('option').evaluateAll((els) => els.map((o) => o.value))
}

// ──────────────────────────────────────────────
const token = await apiLogin()
const clustersResp = await apiGet(token, '/clusters')
const clusters = clustersResp.items || []
if (clusters.length === 0) {
  console.log('开发库无集群，无法真机验证（请先建集群后重跑）')
  process.exit(1)
}
// 选已配置元数据最少的集群（下拉最饱满；且 redirect 大概率未配置）
const confCounts = await Promise.all(
  clusters.map(async (c) => {
    const d = await apiGet(token, `/clusters/${c.id}/plugin-metadata`)
    return { id: c.id, name: c.display_name, conf: (d.items || []).length }
  }),
)
confCounts.sort((a, b) => a.conf - b.conf)
const target = confCounts[0]
console.log(`目标集群：${target.name}（已配置 ${target.conf} 项）`)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
let failed = 0
try {
  await login(page)

  // ── A. 独立页默认清单 ──
  const expectedA = await expectedOptionValues(token, target.id)
  let modal = await openModalAndPickCluster(page, target.name)
  const valuesA = await dropdownValues(modal)
  const aOk = JSON.stringify(valuesA) === JSON.stringify(['', ...expectedA])
  record('A. 独立页默认下拉 = 期望集（默认清单 ∩ 目录 − 已配置）', aOk, `实际: ${valuesA.join(', ')} / 期望: ${expectedA.join(', ')}`)
  if (!aOk) failed++
  await page.screenshot({ path: `${SHOTS}/A-default-dropdown.png` })

  // ── B. features.yaml 热改 → 免重启即时生效 ──
  addRedirectToList()
  await page.waitForTimeout(1200) // 后端 mtime 热加载在下次请求时触发
  const expectedB = await expectedOptionValues(token, target.id)
  modal = await openModalAndPickCluster(page, target.name) // 整页重进（store 缓存短路 → 需刷新）
  const valuesB = await dropdownValues(modal)
  const bOk = JSON.stringify(valuesB) === JSON.stringify(['', ...expectedB]) && expectedB.includes('redirect')
  record('B. yaml 追加 redirect → 刷新页面下拉即时出现（热加载免重启）', bOk, `实际: ${valuesB.join(', ')}`)
  if (!bOk) failed++
  await page.screenshot({ path: `${SHOTS}/B-hot-reload-redirect.png` })

  // ── B2. 无 metadata_schema 插件：创建 → 编辑抽屉（表单模式回落路由级 schema）→ API 清理 ──
  if (valuesB.includes('redirect')) {
    const select = modal.locator('select').first()
    await select.selectOption('redirect')
    await modal.locator('button:has-text("保存")').click()
    await page.waitForTimeout(1500) // 创建 → 保存成功引导弹窗
    const guide = page.locator('.modal-overlay').filter({ hasText: '保存成功' })
    if (await guide.isVisible().catch(() => false)) {
      await guide.locator('button:has-text("稍后")').first().click()
    }
    const redirectCard = page.locator('.pml-card').filter({ hasText: 'redirect' }).first()
    await redirectCard.waitFor({ state: 'visible', timeout: 8000 })
    await redirectCard.locator('button:has-text("编辑")').click()
    const drawer = page.locator('.ant-drawer').first()
    await drawer.waitFor({ state: 'visible', timeout: 8000 })
    await page.waitForTimeout(800) // 抽屉表单按 schema 渲染完成
    // 表单模式回落路由级 schema：redirect 无 metadata_schema，抽屉按其路由 schema 渲染字段
    const drawerText = await drawer.innerText()
    const formFallbackOk = drawerText.includes('HTTP 强制跳转 HTTPS') || drawerText.includes('http_to_https')
    const toggleCount = await drawer.locator('.toggle input[type="checkbox"]').count()
    record(
      'B2. redirect 元数据可创建，编辑抽屉表单模式回落路由级 schema + 双模式开关在场',
      formFallbackOk && toggleCount >= 1,
      `schema 字段渲染: ${formFallbackOk} / toggle 数: ${toggleCount}`,
    )
    if (!formFallbackOk || toggleCount < 1) failed++
    await page.screenshot({ path: `${SHOTS}/B2-redirect-edit-drawer.png` })
    // API 清理：仅 delete_db（不触 Edge 节点）
    const del = await fetch(`${API}/clusters/${target.id}/plugin-metadata/redirect`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ delete_db: true, delete_edge: false }),
    })
    record('B2-cleanup. API 删除验证用 redirect 元数据（delete_db only）', del.status === 200, `HTTP ${del.status}`)
    if (del.status !== 200) failed++
  } else {
    record('B2. redirect 选项缺失，跳过创建链路', false, 'B 阶段应已出现 redirect 选项')
    failed++
  }

  // ── C. 恢复默认清单 ──
  restoreYaml()
  await page.waitForTimeout(1200)
  modal = await openModalAndPickCluster(page, target.name)
  const valuesC = await dropdownValues(modal)
  const cOk = !valuesC.includes('redirect') && JSON.stringify(valuesC) === JSON.stringify(['', ...expectedA])
  record('C. yaml 恢复默认 → redirect 从下拉消失，且等值于 A 阶段', cOk, `实际: ${valuesC.join(', ')}`)
  if (!cOk) failed++

  // ── D. 统一管理 Tab 入口（/central-management 集群卡统计格 → 最大化 Tab 面板）──
  try {
    await page.goto(`${FRONT}/central-management`)
    const cards = page.locator('.cl-card')
    await cards.first().waitFor({ state: 'visible', timeout: 15000 })
    // 目标集群卡（按显示名定位，退回第一张）
    let card = cards.filter({ hasText: target.name }).first()
    if (!(await card.isVisible().catch(() => false))) card = cards.first()
    const stat = card.locator('.cl-stat-cell').filter({ hasText: '插件元数据' }).first()
    await stat.scrollIntoViewIfNeeded()
    await stat.click()
    // 统计格点击 → maximizeCluster + switchTab('globalPlugins') → PluginMetadata 渲染
    const panel = page.locator('.available-panel')
    await panel.waitFor({ state: 'visible', timeout: 10000 })
    // 面板计数在目录请求返回前先渲染 (0)，轮询至非 0 或超时（目标集群已配置 0 项）
    let panelText = await panel.innerText()
    for (let i = 0; i < 16 && panelText.includes('(0)'); i++) {
      await page.waitForTimeout(500)
      panelText = await panel.innerText()
    }
    const dOk =
      !panelText.includes('redirect') && (panelText.includes('data_center') || panelText.includes('log_process'))
    record('D. 统一管理 Tab 可用插件面板同清单（默认无 redirect，含默认可选插件）', dOk, `面板: ${panelText.replace(/\n/g, ' ').slice(0, 60)}`)
    if (!dOk) failed++
    await page.screenshot({ path: `${SHOTS}/D-tab-available-panel.png` })
  } catch (e) {
    record('D. 统一管理 Tab 入口验证', false, String(e.message || e).slice(0, 120))
    failed++
  }
} catch (e) {
  record('脚本执行中断', false, String(e.message || e))
  failed++
  try {
    restoreYaml()
  } catch {}
} finally {
  await browser.close()
}

console.log(`\n${failed === 0 ? 'ALL PASS' : `FAILED=${failed}`}`)
process.exit(failed === 0 ? 0 : 1)
