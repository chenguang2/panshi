/**
 * 拆分 SNI tag 输入：支持逗号（中英文）、空白、换行分隔的多个值。
 * 例如 "a.com,b.com 1.2.3.4\nb.net" → ["a.com", "b.com", "1.2.3.4", "b.net"]
 */
export function splitSniTags(input: string): string[] {
  return input
    .split(/[,，\s]+/)
    .map(t => t.trim())
    .filter(Boolean)
}

export const RESERVED_SNIS = ['edge.local']

/** 拆分逗号分隔的 sni 字段值（如 DB 中存储的 sni），去除空白与空项。 */
export function splitSniString(sni: string): string[] {
  return (sni || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

/** 判断 tag 是否为系统保留域名（大小写不敏感）。 */
export function isReservedSni(tag: string): boolean {
  return RESERVED_SNIS.includes(tag.trim().toLowerCase())
}

/** 将系统保留域名合并进 DNS SAN 列表：归一化小写、去重、edge.local 置前。 */
export function mergeReservedDnsTags(tags: string[]): string[] {
  const normalized = tags.map(t => t.trim().toLowerCase()).filter(Boolean)
  return Array.from(new Set([...RESERVED_SNIS, ...normalized]))
}
