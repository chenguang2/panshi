/**
 * 破坏性/外部操作用例的共享拦截改造设施（审计 B1-Wave2）。
 *
 * 设计原则：
 * - 真实走到破坏边界之前，用 page.route 拦截破坏请求本身，断言载荷与 UI 反馈；
 * - 后端响应 fulfill 形状逐一对照真实 handler（cluster_routes.py / cluster_upstreams.py /
 *   cluster_nodes.py / edge_sync.build_publish_response），伪造形状漂移会立即暴露；
 * - 造数一律经 API + 唯一命名 `<purpose>-<ts>`，teardown 清理（含历史遗留同前缀数据）；
 * - 环境守卫唯一入口 skipIfNoCluster（API 探测确认），替代旧的 catch-skip；
 * - 等待确认弹窗/进度弹窗失败 = 真实失败（清晰诊断），绝不用 .catch(() => false) 吞成 skip。
 */
import { expect, test, type APIRequestContext, type Locator, type Page } from '@playwright/test'

export const API_BASE = 'http://localhost:9100/api/v1'

/** 唯一命名：`<purpose>-<ts>`，避免与共享 demo 库既有数据冲突 */
export function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}`
}

// ── API 登录 / 造数 / 清理 ──────────────────────────────────────────────

/** API 登录并返回带 Authorization 的 JSON 请求头 */
export async function apiHeaders(request: APIRequestContext): Promise<Record<string, string>> {
  const res = await request.post(`${API_BASE}/auth/login`, { data: { username: 'admin', password: 'panshi123' } })
  expect(res.ok(), `API 登录应成功，实际 ${res.status()}`).toBeTruthy()
  const token = ((await res.json()) as { access_token: string }).access_token
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

/** 经 API 执行 JSON 请求；非 2xx 抛错并附响应体（造数失败必须显式失败，不得静默） */
export async function apiJson<T = Record<string, unknown>>(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  payload?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const res = await request.fetch(`${API_BASE}${path}`, {
    method,
    headers: headers ?? (await apiHeaders(request)),
    data: payload,
  })
  if (!res.ok()) throw new Error(`API ${method} ${path} → ${res.status()} ${await res.text()}`)
  return (await res.json()) as T
}

export interface ClusterRef {
  id: number
  name: string
}

/**
 * 环境守卫唯一入口：目标集群经 API 探测确实不存在时才 test.skip（注明原因）。
 * 优先 id=1（演示库常驻），缺失时回退列表首个；两者皆无 → skip。
 */
export async function skipIfNoCluster(request: APIRequestContext): Promise<ClusterRef | null> {
  const headers = await apiHeaders(request)
  let cluster: ClusterRef | null = null
  const direct = await request.get(`${API_BASE}/clusters/1`, { headers })
  if (direct.ok()) {
    const c = (await direct.json()) as { id: number; name: string }
    cluster = { id: c.id, name: c.name }
  } else {
    const list = await apiJson<{ items: Array<{ id: number; name: string }> }>(
      request,
      'GET',
      '/clusters',
      undefined,
      headers,
    )
    const first = list.items?.[0]
    if (first) cluster = { id: first.id, name: first.name }
  }
  if (!cluster) {
    test.skip(true, 'skipIfNoData：环境中无任何集群（API 探测确认），无法造数')
    return null
  }
  return cluster
}

// ── UI 导航（等待失败 = 真实失败，不用 catch 吞错） ─────────────────────

/** 展开集群卡片对应资源 Tab（统计格：节点/路由/上游）；返回表格 tbody locator */
export async function openClusterTab(page: Page, cluster: ClusterRef, statLabel: string): Promise<Locator> {
  await page.goto('/central-management')
  const card = page.locator('.cl-card').filter({ hasText: cluster.name }).first()
  await expect(card, `集群卡片（${cluster.name}）应渲染`).toBeVisible({ timeout: 15000 })
  const stat = card
    .locator('.cl-stat-link')
    .filter({ has: page.locator('.cl-stat-label', { hasText: statLabel }) })
    .first()
  await expect(stat, `集群卡片「${statLabel}」统计格应可见`).toBeVisible({ timeout: 10000 })
  await stat.click()
  const toolbar = page.locator('.node-actions')
  await expect(toolbar, '展开视图工具栏未出现（Tab 切换失败）').toBeVisible({ timeout: 10000 })
  const table = page.locator('.tab-content .ant-table-tbody')
  await expect(table, '展开视图表格未渲染').toBeVisible({ timeout: 10000 })
  return table
}

/**
 * 打开表格行内搜索（「列配置」弹层 → 显示搜索框）并按关键词过滤。
 * expectRow=false 用于「无结果过滤」（如清空选择的 D8/D9 语义）。
 * demo 库路由 >1000 条（每页 20），造数行必须靠唯一前缀搜索后才能稳定勾选。
 */
export async function filterTableBySearch(
  page: Page,
  table: Locator,
  placeholder: string,
  keyword: string,
  expectRow = true,
): Promise<void> {
  const configBtn = page.locator('button', { hasText: '列配置' }).first()
  await expect(configBtn).toBeVisible({ timeout: 5000 })
  await configBtn.click()
  const toggle = page.locator('.ant-popover .ant-checkbox-wrapper', { hasText: '显示搜索框' }).first()
  await expect(toggle, '列配置弹层中「显示搜索框」开关未出现').toBeVisible({ timeout: 5000 })
  if (!(await toggle.locator('input').isChecked())) await toggle.click()
  // 收起列配置弹层（trigger="click"，再点一次按钮收起；Esc 对 click 触发的 Popover 无效，
  // 弹层不收起会遮住表格复选框拦截后续 check() 点击）
  await configBtn.click()
  await expect(toggle, '列配置弹层未收起').toBeHidden({ timeout: 5000 })
  const input = page.getByPlaceholder(placeholder)
  await expect(input, `搜索框（${placeholder}）未出现`).toBeVisible({ timeout: 5000 })
  await input.fill(keyword)
  await input.press('Enter')
  if (expectRow) {
    await expect(table.locator('tr', { hasText: keyword }).first(), `过滤后应出现匹配 ${keyword} 的行`).toBeVisible({
      timeout: 10000,
    })
  }
}

/** 勾选表格中文本匹配的行（每行一个 needle，用于精确锁定造数行、不误伤真实数据） */
export async function checkRowsByContent(table: Locator, needles: string[]): Promise<void> {
  for (const needle of needles) {
    const row = table.locator('tr', { hasText: needle }).first()
    await expect(row, `应存在匹配 ${needle} 的行`).toBeVisible({ timeout: 10000 })
    await row.locator('input[type="checkbox"]').check()
  }
}

// ── 弹窗等待（超时即失败并给诊断，不允许静默 skip） ─────────────────────

/**
 * AntD AppModal 弹窗（确认删除 / 进度弹窗共用 .ant-modal），按标题定位。
 * 关闭后的 Modal 会以 display:none 残留 DOM，必须限定 :visible 防止多匹配。
 */
export async function expectAntModal(page: Page, titleRe: RegExp, label: string): Promise<Locator> {
  const modal = page
    .locator('.ant-modal:visible')
    .filter({ has: page.locator('.ant-modal-title', { hasText: titleRe }) })
  await expect(modal, `${label}未出现——触发按钮或选择态可能未生效（诊断：检查前置交互）`).toBeVisible({ timeout: 8000 })
  return modal
}

/**
 * 视图级 modal-overlay 弹窗（节点批量动作确认/进度等），按 h2 标题正则精确定位。
 * 这类 overlay 以 display:none 切换且常驻 DOM，:visible + 标题锚点双重限定
 * （如「确认批量启动节点」与「批量启动节点」互为子串，必须用 ^$ 正则区分）。
 */
export async function expectOverlayModal(page: Page, titleRe: RegExp, label: string): Promise<Locator> {
  const modal = page.locator('.modal-overlay:visible').filter({ has: page.locator('h2', { hasText: titleRe }) })
  await expect(modal, `${label}未出现——触发按钮或选择态可能未生效（诊断：检查前置交互）`).toBeVisible({ timeout: 8000 })
  return modal
}

// ── route 拦截器（fulfill 形状逐一对照后端真实 handler） ────────────────

export interface CapturedRequest {
  url: string
  body: Record<string, unknown>
}

export interface BatchDeleteContract {
  /** 请求体 id 字段：route_ids / upstream_ids / node_ids */
  idField: string
  /** 响应条目 id 字段：route_id / upstream_id / node_id */
  resultIdField: string
  /** 响应条目名称字段：route_name / upstream_name / node_ip */
  resultNameField: string
  /** 文案资源名：路由 / 上游 / 节点 */
  label: string
  /** 造数 id → 名称（按捕获的载荷动态拼 fulfill 响应） */
  names: Map<number, string>
}

/**
 * 拦截批量删除端点（DELETE，路径须精确匹配集合端点）：
 * 记录载荷并按后端真实成功形状 fulfill——
 * cluster_routes.py:311 / cluster_upstreams.py:223 / cluster_nodes.py:337 均返回
 * `{message, results: [{<resultIdField>, <resultNameField>, status, results: [{scope:'database',...}]}]}`。
 */
export async function interceptBatchDelete(
  page: Page,
  clusterId: number,
  resource: 'routes' | 'upstreams' | 'nodes',
  contract: BatchDeleteContract,
): Promise<CapturedRequest[]> {
  const captured: CapturedRequest[] = []
  await page.route(`**/api/v1/clusters/${clusterId}/${resource}**`, async (route) => {
    const req = route.request()
    const pathname = new URL(req.url()).pathname
    // 仅拦截集合端点本身；GET/单条 DELETE 等其余请求放行
    if (req.method() !== 'DELETE' || !pathname.endsWith(`/${resource}`)) return route.fallback()
    const body = (req.postDataJSON() || {}) as Record<string, unknown>
    captured.push({ url: req.url(), body })
    const ids = (body[contract.idField] as number[]) || []
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        message: `批量删除完成: ${ids.length} 条${contract.label}`,
        results: ids.map((id) => ({
          [contract.resultIdField]: id,
          [contract.resultNameField]: contract.names.get(id) ?? '',
          status: 'success',
          results: [{ scope: 'database', status: 'success', message: '数据库记录已删除' }],
        })),
      }),
    })
  })
  return captured
}

/**
 * 拦截节点批量动作 POST /clusters/{cid}/nodes/{nid}/start|statistic：
 * 记录 nodeId 并 fulfill 真实成功形状（cluster_nodes.py:391 + _run_nginx_cmd:153 的
 * `{status,message,rc,stdout,stderr,command}`；statistic 另含 statistic.edge_version）。
 */
export async function interceptNodeAction(
  page: Page,
  clusterId: number,
  action: 'start' | 'statistic',
): Promise<number[]> {
  const nodeIds: number[] = []
  await page.route(`**/api/v1/clusters/${clusterId}/nodes/*/${action}`, async (route) => {
    const req = route.request()
    if (req.method() !== 'POST') return route.fallback()
    const m = req.url().match(/\/nodes\/(\d+)\//)
    nodeIds.push(m ? Number(m[1]) : 0)
    const body =
      action === 'statistic'
        ? {
            status: 'ok',
            message: '状态查询完成',
            rc: 0,
            stdout: 'Nginx is running',
            stderr: '',
            command: 'bin/edge status',
            statistic: { edge_version: '3.11.0' },
          }
        : { status: 'ok', message: '启动成功', rc: 0, stdout: 'started', stderr: '', command: 'bin/edge start' }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  return nodeIds
}

/**
 * 拦截发布端点并 fulfill build_publish_response（edge_sync.py:440）真实形状：
 * `{status:'ok', message, version, results:[{node,status,route}]}`
 * —— executePublish 默认渲染会逐节点输出 `node: status（经中继|直连）`。
 */
