/**
 * 集群分组批量删除共享核心（批次 B5 收敛，2026-11-22；见 docs/refactoring/open-items-2026-11-22.md）。
 *
 * 背景：节点 / 上游 / 路由三个域的「按 cluster_id 分组顺序批量删除」曾是三份近似重复实现
 * （useBatchNodeAction / useBatchUpstreamDelete / useBatchRouteDelete）。它们共同的骨架是：
 *
 *   按 cluster_id 分组 → 逐集群**顺序**请求集群作用域的集合端点 → 逐条结果记账
 *   （success / failed / 后端漏返回 → 该条标失败）→ 单集群调用级失败只标记该集群全部条目、
 *   继续下一集群 → 汇总 ClusterBatchSummary[] → 进度状态（BatchProgressItem.label 逐项身份）。
 *
 * 差异只在数据而非流程：端点路径、请求体 id 字段名、响应 id/名称字段名、delete_db/delete_edge、
 * 是否逐集群裁剪下发 node_ids、以及「逐条日志文案」。故本文件承担唯一一份请求循环，
 * 三个域退化为薄适配层（保留各自对外导出名与签名，调用方零改动）。
 *
 * 进度展示仍是 BatchActionProgressModal（单点组件）：逐项身份字段是 `label`
 * ——节点域承载 IP，上游/路由域承载资源名称（它是「逐项身份标签」，不是地址）。
 *
 * 复用（不得复制第二份）：BatchProgressState / BatchProgressItem 由 useBatchNodeAction 定义，
 * ClusterBatchSummary / formatClusterBatchSummary 定义在本文件、由 useBatchNodeAction 再导出，
 * 因此 `from '@/composables/useBatchNodeAction'` 仍是外部唯一入口。
 */
import api from '@/api'
import { getApiErrorMessage } from '@/utils/error'
import type { BatchProgressState } from '@/composables/useBatchNodeAction'

/** 逐集群汇总（spec：「集群 A：2 成功 1 失败；集群 B：3 成功」） */
export interface ClusterBatchSummary {
  clusterName: string
  total: number
  success: number
  failed: number
  /** 集群级调用失败原因（F4：不中断整体，失败记入该项） */
  clusterError?: string
}

/** 汇总文案（单点：上游/路由的 message 拼装与节点页提示共用本 formatter） */
export function formatClusterBatchSummary(summaries: ClusterBatchSummary[]): string {
  return summaries
    .map((s) => `集群 ${s.clusterName}：${s.success} 成功${s.failed > 0 ? ` ${s.failed} 失败` : ''}`)
    .join('；')
}

/** 批量删除的逐条子作用域结果（services/batch_delete.py 与 cluster_nodes.py 同形） */
export interface ClusterBatchDeleteSubResult {
  scope?: string
  status?: string
  node?: string
  message?: string
  error?: string
}

/**
 * 后端逐条删除结果（三域共用形状）。
 * `idField` / `nameField` 由适配层指定（node_id·node_ip / upstream_id·upstream_name / route_id·route_name），
 * 故除已知字段外保留动态字段索引；取值处一律做类型收窄，不依赖断言。
 */
export interface ClusterBatchDeleteEntry {
  status?: string
  error?: string
  results?: ClusterBatchDeleteSubResult[]
  [field: string]: unknown
}

/**
 * 通用分组：`items` 已归一为「id + 进度身份标签」。
 * label 同时用作逐条日志里的资源名（节点 = IP、上游/路由 = 名称），故适配层只需一次 map。
 */
export interface ClusterBatchDeleteGroup {
  clusterId: number
  clusterName: string
  items: Array<{ id: number; label: string }>
  /** 该集群候选 Edge 节点 id（仅「可同步删 Edge」域使用；适配层已按集群裁剪） */
  nodeIds?: number[]
}

/** 域差异全在此（端点 / 字段名 / 删除语义 / 日志文案） */
export interface ClusterBatchDeleteOptions {
  /** 进度弹窗标题，如「批量删除上游」 */
  title: string
  /** 实体中文名（逐条日志用）：节点 / 上游 / 路由 */
  entity: string
  /** 集合端点（后端只有集群作用域入口） */
  endpoint: (group: ClusterBatchDeleteGroup) => string
  /** 请求体里的 id 数组字段名：node_ids / upstream_ids / route_ids */
  idsField: string
  /** 响应条目里的 id 字段名：node_id / upstream_id / route_id */
  idField: string
  /** 响应条目里的名称字段名：node_ip / upstream_name / route_name */
  nameField: string
  deleteDb: boolean
  deleteEdge: boolean
  /** 是否逐集群裁剪下发 node_ids（节点域无此语义） */
  sendNodeIds?: boolean
  /** 额外请求体字段 */
  extraBody?: Record<string, unknown>
  /** 成功判定（默认 status === 'success'；上游/路由另需无 error） */
  isSuccess?: (entry: ClusterBatchDeleteEntry) => boolean
  /** 逐条明细日志（节点只给成功项补 Edge 说明；上游/路由恒追加子作用域日志） */
  detailLogs?: (entry: ClusterBatchDeleteEntry, ok: boolean) => string[]
}

