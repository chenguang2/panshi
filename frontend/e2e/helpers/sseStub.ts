/**
 * 中继域（relay）UI e2e 的请求桩 + 页面定位（relay-* spec 共用）。
 *
 * ## 职责边界（必读）
 * 本文件的桩**只覆盖 UI 呈现**：SSE 逐行日志 / 进度百分比 / 终态 rc 语义、REST 列表与
 * CRUD 的错误反馈、配置预览内容、体检结果形状。**ansible / SSH 的真实行为不在这里验证**
 * ——playbook 渲染、false-success 守卫、sshd `sshd -t` 校验与自动回滚、并发 `_INFLIGHT`
 * 的加锁/释放，全部由后端 150+ 例 pytest 负责（backend/tests/test_relay_*.py）。
 *
 * ## 安全前提（本批 e2e 的硬约束）
 * `stubRelayApis()` 用一条 `/api/v1/relay` 前缀的 `page.route` **全量接管**该命名空间：
 * 识别不了的 relay 路径返回 501 并计入 `unmatched`，**绝不 `route.fallback()`**。
 * 因此 init / push-config / sshd-setup 这三条会真跑 ansible 的流在 UI e2e 里
 * 永远不会打到真实后端（未拦截 = 会连真实网关机，这是绝对禁止的）。
 * 规范用法：每个 spec 的 `beforeEach` 里**先** `stubRelayApis(page, ...)`，**再**导航。
 *
 * ## 有意不拦截
 * `PUT /api/v1/clusters/{id}`（区域挂接，relay 页拓扑 popover 用它改 `region_code`）在 relay
 * 命名空间之外，本批 spec 均不触达故未桩。若将来要覆盖「挂接/解挂」，**必须先自建桩**：
 * 它会真写库（不改 Edge、不跑 ansible，但会污染被测数据）。
 *
 * ## 数据形状
 * 所有夹具逐字段对齐真实响应（2026-11-22 curl 实测 `GET /relay/gateways`、
 * `GET /relay/topology`、`GET /relay/gateways/1/config-preview`，以及
 * `backend/app/api/v1/relay.py` 的错误文案），遵守约定 #43：桩形状与真实响应漂移
 * 会让用例静默失效。
 */
import { expect, type Locator, type Page, type Request } from '@playwright/test'

// ══════════════════════════════════════════════════════════════════════════
// 类型（逐字段对齐 backend/app/schemas/relay.py 与真实响应）
// ══════════════════════════════════════════════════════════════════════════

export interface RelayPushDrift {
  added: string[]
  removed: string[]
}

/** `GET /relay/gateways` 列表行（RelayGatewayOut + 列表注入的三个聚合字段） */
export interface RelayRegionRow {
  id: number
  code: string
  name: string
  http_base_url: string | null
  ssh_jump: string | null
  openresty_prefix: string | null
  status: 'enabled' | 'disabled'
  ssh_user: string | null
  ssh_port: number | null
  ansible_python_interpreter: string | null
  ssh_common_args: string | null
  inventory_group_missing: boolean
  /** 列表聚合注入（非库列）：下发确认弹窗用它算「本次将下发 N 个启用节点」 */
  enabled_node_count: number
  total_node_count: number
  /** >0 时删除菜单禁用（先解挂再删） */
  attached_cluster_count: number
  last_pushed_at: string | null
  push_drift: RelayPushDrift | null
  created_at: string
  updated_at: string
}

export interface RelayTopologyNodeRow {
  ip: string
  management_port: number
  status: number
  whitelist_state: 'synced' | 'pending_add' | 'pending_remove' | 'off'
}

export interface RelayTopologyClusterRow {
  id: number
  name: string
  display_name: string | null
  nodes: RelayTopologyNodeRow[]
}

export interface RelayTopologyRegionRow {
  id: number
  code: string
  name: string
  status: string
  http_base_url: string | null
  ssh_jump: string | null
  ssh_user: string | null
  ssh_port: number | null
  openresty_prefix: string | null
  last_pushed_at: string | null
  clusters: RelayTopologyClusterRow[]
}

