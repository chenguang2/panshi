/**
 * Ansible 主机清单纯逻辑：未知键识别、表格草稿 → 保存载荷组装。
 *
 * 全保真是硬需求：host 条目上除 ip 与两个凭据字段外的自定义键必须原样保留；
 * 空字符串凭据视为「未设置」，组装时剔除该键（该主机继承组级默认凭据）。
 * YAML 语法/结构校验全部由服务端承担，前端不做 yaml 解析。
 */
import type { InventoryHostEntry } from '@/api/ansibleInventory'

const CRED_KEYS = ['ansible_ssh_user', 'ansible_ssh_pass'] as const

/**
 * 表格视图可维护的已知键（ip 为 API 层字段，非文件键）。
 * 与后端 inventory_service.KNOWN_HOST_KEYS 保持一致；清单外的键走
 * unknown_keys 保真提示，只能在源码模式维护。
 */
export const KNOWN_HOST_KEYS = [
  'ip',
  ...CRED_KEYS,
  'ansible_port',
  'ansible_host',
  'ansible_connection',
  'ansible_python_interpreter',
  'ansible_become',
  'ansible_become_user',
  'ansible_become_pass',
  'ansible_ssh_private_key_file',
  'ansible_ssh_common_args',
] as const

/** 高级设置字段定义（行展开表单渲染依据）。 */
export interface AdvancedFieldDef {
  key: string
  label: string
  type: 'text' | 'number' | 'select' | 'switch' | 'password'
  options?: string[]
  hint?: string
}

export const ADVANCED_FIELDS: AdvancedFieldDef[] = [
  { key: 'ansible_port', label: 'SSH 端口', type: 'number' },
  {
    key: 'ansible_host',
    label: '连接目标 (ansible_host)',
    type: 'text',
    hint: '覆盖实际连接目标，不影响清单中的主机键',
  },
  {
    key: 'ansible_connection',
    label: '连接方式',
    type: 'select',
    options: ['smart', 'ssh', 'paramiko_ssh', 'local', 'docker', 'podman'],
  },
  { key: 'ansible_python_interpreter', label: 'Python 解释器路径', type: 'text' },
  { key: 'ansible_become', label: '提权 (become)', type: 'switch' },
  { key: 'ansible_become_user', label: '提权用户', type: 'text' },
  { key: 'ansible_become_pass', label: '提权密码', type: 'password' },
  { key: 'ansible_ssh_private_key_file', label: '私钥路径', type: 'text' },
  { key: 'ansible_ssh_common_args', label: 'SSH 额外参数', type: 'text' },
]

/** become 类字段的字符串规范化（yes/no/true/false，大小写不敏感）。 */
export function toBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return value.trim().toLowerCase() === 'yes' || value.trim().toLowerCase() === 'true'
  return false
}

/** 高级字段保存前校验：返回错误信息，null 表示通过。 */
export function validateAdvancedField(key: string, value: unknown): string | null {
  if (key === 'ansible_port') {
    if (value === '' || value === undefined || value === null) return null
    const n = typeof value === 'number' ? value : Number(String(value).trim())
    if (!Number.isInteger(n) || n < 1 || n > 65535) {
      return 'SSH 端口必须为 1-65535 的整数'
    }
  }
  return null
}

/** 该行的自定义字段（除 ip 与两个凭据字段外的所有键）。 */
export function unknownKeysOf(entry: InventoryHostEntry): string[] {
  return Object.keys(entry).filter((k) => !(KNOWN_HOST_KEYS as readonly string[]).includes(k))
}

/** vars 中除组级默认凭据外的其他键（仅源码模式可维护）。 */
export function extraVarKeys(vars: Record<string, unknown>): string[] {
  return Object.keys(vars).filter((k) => !(CRED_KEYS as readonly string[]).includes(k))
}

/** 凭据字段安全转字符串用于输入框展示（null/undefined → 空串）。 */
export function credString(value: unknown): string {
  if (value === undefined || value === null) return ''
  return typeof value === 'string' ? value : String(value)
}

export interface AssembleResult {
  hosts: InventoryHostEntry[]
  error: string | null
}

/**
 * 表格行 → 表格模式保存载荷的 hosts 数组。
 *
 * - IP 必填且不得重复（重复 IP 服务端会按 YAML 键静默合并，前端先行拦截）
 * - 空字符串凭据剔除；其余字段（含未知自定义键）原样保留
 */
export function assembleHosts(rows: InventoryHostEntry[]): AssembleResult {
  const seen = new Set<string>()
  const hosts: InventoryHostEntry[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const ip = typeof row.ip === 'string' ? row.ip.trim() : ''
    if (!ip) {
      return { hosts: [], error: `第 ${i + 1} 行未填写 IP，请补全或删除该行后再保存` }
    }
    if (seen.has(ip)) {
      return { hosts: [], error: `主机 IP 重复：${ip}，请合并或删除重复行后再保存` }
    }
    seen.add(ip)
    const entry: Record<string, unknown> = { ...row }
    for (const key of KNOWN_HOST_KEYS) {
      // 仅空字符串视为未设置；非字符串值（YAML 数字等罕见场景）原样保留
      if (key !== 'ip' && typeof entry[key] === 'string' && (entry[key] as string).length === 0) {
        delete entry[key]
      }
    }
    hosts.push({ ...entry, ip })
  }
  return { hosts, error: null }
}

