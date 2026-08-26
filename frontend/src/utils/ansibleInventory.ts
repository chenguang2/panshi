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