export interface RelayTopologyClusterRefRow {
  id: number
  name: string
  display_name: string | null
  region_code: string | null
}

export interface RelayTopologyRow {
  regions: RelayTopologyRegionRow[]
  detachable: RelayTopologyClusterRefRow[]
  unregistered_bound_codes: string[]
}

export interface RelayPreviewFileRow {
  path: string
  content: string
  purpose: string
}

export interface RelayPreviewRow {
  region_code: string
  openresty_prefix: string
  listen_port: number
  files: RelayPreviewFileRow[]
  notes: string[]
}

export interface RelayHealthSegmentRow {
  name: string
  ok: boolean
  elapsed_ms?: number
  error?: string
  nodes?: { node: string; ok: boolean; error?: string; ssh_skipped?: boolean; note?: string }[]
}

export interface RelayHealthRow {
  region: string
  ok: boolean
  segments: RelayHealthSegmentRow[]
  error?: string
}

/** SSE 单帧（`data: {...}` 的 JSON 载荷；与后端 event 字典同形） */
export interface SseEvent {
  line?: string
  type?: string
  percent?: number
  rc?: number
  status?: string
  hosts_pattern?: string
  listen_port?: number
  [key: string]: unknown
}

/** 被拦截的请求（断言载荷 / 汇报拦截清单用） */
export interface StubRequest {
  method: string
  /** relay 相对路径 + 查询串，如 `/relay/gateways/1/push-config` */
  path: string
  body: unknown
}

/** SSE 桩形态：先延迟（可断言「流开始前」的 0% 态）再发整段事件流 */
export interface SseStubOptions {
  events: SseEvent[]
  /** 响应前延迟（ms）：Playwright 无法分段推送，延迟窗口用于断言流式开始前的 UI 态 */
  delayMs?: number
  /** 非 2xx：走 useInstallStream 的错误分支（如并发 409） */
  status?: number
  /** 非 2xx 时的 detail（用真实后端文案，见 sseConflictDetail） */
  errorDetail?: string
}

export type UrlMatcher = string | RegExp

export interface RelayStubOverrides {
  regions?: RelayRegionRow[]
  /** 拓扑：缺省由 regions 派生（每区域无挂接集群、无悬空码） */
  topology?: Partial<RelayTopologyRow>
  /** 口令表（按区域 id）；缺省每区域 'e2e-gw-pass'。列表接口永不回传它 */
  credentials?: Record<number, string | null>
  /** 配置预览覆写（按区域 id）；缺省按区域前缀派生 */
  previews?: Record<number, RelayPreviewRow>
  /** 体检两腿是否可达（缺省 true） */
  healthOk?: boolean
}

export interface RelayStub {
  /** 全部被拦截请求（按时间序） */
  readonly requests: StubRequest[]
  /** 桩未覆盖的 relay 路径（正常应为空；非空即说明有请求漏配） */
  readonly unmatched: string[]
  /** 去重后的拦截 URL 清单（验收报告用） */
  interceptedUrls: () => string[]
  /** 当前内存态（断言 CRUD 结果用） */
  findRegion: (code: string) => RelayRegionRow | undefined
  regions: () => RelayRegionRow[]
}

export interface SseStubHandle {
  /** 该 SSE 桩命中的请求（断言 allow_empty / root 凭据等载荷） */
  readonly requests: StubRequest[]
}

// ══════════════════════════════════════════════════════════════════════════
// 夹具构造器（默认值取自真实响应）
// ══════════════════════════════════════════════════════════════════════════