export async function interceptPublish(page: Page, urlGlob: string): Promise<CapturedRequest[]> {
  const captured: CapturedRequest[] = []
  await page.route(urlGlob, async (route) => {
    const req = route.request()
    if (req.method() !== 'POST') return route.fallback()
    captured.push({ url: req.url(), body: (req.postDataJSON() || {}) as Record<string, unknown> })
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        message: '发布成功，已同步到 2 个节点',
        version: 1,
        results: [
          { node: '10.0.0.1:9180', status: 'success', route: 'relay' },
          { node: '10.0.0.2:9180', status: 'success', route: 'direct' },
        ],
      }),
    })
  })
  return captured
}

// ── teardown（前缀清扫，含历史遗留） ────────────────────────────────────

/** 删除名称以前缀开头的测试路由（delete_db=true 仅清库，RoutePlugin/版本随删） */
export async function cleanupRoutesByPrefix(
  request: APIRequestContext,
  headers: Record<string, string>,
  clusterId: number,
  prefix: string,
): Promise<number> {
  const data = await apiJson<{ items: Array<{ id: number; name: string }> }>(
    request,
    'GET',
    `/clusters/${clusterId}/routes?search=${encodeURIComponent(prefix)}&page_size=100`,
    undefined,
    headers,
  )
  let n = 0
  for (const item of (data.items || []).filter((i) => (i.name || '').startsWith(prefix))) {
    await apiJson(
      request,
      'DELETE',
      `/clusters/${clusterId}/routes/${item.id}`,
      { delete_db: true, delete_edge: false },
      headers,
    )
    n++
  }
  return n
}

