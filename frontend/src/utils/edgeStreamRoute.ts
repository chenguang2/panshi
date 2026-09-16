/**
 * Edge 直连「四层代理」表单的校验与写载荷构造（纯函数，便于单测）。
 *
 * 背景（openspec/changes/add-edge-stream-route-create-edit）：
 * - Edge 的 Stream 路由写入是**全量替换**（PUT），线上既有路由会带表单不覆盖的字段
 *   （`plugins`、`upstream.checks`、`upstream.pass_host` …），因此编辑必须以原对象为
 *   基底合并、只覆盖表单负责的字段，否则会静默丢配置。
 * - Edge 侧创建/更新都不校验载荷（实测空载荷也返回 200 并生成无效路由），
 *   校验必须在这里与后端各做一层。
 */

export interface StreamRouteNodeForm {
  host: string
  weight: number
}

export interface StreamRouteUpstreamForm {
  type: string
  scheme: string
  hash_on: string
  key: string
  nodes: StreamRouteNodeForm[]
}

export interface StreamRouteForm {
  server_port: number | null
  name: string
  protocol: string
  sni: string
  remote_addr: string
  upstream: StreamRouteUpstreamForm
}

/** 列表项（Edge 列表返回 `{ value, key, modifiedIndex, createdIndex }`） */
export interface EdgeStreamRouteRow {
  value?: unknown
}

const DEFAULT_WEIGHT = 100
/** 由节点维护、编辑时不回写的元数据（id 走 URL，时间戳由节点自行刷新） */
const SERVER_MANAGED_KEYS = ['id', 'create_time', 'update_time']

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function emptyStreamRouteForm(): StreamRouteForm {
  return {
    server_port: null,
    name: '',
    protocol: 'TCP',
    sni: '',
    remote_addr: '',
    upstream: {
      type: 'roundrobin',
      scheme: 'tcp',
      hash_on: 'vars',
      key: 'remote_addr',
      nodes: [{ host: '', weight: DEFAULT_WEIGHT }],
    },
  }
}

/** 由节点上的 Stream 路由对象回填表单（无 upstream 的 DNS 型路由也能安全回填） */
export function formFromStreamRoute(value: unknown): StreamRouteForm {
  const form = emptyStreamRouteForm()
  const route = asRecord(value)
  if (!route) return form

  if (typeof route.server_port === 'number') form.server_port = route.server_port
  form.name = asString(route.name)
  form.protocol = asString(route.protocol) || 'TCP'
  form.sni = asString(route.sni)
  form.remote_addr = asString(route.remote_addr)

  const upstream = asRecord(route.upstream)
  if (!upstream) return form

  if (asString(upstream.type)) form.upstream.type = asString(upstream.type)
  if (asString(upstream.scheme)) form.upstream.scheme = asString(upstream.scheme)
  form.upstream.hash_on = asString(upstream.hash_on) || form.upstream.hash_on
  form.upstream.key = asString(upstream.key) || form.upstream.key
  const nodes = asRecord(upstream.nodes)
  if (nodes && Object.keys(nodes).length) {
    form.upstream.nodes = Object.entries(nodes).map(([host, weight]) => ({
      host,
      weight: typeof weight === 'number' ? weight : DEFAULT_WEIGHT,
    }))
  }
  return form
}

/** `地址:端口`（IPv6 取最后一个冒号，`[::1]:80` 也可通过） */
function isHostPort(host: string): boolean {
  const idx = host.lastIndexOf(':')
  if (idx <= 0) return false
  const port = Number(host.slice(idx + 1))
  return Number.isInteger(port) && port >= 1 && port <= 65535
}

/** 返回错误消息数组；空数组代表可提交。`editingId` 用于把"正在编辑的这条"排除出端口冲突判断。 */
export function validateStreamRouteForm(
  form: StreamRouteForm,
  rows: EdgeStreamRouteRow[] = [],
  editingId?: string,
): string[] {
  const errors: string[] = []
  // 输入框清空时 v-model.number 会给出空字符串，按"未填写"处理
  const rawPort: unknown = form.server_port

  if (rawPort === null || rawPort === undefined || rawPort === '') {
    errors.push('请填写监听端口')
  } else if (!Number.isInteger(Number(rawPort)) || Number(rawPort) < 1 || Number(rawPort) > 65535) {
    errors.push('监听端口需在 1–65535 之间')
  } else {
    const duplicated = rows.some((row) => {
      const value = asRecord(row?.value)
      if (!value) return false
      if (editingId !== undefined && asString(value.id) === editingId) return false
      return Number(value.server_port) === Number(rawPort)
    })
    if (duplicated) errors.push(`监听端口 ${rawPort} 已被其它四层代理占用`)
  }

  const filledNodes = form.upstream.nodes.filter((node) => node.host.trim())
  if (filledNodes.length === 0) {
    errors.push('至少填写一个上游节点')
  } else {
    const invalid = filledNodes.find((node) => !isHostPort(node.host.trim()))
    if (invalid) errors.push(`上游节点需为 地址:端口 形式：${invalid.host.trim()}`)
  }

  return errors
}

function setOptional(payload: Record<string, unknown>, key: string, value: string): void {
  const trimmed = (value || '').trim()
  if (trimmed) payload[key] = trimmed
  else delete payload[key]
}

/**
 * 构造写入载荷。
 *
 * - 无 `base`（新建）：只含表单字段
 * - 有 `base`（编辑）：以原对象为基底，覆盖表单负责的字段，其余（`plugins`、`upstream.checks` …）原样保留
 * - `upstream.nodes` 始终由表单全权覆盖；非 chash 类型不输出 `hash_on`/`key`
 */
export function buildStreamRoutePayload(form: StreamRouteForm, base?: unknown): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...(asRecord(base) ?? {}) }
  for (const key of SERVER_MANAGED_KEYS) delete payload[key]

  payload.server_port = form.server_port === null ? null : Number(form.server_port)

  const upstream: Record<string, unknown> = { ...(asRecord(payload.upstream) ?? {}) }
  upstream.type = form.upstream.type
  upstream.scheme = form.upstream.scheme
  if (form.upstream.type === 'chash') {
    upstream.hash_on = form.upstream.hash_on
    upstream.key = form.upstream.key
  } else {
    delete upstream.hash_on
    delete upstream.key
  }
  const nodes: Record<string, number> = {}
  for (const node of form.upstream.nodes) {
    const host = node.host.trim()
    if (host) nodes[host] = Number(node.weight) || DEFAULT_WEIGHT
  }
  upstream.nodes = nodes
  payload.upstream = upstream

  setOptional(payload, 'name', form.name)
  setOptional(payload, 'protocol', form.protocol)
  setOptional(payload, 'sni', form.sni)
  setOptional(payload, 'remote_addr', form.remote_addr)

  return payload
}