export function relayRegion(
  seed: Pick<RelayRegionRow, 'id' | 'code' | 'name'> & Partial<RelayRegionRow>,
): RelayRegionRow {
  return {
    http_base_url: 'http://10.10.1.1:8443',
    ssh_jump: 'tunnel@10.10.1.1:22',
    openresty_prefix: '/opt/e2e/openresty/nginx',
    status: 'enabled',
    ssh_user: 'relay',
    ssh_port: 22,
    ansible_python_interpreter: null,
    ssh_common_args: '-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null',
    inventory_group_missing: false,
    enabled_node_count: 3,
    total_node_count: 4,
    attached_cluster_count: 0,
    last_pushed_at: null,
    push_drift: null,
    created_at: '2026-11-01T00:00:00',
    updated_at: '2026-11-01T00:00:00',
    ...seed,
  }
}

/**
 * 配置预览夹具：内容关键行与后端渲染函数（relay_init.render_relay_server_conf /
 * relay_push.render_nginx_map / render_sshd_dropin）同构，便于断言「预览 = 实发」的界面呈现。
 */
export function relayPreview(code: string, prefix: string, listenPort = 8443): RelayPreviewRow {
  const confDir = `${prefix.replace(/\/$/, '')}/conf`
  return {
    region_code: code,
    openresty_prefix: prefix.replace(/\/$/, ''),
    listen_port: listenPort,
    files: [
      {
        path: `${confDir}/relay_8443.conf`,
        content:
          `# 由磐石平台初始化写入（region: ${code}），勿手改核心段\n` +
          'include edge_targets.conf;\n\n' +
          'server {\n' +
          `    listen ${listenPort};\n` +
          '    server_name _;\n\n' +
          '    location / {\n' +
          '        # 白名单外目标直接拒绝（防 SSRF）\n' +
          '        if ($edge_upstream = "") { return 403; }\n' +
          '        proxy_pass http://$edge_upstream;\n' +
          '        proxy_set_header Host $http_x_edge_target;\n' +
          '    }\n' +
          '}\n',
        purpose: '8443 server 块（「初始化网关」写入）',
      },
      {
        path: `${confDir}/edge_targets.conf`,
        content:
          `# 由磐石平台自动生成（region: ${code}），勿手改\n` +
          'map $http_x_edge_target $edge_upstream {\n' +
          '    default                "";\n' +
          '    "10.10.1.11:16620"     "10.10.1.11:16620";\n' +
          '}\n',
        purpose: '节点白名单 map（「初始化网关」/「下发配置」写入）',
      },
      {
        path: `${confDir}/nginx.conf`,
        content: '    include relay_8443.conf;',
        purpose: '在 nginx.conf 的 http 块末尾追加该 include（「初始化网关」写入，已存在则跳过）',
      },
      {
        path: '/etc/ssh/sshd_config.d/relay-tunnel.conf',
        content:
          `# 由磐石平台自动生成（region: ${code}），勿手改\n` +
          'AllowTcpForwarding yes\n' +
          'PermitOpen 10.10.1.11:16620\n',
        purpose: 'sshd 跳板转发配置（AllowTcpForwarding + PermitOpen）',
      },
    ],
    // 逐条对齐真实响应（后端返回 4 条 note：手工应用 / 校验 / 重载 / 只读说明）
    notes: [
      `手工应用：将以上内容写入对应路径（OpenResty 前缀 ${prefix.replace(/\/$/, '')}）。`,
      `校验配置：${prefix.replace(/\/$/, '')}/sbin/nginx -p ${prefix.replace(/\/$/, '')} -c conf/nginx.conf -t`,
      `重载（已运行）：${prefix.replace(/\/$/, '')}/sbin/nginx -p ${prefix.replace(/\/$/, '')} -c conf/nginx.conf -s reload；未运行则直接启动。`,
      '本窗口为只读预览，不会改动网关机；调整节点/集群后重新打开即可刷新白名单。',
    ],
  }
}