/**
 * 组级默认凭据写入 vars 副本：有值则覆盖、留空则删除（主机回退到自带凭据语义）。
 * 其余 vars 键原样保留。
 */
export function applyGroupCreds(
  vars: Record<string, unknown>,
  user: string,
  pass: string,
): Record<string, unknown> {
  const next = { ...vars }
  const setOrRemove = (key: (typeof CRED_KEYS)[number], value: string) => {
    if (value) next[key] = value
    else delete next[key]
  }
  setOrRemove('ansible_ssh_user', user)
  setOrRemove('ansible_ssh_pass', pass)
  return next
}

/** 从 axios 类错误中提取后端 detail（含行号的校验信息），取不到时用 fallback。 */
export function apiDetail(err: unknown, fallback: string): string {
  const shaped = err as { response?: { data?: { detail?: unknown } } } | null
  const detail = shaped?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  return fallback
}

// ── 批量粘贴导入（纯函数，供批量导入弹窗使用） ────────────────────────

/** 单条解析错误：line 为文本中的物理行号（1 起）。 */
export interface BulkParseError {
  line: number
  reason: string
}

/** 解析出的主机条目：仅携带粘贴中提供的字段（未提及的键不存在）。 */
export interface BulkHostEntry {
  ip: string
  ansible_ssh_user?: string
  ansible_ssh_pass?: string
}

export interface BulkParseResult {
  entries: BulkHostEntry[]
  /** 文本内部重复 IP 的合并次数（后者覆盖前者）。 */
  duplicatesInText: number
  errors: BulkParseError[]
}

/** 主机键口径：与后端 inventory_service._HOST_KEY_RE 完全一致（宽松的 IPv4/主机名形态校验）。 */
const HOST_KEY_RE = /^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$/

export function parseBulkHosts(text: string): BulkParseResult {
  const errors: BulkParseError[] = []
  const byIp = new Map<string, BulkHostEntry>()
  let duplicatesInText = 0
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const all = trimmed.split(/\s+/)
    // 行尾注释：token 以 # 开头即丢弃其后内容（密码首字符为 # 的场景走源码视图）
    const hashIdx = all.findIndex((t) => t.startsWith('#'))
    const tokens = hashIdx === -1 ? all : all.slice(0, hashIdx)
    if (tokens.length > 3) {
      errors.push({ line: i + 1, reason: `最多 3 段（IP 用户 密码），该行有 ${tokens.length} 段` })
      continue
    }
    if (!HOST_KEY_RE.test(tokens[0])) {
      errors.push({ line: i + 1, reason: `IP 不符合主机键口径（IPv4 或主机名）: ${tokens[0]}` })
      continue
    }
    const entry: BulkHostEntry = { ip: tokens[0] }
    if (tokens[1] !== undefined) entry.ansible_ssh_user = tokens[1]
    if (tokens[2] !== undefined) entry.ansible_ssh_pass = tokens[2]
    if (byIp.has(tokens[0])) duplicatesInText += 1
    byIp.set(tokens[0], entry)
  }
  return { entries: [...byIp.values()], duplicatesInText, errors }
}

/* ── 批量导入合并 ─────────────────────────────────────── */

export interface BulkMergeResult {
  rows: InventoryHostEntry[]
  overwrittenCount: number
}

/** 将批量解析条目合并入主机表格行；新 IP 追加、同 IP 仅覆盖提供的字段。 */
export function mergeBulkEntries(
  rows: InventoryHostEntry[],
  entries: BulkHostEntry[],
): BulkMergeResult {
  const indexByIp = new Map<string, number>()
  rows.forEach((r, i) => indexByIp.set(r.ip, i))
  const next = rows.map((r) => ({ ...r }))
  let overwrittenCount = 0

  for (const e of entries) {
    const idx = indexByIp.get(e.ip)
    if (idx !== undefined) {
      // 仅覆盖粘贴中提供的字段；未提及的保持原值
      const row = next[idx]
      if (e.ansible_ssh_user !== undefined) row.ansible_ssh_user = e.ansible_ssh_user
      if (e.ansible_ssh_pass !== undefined) row.ansible_ssh_pass = e.ansible_ssh_pass
      overwrittenCount += 1
    } else {
      const row: InventoryHostEntry = { ip: e.ip }
      if (e.ansible_ssh_user !== undefined) row.ansible_ssh_user = e.ansible_ssh_user
      if (e.ansible_ssh_pass !== undefined) row.ansible_ssh_pass = e.ansible_ssh_pass
      indexByIp.set(e.ip, next.length)
      next.push(row)
    }
  }
  return { rows: next, overwrittenCount }
}
