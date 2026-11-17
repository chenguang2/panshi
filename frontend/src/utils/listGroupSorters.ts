/**
 * 列表页集群分组的「组内固定序」比较器（list-pages-cluster-grouping 规格）：
 * 路由=优先级升序、上游=名称、节点=IP 数值序。
 *
 * 三个比较器都必须是**全序**（末位用 id 兜底），否则组内顺序不稳定，
 * 同一页数据每次渲染可能抖动（用户会看到行在跳）。
 */

/** IPv4 数值序；非 IPv4 串按字符串序排在其后（IPv6/异常值不参与数值比较） */
export function compareNodeIp(a: { ip?: string | null }, b: { ip?: string | null }): number {
  const na = ipv4ToInt(a.ip)
  const nb = ipv4ToInt(b.ip)
  if (na !== null && nb !== null) return na - nb
  if (na !== null) return -1
  if (nb !== null) return 1
  return String(a.ip ?? '').localeCompare(String(b.ip ?? ''))
}

export function ipv4ToInt(ip?: string | null): number | null {
  if (!ip) return null
  const parts = ip.trim().split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const n = Number(part)
    if (n > 255) return null
    value = value * 256 + n
  }
  return value
}

/** 上游名称序（中文按拼音序）；同名按 id 兜底 */
export function compareUpstreamName(
  a: { name?: string | null; id?: number | string | null },
  b: { name?: string | null; id?: number | string | null },
): number {
  const byName = String(a.name ?? '').localeCompare(String(b.name ?? ''), 'zh-Hans-CN', { numeric: true })
  if (byName !== 0) return byName
  return numericId(a.id) - numericId(b.id)
}

/** 路由优先级升序；同优先级按 id 兜底（保证全序） */
export function compareRoutePriority(
  a: { priority?: number | null; id?: number | string | null },
  b: { priority?: number | null; id?: number | string | null },
): number {
  const byPriority = (a.priority ?? 0) - (b.priority ?? 0)
  if (byPriority !== 0) return byPriority
  return numericId(a.id) - numericId(b.id)
}

function numericId(id: number | string | null | undefined): number {
  const n = Number(id)
  return Number.isFinite(n) ? n : 0
}