/** 体检夹具：段名与 relay_health._probe_region 一致（网关HTTP腿 / SSH跳板） */
export function relayHealthRow(code: string, ok = true): RelayHealthRow {
  return {
    region: code,
    ok,
    segments: [
      ok
        ? { name: '网关HTTP腿', ok: true, elapsed_ms: 12 }
        : { name: '网关HTTP腿', ok: false, elapsed_ms: 10000, error: 'timed out' },
      ok
        ? { name: 'SSH跳板', ok: true, elapsed_ms: 35 }
        : { name: 'SSH跳板', ok: false, elapsed_ms: 0, error: '不可达' },
    ],
  }
}

/**
 * 成功流帧序列：逐行 stdout（每行带 percent）+ 终态帧。
 * 终态帧用 `type: 'complete'` + rc/status/hosts_pattern/listen_port —— 与
 * ansible_service 的终态事件同形（RelayGateways.vue 的 finalEvent 依赖这些字段）。
 */
export function sseSuccess(opts: {
  lines: string[]
  hostsPattern: string
  listenPort?: number
  percentSteps?: number[]
}): SseEvent[] {
  const steps = opts.percentSteps ?? [15, 40, 70, 90]
  const frames: SseEvent[] = opts.lines.map((line, i) => ({
    line,
    percent: steps[Math.min(i, steps.length - 1)],
  }))
  frames.push({
    type: 'complete',
    rc: 0,
    status: 'ok',
    percent: 100,
    hosts_pattern: opts.hostsPattern,
    listen_port: opts.listenPort ?? 8443,
  })
  return frames
}

/**
 * 失败流帧序列：正常 stdout 行 + stderr 行（生产里 stderr 也以 line 帧混流发出）
 * + 终态 `rc: 2 / status: 'failed'`（与 ansible 非零退出同形）。
 */
export function sseFailure(opts: {
  lines: string[]
  stderrLines?: string[]
  rc?: number
  status?: string
  hostsPattern?: string
}): SseEvent[] {
  const frames: SseEvent[] = [
    ...opts.lines.map((line, i) => ({ line, percent: 20 + i * 20 })),
    ...(opts.stderrLines ?? []).map((line) => ({ line })),
  ]
  frames.push({
    type: 'complete',
    rc: opts.rc ?? 2,
    status: opts.status ?? 'failed',
    percent: 100,
    hosts_pattern: opts.hostsPattern ?? 'gateways_e2e',
  })
  return frames
}

/** 并发 409 的真实 detail（backend/app/api/v1/relay.py::_acquire_region） */
export function sseConflictDetail(code: string): string {
  return `区域「${code}」已有进行中的初始化/下发任务，请等待其结束`
}

// ══════════════════════════════════════════════════════════════════════════
// 桩实现
// ══════════════════════════════════════════════════════════════════════════

const RELAY_URL = /\/api\/v1\/relay(?:\/|$)/
const API_PREFIX = '/api/v1'

interface SsePlan {
  matcher: UrlMatcher
  options: SseStubOptions
  requests: StubRequest[]
}

interface StubResponse {
  status: number
  contentType: string
  body: string
}

interface RelayStubState {
  regions: RelayRegionRow[]
  topology: RelayTopologyRow
  credentials: Record<number, string | null>
  previews: Record<number, RelayPreviewRow>
  healthOk: boolean
  nextId: number
  requests: StubRequest[]
  unmatched: string[]
  ssePlans: SsePlan[]
}

const STATES = new WeakMap<Page, RelayStubState>()

function json(status: number, payload: unknown): StubResponse {
  return { status, contentType: 'application/json', body: JSON.stringify(payload) }
}

function readBody(req: Request): unknown {
  try {
    return req.postDataJSON()
  } catch {
    return req.postData() ?? null
  }
}

