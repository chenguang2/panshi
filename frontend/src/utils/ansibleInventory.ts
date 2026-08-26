/**
 * Ansible 主机清单纯逻辑：未知键识别、表格草稿 → 保存载荷组装。
 *
 * 全保真是硬需求：host 条目上除 ip 与两个凭据字段外的自定义键必须原样保留；
 * 空字符串凭据视为「未设置」，组装时剔除该键（该主机继承组级默认凭据）。
 * YAML 语法/结构校验全部由服务端承担，前端不做 yaml 解析。
 */
import type { InventoryHostEntry } from '@/api/ansibleInventory'

const CRED_KEYS = ['ansible_ssh_user', 'ansible_ssh_pass'] as const

/** 该行的自定义字段（除 ip 与两个凭据字段外的所有键）。 */
export function unknownKeysOf(entry: InventoryHostEntry): string[] {
  return Object.keys(entry).filter(
    (k) => k !== 'ip' && !(CRED_KEYS as readonly string[]).includes(k),
  )
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
    for (const key of CRED_KEYS) {
      // 仅空字符串视为未设置；非字符串值（YAML 数字等罕见场景）原样保留
      if (typeof entry[key] === 'string' && (entry[key] as string).length === 0) {
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
