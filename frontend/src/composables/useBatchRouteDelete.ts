/**
 * 路由批量删除共享核心（路由列表页 / 统一管理面板路由 Tab 同一实现）。
 *
 * 与节点批量删除（composables/useBatchNodeAction.ts 的 runClusterGroupedBatchDelete）与上游
 * （useBatchUpstreamDelete.ts）同构：后端只有集群作用域的集合端点
 * `DELETE /clusters/{cluster_id}/routes`（backend/app/api/v1/cluster_routes.py::delete_routes_batch，
 * 请求体 `{route_ids, delete_db, delete_edge, node_ids?}`，委托 services/batch_delete.py 单一实现），
 * 故跨集群勾选按 cluster_id 分组顺序请求；单集群调用级失败不中断整体，失败记入该项「集群级失败（原因）」。
 *
 * 逐条结果形状（services/batch_delete.py::batch_delete）：
 * `{route_id, route_name, status, error?, results: [{scope, status, node?, message?, error?}]}`
 * ——单条不存在/无权限/Edge 失败都只标记该条，不阻塞其余条。
 *
 * 进度展示复用 BatchActionProgressModal（与节点/上游批量条同款组件）：
 * 其逐项行的身份列（BatchNodeProgressItem.ip）在本域承载路由名称——它是「逐项身份标签」，不是地址。
 */
import api from '@/api'
import { getApiErrorMessage } from '@/utils/error'
import {
  formatClusterBatchSummary,
  type BatchProgressState,
  type ClusterBatchSummary,
} from '@/composables/useBatchNodeAction'

export interface ClusterRouteBatchGroup {
  clusterId: number
  clusterName: string
  routes: Array<{ id: number; name: string }>
  /** 该集群的候选 Edge 节点 id：确认弹窗里选中的 nodeIds 按集群裁剪后再下发 */
  nodeIds: number[]
}

export interface RouteBatchDeletePayload {
  deleteDb: boolean
  deleteEdge: boolean
  /** 确认弹窗里勾选的节点（跨集群并集；逐集群裁剪后下发） */
  nodeIds: number[]
}

/** 批量删除响应条目（services/batch_delete.py::batch_delete 形状） */
interface BatchDeleteRouteResult {
  route_id?: number
  route_name?: string
  status?: string
  error?: string
  results?: Array<{ scope?: string; status?: string; message?: string; error?: string; node?: string }>
}

function subScopeLogs(entry: BatchDeleteRouteResult): string[] {
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

/**
 * 集群分组批量删除路由：逐集群顺序请求集合端点，逐条记录进度日志。
 * 单条失败（不存在 / Edge 同步失败）不阻塞其余条，由后端逐条返回。
 */
export async function runClusterGroupedBatchRouteDelete(
  groups: ClusterRouteBatchGroup[],
  payload: RouteBatchDeletePayload,
  hooks: { progress: BatchProgressState },
): Promise<ClusterBatchSummary[]> {
  const { progress } = hooks
  const all = groups.flatMap((g) => g.routes)
  progress.title.value = '批量删除路由'
  progress.items.value = all.map((r) => ({ ip: r.name, status: 'pending' as const, logs: [] }))
  progress.visible.value = true

  const summaries: ClusterBatchSummary[] = []
  let offset = 0
  for (const group of groups) {
    const base = offset
    offset += group.routes.length
    for (let k = 0; k < group.routes.length; k++) {
      progress.items.value[base + k].status = 'running'
      progress.items.value[base + k].logs = [`集群 ${group.clusterName}：开始删除路由 ${group.routes[k].name}...`]
    }
    // 节点选择按集群裁剪：把别的集群勾选的节点带进本集群请求会造成跨集群误删
    const nodeIds = payload.nodeIds.filter((id) => group.nodeIds.includes(id))
    try {
      const res = await api.delete(`/clusters/${group.clusterId}/routes`, {
        data: {
          route_ids: group.routes.map((r) => r.id),
          delete_db: payload.deleteDb,
          delete_edge: payload.deleteEdge,
          node_ids: nodeIds.length > 0 ? nodeIds : undefined,
        },
      })
      const results: BatchDeleteRouteResult[] = res.data?.results || []
      let success = 0
      let failed = 0
      const seen = new Set<number>()
      for (const r of results) {
        const routeId = Number(r.route_id)
        const k = group.routes.findIndex((x) => x.id === routeId)
        if (k < 0) continue
        seen.add(routeId)
        const i = base + k
        const name = r.route_name || group.routes[k].name
        const logs: string[] = [`集群 ${group.clusterName}：删除路由 ${name}`]
        logs.push(...subScopeLogs(r))
        if (r.status === 'success' && !r.error) {
          progress.items.value[i] = { ip: name, status: 'success', logs }
          success++
        } else {
          logs.push(`❌ 删除失败${r.error ? `: ${r.error}` : ''}`)
          progress.items.value[i] = { ip: name, status: 'error', logs }
          failed++
        }
      }
      // 后端未返回的路由视为失败（不静默变成「未处理」）
      group.routes.forEach((route, k) => {
        if (seen.has(route.id)) return
        progress.items.value[base + k] = {
          ip: route.name,
          status: 'error',
          logs: [...progress.items.value[base + k].logs, '❌ 后端未返回该路由的删除结果'],
        }
        failed++
      })
      summaries.push({ clusterName: group.clusterName, total: group.routes.length, success, failed })
    } catch (error: unknown) {
      const detail = getApiErrorMessage(error) || '未知错误'
      for (let k = 0; k < group.routes.length; k++) {
        const i = base + k
        progress.items.value[i] = {
          ip: group.routes[k].name,
          status: 'error',
          logs: [...progress.items.value[i].logs, `❌ 集群级失败（${detail}）`],
        }
      }
      summaries.push({
        clusterName: group.clusterName,
        total: group.routes.length,
        success: 0,
        failed: group.routes.length,
        clusterError: detail,
      })
    }
  }
  return summaries
}

/** 汇总文案（与节点/上游批量条同源 formatter）：成功/失败一条提示，集群级失败原因并入括号 */
export function routeBatchSummaryMessage(summaries: ClusterBatchSummary[]): {
  success: number
  failed: number
  text: string
} {
  const total = summaries.reduce((acc, s) => acc + s.total, 0)
  const success = summaries.reduce((acc, s) => acc + s.success, 0)
  const failed = total - success
  const clusterErrors = summaries.filter((s) => s.clusterError).map((s) => `集群 ${s.clusterName}：${s.clusterError}`)
  const text = `已删除 ${success} 条路由${failed > 0 ? `，${failed} 条失败：${formatClusterBatchSummary(summaries)}` : ''}${
    clusterErrors.length ? `（${clusterErrors.join('；')}）` : ''
  }`
  return { success, failed, text }
}