/** 匹配判定：RegExp 直接用；字符串含 `*` 按通配（`*` → `.*`）；否则按「结尾匹配」 */
function matches(matcher: UrlMatcher, relayPath: string): boolean {
  if (matcher instanceof RegExp) return matcher.test(relayPath)
  if (matcher.includes('*')) {
    const pattern = new RegExp(`^${matcher.split('*').map(escapeRegExp).join('.*')}$`)
    return pattern.test(relayPath)
  }
  return relayPath === matcher || relayPath.endsWith(matcher)
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function toTopologyRegion(row: RelayRegionRow): RelayTopologyRegionRow {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
    http_base_url: row.http_base_url,
    ssh_jump: row.ssh_jump,
    ssh_user: row.ssh_user,
    ssh_port: row.ssh_port,
    openresty_prefix: row.openresty_prefix,
    last_pushed_at: row.last_pushed_at,
    clusters: [],
  }
}

/** SSE 编码：逐帧 `data: {json}\n\n`；**不发 [DONE]**（生产里流结束即结束） */
function encodeSse(events: SseEvent[]): string {
  return events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('')
}

function findRegion(state: RelayStubState, id: number): RelayRegionRow | undefined {
  return state.regions.find((r) => r.id === id)
}

/**
 * 注册中继域全量桩（**必须先于导航调用**）。
 *
 * 拦截范围：`/api/v1/relay/**` 全命名空间（列表 / 拓扑 / 清单健康 / 凭据 /
 * 配置预览 / 体检 / 区域 CRUD / init・push-config・sshd-setup 三条 SSE）。
 */
export async function stubRelayApis(page: Page, overrides: RelayStubOverrides = {}): Promise<RelayStub> {
  const regions = (overrides.regions ?? [relayRegion({ id: 1, code: 'e2e-a', name: 'E2E 甲局' })]).map((r) => ({
    ...r,
  }))
  const credentials: Record<number, string | null> = { ...(overrides.credentials ?? {}) }
  for (const row of regions) {
    if (!(row.id in credentials)) credentials[row.id] = 'e2e-gw-pass'
  }
  const previews: Record<number, RelayPreviewRow> = { ...(overrides.previews ?? {}) }
  for (const row of regions) {
    if (!(row.id in previews) && row.openresty_prefix) {
      previews[row.id] = relayPreview(row.code, row.openresty_prefix)
    }
  }

  const state: RelayStubState = {
    regions,
    topology: {
      regions: overrides.topology?.regions ?? regions.map(toTopologyRegion),
      detachable: overrides.topology?.detachable ?? [],
      unregistered_bound_codes: overrides.topology?.unregistered_bound_codes ?? [],
    },
    credentials,
    previews,
    healthOk: overrides.healthOk ?? true,
    nextId: Math.max(0, ...regions.map((r) => r.id)) + 1,
    requests: [],
    unmatched: [],
    ssePlans: [],
  }

  await page.route(RELAY_URL, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const relayPath = url.pathname.replace(new RegExp(`^${API_PREFIX}`), '')
    const entry: StubRequest = { method: req.method(), path: relayPath + url.search, body: readBody(req) }
    state.requests.push(entry)
    const res = await resolve(state, entry, relayPath, url.searchParams)
    if (!res) {
      // 绝不 fallback：漏配的 relay 请求必须显式失败（放开即可能真跑 ansible）
      state.unmatched.push(`${entry.method} ${entry.path}`)
      await route.fulfill({
        status: 501,
        contentType: 'application/json',
        body: JSON.stringify({ detail: `e2e 桩未覆盖：${entry.method} ${relayPath}` }),
      })
      return
    }
    await route.fulfill({ status: res.status, contentType: res.contentType, body: res.body })
  })

  STATES.set(page, state)

  return {
    requests: state.requests,
    unmatched: state.unmatched,
    interceptedUrls: () => [...new Set(state.requests.map((r) => `${r.method} ${r.path}`))],
    findRegion: (code: string) => state.regions.find((r) => r.code === code),
    regions: () => state.regions,
  }
}

