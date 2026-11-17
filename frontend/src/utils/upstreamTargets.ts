/**
 * 上游「目标节点与健康」列的派生逻辑（mockup-parity-standard r7 方案 A）。
 *
 * 平台**没有目标级健康数据**：`UpstreamTarget` 只有 `{target, weight}`，Edge 侧目标健康
 * 需另接接口（方案 B，未立项）。故「全部健康」按**上游发布态**近似：
 * 已发布（published_at 非空）+ 无待发布（pending_publish 非 true）+ 上次发布无异常
 * （last_publish_status !== 'partial'）→ 视为线上配置已生效、目标全部健康；
 * 其余情形（未发布 / 待发布 / 部分失败）→ 目标健康「待验证」。
 *
 * 该近似只影响「点颜色 + 汇总行」，不改动占比口径（占比恒按全部目标权重计算，
 * 因为无目标级健康可供剔除）。真实逐目标健康接入后，本文件新增「有效目标」过滤即可，
 * 消费方（UpstreamList）无需再改。
 */

export interface UpstreamTargetLike {
  target: string
  weight: number
}

export interface UpstreamHealthLike {
  published_at?: string | null
  pending_publish?: boolean | null
  last_publish_status?: string | null
}

/** 目标健康是否可判定为「全部健康」（方案 A：上游发布态近似） */
export function areTargetsVerified(rec: UpstreamHealthLike): boolean {
  return !!rec.published_at && rec.pending_publish !== true && rec.last_publish_status !== 'partial'
}

/**
 * 每个目标的权重占比（整数百分比）。
 * 与设计稿同口径：逐目标独立四舍五入（设计 80/60/40 → 44/33/22，合计 99 而非强制 100）。
 * 权重非正的条目按 0 处理；总权重为 0 时全部返回 0。
 */
export function targetWeightPercents(targets: UpstreamTargetLike[]): number[] {
  const total = targets.reduce((sum, t) => sum + (t.weight > 0 ? t.weight : 0), 0)
  if (total <= 0) return targets.map(() => 0)
  return targets.map((t) => Math.round((Math.max(t.weight, 0) / total) * 100))
}

/** 汇总行数据：`ok` 决定文案分支，`pending` 为待验证目标数（方案 A 下无目标级数据 → 全量计数） */
export function summarizeTargetHealth(
  targets: UpstreamTargetLike[],
  verified: boolean,
): { ok: boolean; total: number; pending: number } {
  return { ok: verified, total: targets.length, pending: verified ? 0 : targets.length }
}

/** 状态点语义（供 title 与 class 使用）：已发布无异常 → ok，否则待验证 */
export function targetDot(verified: boolean): { cls: string; title: string } {
  return verified
    ? { cls: 'd-ok', title: '目标健康：上游已发布且无发布异常（目标级健康未采集，按发布态近似）' }
    : { cls: 'd-warn', title: '目标健康：待验证（上游未发布、有待发布变更或上次发布存在未生效节点）' }
}
