/**
 * 集群色相（filter-architecture 补充，2026-11-18）。
 *
 * 列表页平铺视图的「集群」列、卡片页的集群分组带（`.l5-band`）与平铺集群条（`.lp-strip`）
 * 必须用**同一套固定色相**：`cluster_id % 8 → .cluster-c1..c8`，同一集群全站同色。
 * 禁止按出现顺序随机分配 —— 否则同一集群在不同页面/不同筛选下会变色，误导用户。
 *
 * 样式单点在 `style.css` 的 `.cluster-c1..c8`（只定义 `--cc`，消费方把它用在圆点/左缘条上）。
 */

const CLUSTER_HUE_COUNT = 8

/** cluster_id → `cluster-cN` 类名（空/非法 id 回落 c1，避免无色点） */
export function clusterHueClass(clusterId: number | null | undefined): string {
  const id = Number(clusterId)
  if (!Number.isFinite(id) || id <= 0) return 'cluster-c1'
  return `cluster-c${((id - 1) % CLUSTER_HUE_COUNT) + 1}`
}

/** 平铺视图「集群」列的宽度（px）：与设计稿一致，仅平铺存在 */
export const CLUSTER_COLUMN_WIDTH = 116

/** 平铺视图「集群」列的缩放下限（px）：等比收缩时不至于把色点与名称挤没 */
export const CLUSTER_COLUMN_MIN_WIDTH = 96