async function resolve(
  state: RelayStubState,
  entry: StubRequest,
  relayPath: string,
  query: URLSearchParams,
): Promise<StubResponse | null> {
  const { method } = entry

  // ── 只读端点 ──
  if (method === 'GET' && relayPath === '/relay/gateways') return json(200, state.regions)
  if (method === 'GET' && relayPath === '/relay/topology') return json(200, state.topology)
  if (method === 'GET' && relayPath === '/relay/gateways/inventory-status') {
    // 预留分支：当前页面无消费方（清单健康尚未接入 UI），保留以免将来接入时静默落到真实后端
    return json(200, { derived: true, orphan_groups: [], missing_groups: [] })
  }
  if (method === 'GET' && relayPath === '/relay/health-check') {
    const code = query.get('region')
    if (code) {
      const row = state.regions.find((r) => r.code === code)
      if (!row) return json(404, { detail: '区域不存在' })
      return json(200, relayHealthRow(code, state.healthOk))
    }
    return json(200, { regions: state.regions.map((r) => relayHealthRow(r.code, state.healthOk)) })
  }

  const actionMatch = /^\/relay\/gateways\/(\d+)\/(credential|config-preview|init|push-config|sshd-setup)$/.exec(
    relayPath,
  )
  if (actionMatch) {
    const id = Number(actionMatch[1])
    const action = actionMatch[2]
    const row = findRegion(state, id)
    if (!row) return json(404, { detail: '区域不存在' })

    if (method === 'GET' && action === 'credential') {
      return json(200, { ssh_password: state.credentials[id] ?? null })
    }
    if (method === 'GET' && action === 'config-preview') {
      const preview = state.previews[id]
      if (!preview) return json(400, { detail: '区域未配置 openresty_prefix，无法推导配置文件路径' })
      return json(200, preview)
    }
    if (method === 'POST' && (action === 'init' || action === 'push-config' || action === 'sshd-setup')) {
      const plan = state.ssePlans.find((p) => matches(p.matcher, relayPath))
      if (!plan) return null
      plan.requests.push(entry)
      if (plan.options.delayMs) {
        await new Promise((done) => setTimeout(done, plan.options.delayMs))
      }
      const status = plan.options.status ?? 200
      if (status < 200 || status >= 300) {
        return json(status, { detail: plan.options.errorDetail ?? `请求失败 (${status})` })
      }
      return { status: 200, contentType: 'text/event-stream', body: encodeSse(plan.options.events) }
    }
    return null
  }

  // ── 区域 CRUD（错误文案逐字取自 backend/app/api/v1/relay.py） ──
  if (method === 'POST' && relayPath === '/relay/gateways') {
    const payload = (entry.body ?? {}) as Partial<RelayRegionRow>
    if (state.regions.some((r) => r.code === payload.code)) {
      return json(400, { detail: '区域code已存在' })
    }
    const created: RelayRegionRow = {
      ...relayRegion({
        id: state.nextId++,
        code: String(payload.code ?? ''),
        name: String(payload.name ?? ''),
      }),
      ...payload,
    }
    state.regions.push(created)
    state.topology.regions = state.regions.map(toTopologyRegion)
    return json(200, created)
  }

  const itemMatch = /^\/relay\/gateways\/(\d+)$/.exec(relayPath)
  if (itemMatch) {
    const id = Number(itemMatch[1])
    const row = findRegion(state, id)
    if (!row) return json(404, { detail: '区域不存在' })
    if (method === 'PUT') {
      const payload = (entry.body ?? {}) as Partial<RelayRegionRow>
      if (payload.code && payload.code !== row.code) return json(400, { detail: '区域code不可修改' })
      // 与后端一致：exclude_unset 语义——只更新请求体里显式出现的字段
      for (const [key, value] of Object.entries(payload)) {
        if (key === 'code' || key === 'id') continue
        ;(row as unknown as Record<string, unknown>)[key] = value
      }
      row.updated_at = '2026-11-22T00:00:00'
      state.topology.regions = state.regions.map(toTopologyRegion)
      return json(200, row)
    }
    if (method === 'DELETE') {
      if (row.attached_cluster_count > 0) {
        return json(409, { detail: `区域仍被集群挂接，无法删除: e2e-cluster-${row.code}` })
      }
      state.regions = state.regions.filter((r) => r.id !== id)
      state.topology.regions = state.regions.map(toTopologyRegion)
      return json(200, { ok: true })
    }
    return null
  }

  return null
}