/** 删除名称以前缀开头的测试上游（须未被路由引用，造数上游天然满足） */
export async function cleanupUpstreamsByPrefix(
  request: APIRequestContext,
  headers: Record<string, string>,
  clusterId: number,
  prefix: string,
): Promise<number> {
  const data = await apiJson<{ items: Array<{ id: number; name: string }> }>(
    request,
    'GET',
    `/clusters/${clusterId}/upstreams?search=${encodeURIComponent(prefix)}&page_size=100`,
    undefined,
    headers,
  )
  let n = 0
  for (const item of (data.items || []).filter((i) => (i.name || '').startsWith(prefix))) {
    await apiJson(
      request,
      'DELETE',
      `/clusters/${clusterId}/upstreams/${item.id}`,
      { delete_db: true, delete_edge: false },
      headers,
    )
    n++
  }
  return n
}

/** 删除指定 IP 集合的测试节点（跨本集群；DELETE /clusters/{cid}/nodes/{nid}） */
export async function cleanupNodesByIps(
  request: APIRequestContext,
  headers: Record<string, string>,
  ips: string[],
): Promise<number> {
  const data = await apiJson<{ items: Array<{ id: number; ip: string; cluster_id: number }> }>(
    request,
    'GET',
    `/nodes?page_size=100&search=${encodeURIComponent(ips[0]?.split('.').slice(0, 3).join('.') ?? '')}`,
    undefined,
    headers,
  )
  let n = 0
  for (const node of (data.items || []).filter((i) => ips.includes(i.ip))) {
    await apiJson(
      request,
      'DELETE',
      `/clusters/${node.cluster_id}/nodes/${node.id}`,
      { delete_db: true, delete_edge: false },
      headers,
    )
    n++
  }
  return n
}
