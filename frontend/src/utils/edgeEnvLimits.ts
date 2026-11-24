/**
 * edge.env 的 Edge 生效上传上限（edge-upload-limit-alignment）前端纯函数。
 *
 * 口径与后端 `app/services/edge_env_limits.py` 逐字对齐：
 * 生效上限 = deploy.http.admin.client_max_body_size；缺失 → Edge pack server 级基线 32MB。
 * http 级的同名配置不参与判定——Edge pack 的 nginx_server_monitor.conf 在 server 级
 * 自带 32m，只有 http.admin 段会被 `bin/edge init` 回写进该 server 块（实测）。
 */

export const EDGE_ADMIN_BASELINE_MB = 32

const KEY = 'client_max_body_size'

function indentOf(line: string): number {
  return line.length - line.trimStart().length
}

function isSkippable(line: string): boolean {
  return !line.trim() || line.trimStart().startsWith('#')
}

/** 找某个块的结束行索引（首个非空非注释且缩进 ≤ 块缩进的行） */
function blockEnd(lines: string[], start: number, indent: number): number {
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]
    if (isSkippable(line)) continue
    if (indentOf(line) <= indent) return i
  }
  return lines.length
}

function locateAdmin(lines: string[]): { index: number; indent: number } | null {
  let iHttp = -1
  let httpIndent = 0
  for (let i = 0; i < lines.length; i++) {
    if (isSkippable(lines[i])) continue
    if (/^\s*http:\s*(?:#.*)?$/.test(lines[i])) {
      iHttp = i
      httpIndent = indentOf(lines[i])
      break
    }
  }
  if (iHttp < 0) return null
  const httpEnd = blockEnd(lines, iHttp, httpIndent)
  for (let i = iHttp + 1; i < httpEnd; i++) {
    if (isSkippable(lines[i])) continue
    if (/^\s*admin:\s*(?:#.*)?$/.test(lines[i]) && indentOf(lines[i]) > httpIndent) {
      return { index: i, indent: indentOf(lines[i]) }
    }
  }
  return null
}

/** 解析 nginx 尺寸值 → MB（无单位按字节；无法解析返回 null） */
function toMb(raw: string): number | null {
  const m = /^(\d+)\s*([kKmMgG])?$/.exec(raw.trim())
  if (!m) return null
  const num = Number(m[1])
  const unit = (m[2] || '').toLowerCase()
  if (unit === 'm') return num
  if (unit === 'g') return num * 1024
  if (unit === 'k') return num ? Math.max(1, Math.floor(num / 1024)) : 0
  return Math.floor(num / (1024 * 1024))
}

/** deploy.http.admin.client_max_body_size（缺失/不可解析 → null） */
export function parseAdminBodyLimitMb(content: string): number | null {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const admin = locateAdmin(lines)
  if (!admin) return null
  const end = blockEnd(lines, admin.index, admin.indent)
  for (let i = admin.index + 1; i < end; i++) {
    const line = lines[i]
    if (isSkippable(line)) continue
    const m = new RegExp(`^\\s*${KEY}\\s*:\\s*([^#\\n]*?)\\s*(?:#.*)?$`).exec(line)
    if (m && indentOf(line) > admin.indent) return toMb(m[1])
  }
  return null
}

export interface EdgeLimitHint {
  platformMb: number
  adminMb: number | null
  effectiveMb: number
  sufficient: boolean
  /** 部署时是否会被平台自动补齐/抬高 */
  willAutoFill: boolean
  text: string
}

/** 生成展示文案（与后端 note 同口径，面向编辑器内联提示） */
export function describeAdminLimit(content: string, platformMb: number): EdgeLimitHint {
  const adminMb = parseAdminBodyLimitMb(content)
  const effectiveMb = adminMb === null ? EDGE_ADMIN_BASELINE_MB : adminMb
  const sufficient = effectiveMb >= platformMb
  if (adminMb === null) {
    return {
      platformMb,
      adminMb,
      effectiveMb,
      sufficient,
      willAutoFill: true,
      text: `Edge 上传上限按 pack 默认 ${EDGE_ADMIN_BASELINE_MB}MB 生效（http 段的值不生效，server 级只认 admin 段）；部署时将自动补齐到 ${platformMb}MB`,
    }
  }
  if (!sufficient) {
    // 用户裁决 B（2026-11-24）：显式更低值保留不覆盖，只告警落差
    return {
      platformMb,
      adminMb,
      effectiveMb,
      sufficient,
      willAutoFill: false,
      text: `Edge 上传上限 ${adminMb}MB 低于平台上限 ${platformMb}MB：发布 ${adminMb}–${platformMb}MB 的 zip 会报 413（平台不会自动抬升你的显式配置；如非本意，把 admin 段调到 ${platformMb}m 或把平台上限调到 ${adminMb}MB）`,
    }
  }
  return {
    platformMb,
    adminMb,
    effectiveMb,
    sufficient,
    willAutoFill: false,
    text: `Edge 上传上限 ${effectiveMb}MB，已与平台上限 ${platformMb}MB 一致`,
  }
}