/**
 * 为某个 SSE 端点挂计划（**必须在 stubRelayApis 之后调用**）。
 *
 * 后注册优先：同一端点可先桩失败流、再桩成功流（验证「失败后重试成功」）。
 * 传事件数组时按 200 + 整段事件流返回；传 options 可加延迟 / 非 2xx（如 409）。
 */
export async function stubSseStream(
  page: Page,
  urlPattern: UrlMatcher,
  eventsOrOptions: SseEvent[] | SseStubOptions,
): Promise<SseStubHandle> {
  const state = STATES.get(page)
  if (!state) {
    throw new Error(
      'stubSseStream 必须在 stubRelayApis(page) 之后调用：否则中继写请求可能穿透到真实后端并真跑 ansible/SSH',
    )
  }
  const options: SseStubOptions = Array.isArray(eventsOrOptions) ? { events: eventsOrOptions } : eventsOrOptions
  const plan: SsePlan = { matcher: urlPattern, options, requests: [] }
  state.ssePlans.unshift(plan)
  return { requests: plan.requests }
}

// ══════════════════════════════════════════════════════════════════════════
// 页面定位（六份 relay spec 共用，选择器来自真实页面实测）
// ══════════════════════════════════════════════════════════════════════════

/**
 * 打开中继区域管理页并切到**表格视图**（默认是拓扑视图；表格视图才有逐区域动作按钮，
 * 便于断言行级结果）。视图切换是纯前端 local ref，不发请求。
 */
export async function openRelayTable(page: Page): Promise<void> {
  await page.goto('/relay-gateways')
  await expect(
    page.locator('.viewbar'),
    '中继页视图切换条应可见（relay_gateway 开关关闭或路由缺失时本批用例无意义）',
  ).toBeVisible({ timeout: 15000 })
  await page.locator('.viewbar button', { hasText: '表格视图' }).click()
  await expect(page.locator('.region-table'), '表格视图应有区域表格').toBeVisible({ timeout: 10000 })
  await page.waitForLoadState('networkidle')
}

/** 区域表格中按区域码锁定一行 */
export function regionRow(page: Page, code: string): Locator {
  return page.locator('.region-table .ant-table-tbody tr', { hasText: code }).first()
}

/** 展开某行的「更多 ▾」并点选动作项（编辑/初始化网关/配置跳板转发/查看配置/查看凭据/删除…） */
export async function openRowMenuItem(page: Page, code: string, itemText: string): Promise<void> {
  await regionRow(page, code).locator('button', { hasText: '更多' }).click()
  const item = page.locator('.ant-dropdown:visible .ant-dropdown-menu-item', { hasText: itemText }).first()
  await expect(item, `「更多 ▾」菜单应出现「${itemText}」`).toBeVisible({ timeout: 5000 })
  await item.click()
}

/**
 * 视图级/程序化弹窗（`.modal-overlay` + `.modal-header h2`），按标题文本定位。
 * 排除执行结果抽屉（`.ner-tabs`）：抽屉标题与「配置跳板转发」等同名，不排除会撞 strict mode。
 */
export function confirmModal(page: Page, title: string): Locator {
  return page
    .locator('.modal-overlay:visible')
    .filter({ hasNot: page.locator('.ner-tabs') })
    .filter({ has: page.locator('.modal-header h2', { hasText: title }) })
}

/** 执行过程抽屉（NodeExecutionResultDrawer：唯一含 `.ner-tabs` 的 modal-overlay） */
export function execDrawer(page: Page): Locator {
  return page.locator('.modal-overlay').filter({ has: page.locator('.ner-tabs') })
}
