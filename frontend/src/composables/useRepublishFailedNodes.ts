/**
 * 「重发失败节点」失败集合解析（republish-failed-nodes，方案 A：零持久化）。
 *
 * **单一实现**（设计 D5）：预览取数、失败集合提取、IP→节点 id 映射收敛于此，
 * 六张卡片页只做接线，禁止逐页复制预览解析逻辑。
 *
 * **失败集合语义**（设计 D2）：发布差异预览逐节点状态中 `diff`（落后）/`unreachable`
 * （不可达）/`missing`（整资源缺失）三者 = 「上次发布未生效的节点」——partial 发布后
 * 失败节点仍是旧配置（与候选存在差异或缺失），成功节点与候选一致。
 *
 * **取数时机**（设计 D3）：页面打开不自动预取；点「重发失败节点」才拉预览
 * （只读幂等），成功后由页面打开发布确认弹窗（PublishConfirmModal 既有
 * `preselectedNodeIds` 机制，仅预选集合内在线节点）。
 *
 * **回退**（设计 D6）：基线缺失（旧快照无实发载荷）/ 预览请求失败 / 集群错误 /
 * 失败集合为空 → 返回 `ok: false` + 回退原因，页面保持泛化文案 + 仅「查看差异」，
 * 不阻塞、不弹错误窗。
 */

import { ref } from 'vue'
import { getPublishPreview } from '@/api/clusters'
import type { PublishPreviewNode } from '@/api/clusters'
import { fetchAllClusterNodes } from '@/composables/useClusterUtils'

export interface RepublishFailedNode {
  /** 映射到的节点 id；label 无法映射（兜底 `node-{id}`）时为 null */
  id: number | null
  /** 预览节点标识（IP；兜底 `node-{id}`） */
  label: string
  reason: string | null
}

export type RepublishFallback = 'baseline_missing' | 'cluster_error' | 'request_failed' | 'empty' | null

export interface RepublishOutcome {
  ok: boolean
  fallback: RepublishFallback
  failedNodes: RepublishFailedNode[]
  /** 映射成功的节点 id（预选用；映射不上的条目跳过） */
  failedNodeIds: number[]
  /** 具体文案（「N 个节点分发失败（…）」）；回退时 null */
  noticeText: string | null
}

/** 「上次发布未生效」的逐节点状态集合（D2；ok = 与候选一致） */
const FAILED_STATUSES = new Set<PublishPreviewNode['status']>(['diff', 'unreachable', 'missing'])

/** 提示条文案（与静态资源页 failedNoticeText 同构：1 个不带「等」，多节点首个 + 「等」） */
export function buildFailedNoticeText(nodes: { label: string; reason: string | null }[]): string {
  if (!nodes.length) return ''
  const first = nodes[0]
  const detail = first.reason ? `${first.label} ${first.reason}` : first.label
  return `${nodes.length} 个节点分发失败（${detail}${nodes.length > 1 ? ' 等' : ''}）`
}

/** 持久化失败明细（方案 B：last_publish_detail 列，{total, success, failed, failed_nodes}）
 *  → 提示条文案；无明细返回 null（回退泛化）。打开页面即见具体失败节点。 */
export function noticeTextFromPublishDetail(
  detail: { failed?: number; failed_nodes?: { node?: string; error?: string }[] } | null | undefined,
): string | null {
  const failed = detail?.failed_nodes ?? []
  if (!failed.length) return null
  return buildFailedNoticeText(failed.map((f) => ({ label: f.node || '未知节点', reason: f.error || null })))
}

export function useRepublishFailedNodes() {
  const loading = ref(false)

  /**
   * 解析某资源的失败节点集合。进行中再次调用返回 `null`（防重复，设计 R2）。
   */
  async function resolve(
    row: { id: number; cluster_id: number },
    resourceType: string,
  ): Promise<RepublishOutcome | null> {
    if (loading.value) return null
    loading.value = true
    try {
      const resp = await getPublishPreview(row.cluster_id, resourceType, row.id)
      const preview = resp.data
      if (preview.cluster_error) {
        return { ok: false, fallback: 'cluster_error', failedNodes: [], failedNodeIds: [], noticeText: null }
      }
      if (!preview.has_baseline || preview.baseline_missing_reason) {
        return { ok: false, fallback: 'baseline_missing', failedNodes: [], failedNodeIds: [], noticeText: null }
      }
      const failedNodes: RepublishFailedNode[] = (preview.nodes || [])
        .filter((n) => FAILED_STATUSES.has(n.status))
        .map((n) => ({ id: null, label: n.label, reason: n.behind_reason || n.reason || null }))
      if (!failedNodes.length) {
        return { ok: false, fallback: 'empty', failedNodes: [], failedNodeIds: [], noticeText: null }
      }

      // IP→节点 id 映射（R1）：label = n.ip；兜底 `node-{id}` 无法映射 → 该条保留但跳过预选。
      // 节点清单拉取失败 → 预选为空（弹窗退回默认全选在线，语义安全），文案不受影响。
      let failedNodeIds: number[] = []
      try {
        const clusterNodes = await fetchAllClusterNodes<{ id: number; ip?: string | null }>(row.cluster_id)
        const byIp = new Map<string, number>()
        for (const n of clusterNodes) if (n.ip) byIp.set(n.ip, n.id)
        for (const f of failedNodes) f.id = byIp.get(f.label) ?? null
        failedNodeIds = failedNodes.map((f) => f.id).filter((x): x is number => typeof x === 'number')
      } catch {
        failedNodeIds = []
      }

      return { ok: true, fallback: null, failedNodes, failedNodeIds, noticeText: buildFailedNoticeText(failedNodes) }
    } catch {
      return { ok: false, fallback: 'request_failed', failedNodes: [], failedNodeIds: [], noticeText: null }
    } finally {
      loading.value = false
    }
  }

  return { loading, resolve }
}
