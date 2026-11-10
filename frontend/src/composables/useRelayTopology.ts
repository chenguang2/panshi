/**
 * 中继拓扑阶段机（relay-region-topology-view design D7）。
 *
 * stageOf / nextStepOf / checklistOf 是阶段派生的单点实现：链路卡网关机框四形态、
 * 五步清单条与「下一步」指引共用本文件，任何视图不得各自复制推导逻辑
 * （防 #51 式多实现漂移）。节点级 whitelist_state 由服务端派生（design D3），
 * 前端不做节点同步态推导。
 */
import type { RelayGateway, RelayTopologyRegion } from '@/api/relay'

export type RelayStage = 'steady' | 'ready-init' | 'init-blocked' | 'legs-partial' | 'fresh'

/** 阶段机输入字段：RelayTopologyRegion 与列表行 RelayGateway 均满足该形状 */
export interface RelayStageSource {
  http_base_url?: string | null
  ssh_jump?: string | null
  ssh_user?: string | null
  last_pushed_at?: string | null
}

/**
 * 五态派生（design D7 定案规则）：
 * steady = last_pushed_at 非空（init/push 成功均写该字段，relay.py _record_snapshot）；
 * ready-init = 有 ssh_jump + 有 ssh_user 且未 steady；init-blocked = 有 ssh_jump 缺 ssh_user；
 * legs-partial = 无 ssh_jump 有 http_base_url；fresh = 两腿均空。
 * 有 ssh_jump 即视为已过腿阶段（SSH-only 区域同样可走初始化）。
 */
export function stageOf(region: RelayStageSource): RelayStage {
  if (region.last_pushed_at) return 'steady'
  if (region.ssh_jump) return region.ssh_user ? 'ready-init' : 'init-blocked'
  if (region.http_base_url) return 'legs-partial'
  return 'fresh'
}

/** 挂接集群数：拓扑明细优先（集群卡数），缺失时回退列表行注入计数 */
export function attachedCountOf(
  topo: RelayTopologyRegion | null,
  gateway: Pick<RelayGateway, 'attached_cluster_count'>,
): number {
  return topo?.clusters.length ?? gateway.attached_cluster_count ?? 0
}

/**
 * 「下一步」指引（指引序列：登记 HTTP 腿 → 登记 SSH 跳板 → 补 SSH 账号 → 初始化网关
 * → 挂接集群 → 下发配置 → 已完成）。SSH-only 区域（有 ssh_jump 无 http）越过「登记
 * HTTP 腿」直达初始化——SSH 腿是初始化的必要腿（design D7）。
 */
export function nextStepOf(
  region: RelayStageSource,
  attachedCount: number,
  drift: { added: string[]; removed: string[] } | null | undefined,
): string {
  if (!region.http_base_url && !region.ssh_jump) return '登记 HTTP 腿'
  if (!region.ssh_jump) return '登记 SSH 跳板'
  if (!region.ssh_user) return '补 SSH 账号'
  if (stageOf(region) !== 'steady') return '初始化网关'
  if (attachedCount === 0) return '挂接集群'
  if ((drift?.added.length ?? 0) + (drift?.removed.length ?? 0) > 0) return '下发配置'
  return '已完成'
}

export interface RelayChecklistStep {
  label: string
  done: boolean
}

/**
 * 五步清单（区域/两腿/初始化/挂接/下发）。初始化与下发共用 last_pushed_at 快照语义
 * （init/push 成功均写），steady 后清单条整体切换为白名单统计条，故二者仅以 ○ 出现。
 */
export function checklistOf(region: RelayStageSource, attachedCount: number): RelayChecklistStep[] {
  const steady = stageOf(region) === 'steady'
  return [
    { label: '区域', done: true },
    { label: '两腿', done: !!(region.http_base_url && region.ssh_jump) },
    { label: '初始化', done: steady },
    { label: '挂接', done: attachedCount > 0 },
    { label: '下发', done: steady },
  ]
}

/** 从 ssh_jump（user@host[:port]）提取主机名（mockup sshHost 同语义；无 @ 时整串视作主机） */
export function sshHostOf(sshJump: string | null | undefined): string {
  if (!sshJump) return ''
  const afterAt = sshJump.includes('@') ? sshJump.slice(sshJump.lastIndexOf('@') + 1) : sshJump
  return afterAt.replace(/:\d{1,5}$/, '')
}