/** database / edge 子作用域日志（上游与路由同形，单点实现） */
export function subScopeLogs(entry: ClusterBatchDeleteEntry): string[] {
  const logs: string[] = []
  for (const sub of entry.results || []) {
    if (sub.scope === 'database') {
      logs.push(
        sub.status === 'success' ? '✅ 数据库记录已删除' : `❌ 数据库删除失败${sub.message ? `: ${sub.message}` : ''}`,
      )
    } else if (sub.scope === 'edge') {
      if (sub.status === 'success') logs.push(`✅ Edge ${sub.node || '节点'} 已删除`)
      else if (sub.status === 'skipped') logs.push(`Edge 跳过${sub.message ? `: ${sub.message}` : ''}`)
      else logs.push(`❌ Edge ${sub.node || '节点'} 删除失败${sub.error ? `: ${sub.error}` : ''}`)
    }
  }
  return logs
}

/** 各域汇总提示（成功/失败数 + 一条中文文案） */
export interface ClusterBatchDeleteSummary {
  success: number
  failed: number
  text: string
}

/** 汇总计数 + 集群级失败原因（各域文案模板不同，明细行统一走 formatClusterBatchSummary） */
export function batchDeleteSummaryParts(summaries: ClusterBatchSummary[]): {
  total: number
  success: number
  failed: number
  clusterErrors: string[]
} {
  const total = summaries.reduce((acc, s) => acc + s.total, 0)
  const success = summaries.reduce((acc, s) => acc + s.success, 0)
  const clusterErrors = summaries.filter((s) => s.clusterError).map((s) => `集群 ${s.clusterName}：${s.clusterError}`)
  return { total, success, failed: total - success, clusterErrors }
}

/**
 * 集群分组批量删除（**唯一实现**，三个域共用）。
 *
 * 语义不变式（重构前逐行等价）：
 * 1. 跨集群**顺序**请求（后端服务端逐条执行，无全局 ids 端点可并发）；
 * 2. 单条失败（不存在 / 无权限 / Edge 失败）不阻塞其余条，由后端逐条返回；
 * 3. 后端未返回的条目视为失败——不静默留成「未处理」；
 * 4. 单集群调用级失败只标记该集群全部条目并记「集群级失败（原因）」，继续下一集群（F4）。
 */
export async function runClusterGroupedBatchDelete(
  groups: ClusterBatchDeleteGroup[],
  options: ClusterBatchDeleteOptions,
  hooks: { progress: BatchProgressState },
): Promise<ClusterBatchSummary[]> {
  const { progress } = hooks
  const all = groups.flatMap((g) => g.items)
  progress.title.value = options.title
  progress.items.value = all.map((item) => ({ label: item.label, status: 'pending' as const, logs: [] }))
  progress.visible.value = true

  const summaries: ClusterBatchSummary[] = []
  let offset = 0
  for (const group of groups) {
    const base = offset
    offset += group.items.length
    for (let k = 0; k < group.items.length; k++) {
      const row = progress.items.value[base + k]
      row.status = 'running'
      row.logs = [`集群 ${group.clusterName}：开始删除${options.entity} ${group.items[k].label}...`]
    }
    try {
      const body: Record<string, unknown> = {
        [options.idsField]: group.items.map((item) => item.id),
        delete_db: options.deleteDb,
        delete_edge: options.deleteEdge,
      }
      if (options.sendNodeIds) {
        // 节点选择按集群裁剪：把别的集群勾选的节点带进本集群请求会造成跨集群误删
        body.node_ids = group.nodeIds && group.nodeIds.length > 0 ? group.nodeIds : undefined
      }
      if (options.extraBody) Object.assign(body, options.extraBody)
      const res = await api.delete(options.endpoint(group), { data: body })
      const results: ClusterBatchDeleteEntry[] = res.data?.results || []
      let success = 0
      let failed = 0
      const seen = new Set<number>()
      for (const entry of results) {
        const entryId = Number(entry[options.idField])
        const k = group.items.findIndex((item) => item.id === entryId)
        if (k < 0) continue
        seen.add(entryId)
        const i = base + k
        const rawName = entry[options.nameField]
        const name = typeof rawName === 'string' && rawName ? rawName : group.items[k].label
        const ok = options.isSuccess ? options.isSuccess(entry) : entry.status === 'success'
        const logs: string[] = [`集群 ${group.clusterName}：删除${options.entity} ${name}`]
        if (options.detailLogs) logs.push(...options.detailLogs(entry, ok))
        if (ok) {
          progress.items.value[i] = { label: name, status: 'success', logs }
          success++
        } else {
          logs.push(`❌ 删除失败${entry.error ? `: ${entry.error}` : ''}`)
          progress.items.value[i] = { label: name, status: 'error', logs }
          failed++
        }
      }
      // 后端未返回的条目视为失败（单条失败不阻塞其余条的后端语义，不应静默变成「未处理」）
      group.items.forEach((item, k) => {
        if (seen.has(item.id)) return
        progress.items.value[base + k] = {
          label: item.label,
          status: 'error',
          logs: [...progress.items.value[base + k].logs, `❌ 后端未返回该${options.entity}的删除结果`],
        }
        failed++
      })
      summaries.push({ clusterName: group.clusterName, total: group.items.length, success, failed })
    } catch (error: unknown) {
      const detail = getApiErrorMessage(error) || '未知错误'
      for (let k = 0; k < group.items.length; k++) {
        const i = base + k
        progress.items.value[i] = {
          label: group.items[k].label,
          status: 'error',
          logs: [...progress.items.value[i].logs, `❌ 集群级失败（${detail}）`],
        }
      }
      summaries.push({
        clusterName: group.clusterName,
        total: group.items.length,
        success: 0,
        failed: group.items.length,
        clusterError: detail,
      })
    }
  }
  return summaries
}
