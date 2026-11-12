/**
 * 上游选择选项映射（traffic_split 上游分发目标等 Edge 载荷消费方）。
 *
 * value 语义：优先 edge_uuid（Edge 侧标识，发布载荷里的 upstream_id 引用它），
 * 回退平台 id 字符串。与 ClusterRoutes 侧既有映射同语义，单一实现。
 */
export interface UpstreamSelectOption {
  label: string
  value: string
}

export function toUpstreamSelectOptions(
  upstreams: Array<{ id: number | string; name?: string; edge_uuid?: string | null }> | undefined | null,
): UpstreamSelectOption[] {
  return (upstreams || []).map((u) => ({
    label: u.name || String(u.id),
    value: u.edge_uuid || String(u.id),
  }))
}
