/**
 * 路由批量删除适配层（路由列表页 / 统一管理面板路由 Tab 同一实现）。
 *
 * B5 起请求循环收敛到 `composables/useClusterGroupedBatchDelete.ts`（集群分组顺序删除唯一实现），
 * 本文件只保留路由域的差异声明：端点 `/clusters/{id}/routes`、id/名称字段（route_id / route_name）、
 * `{route_ids, delete_db, delete_edge, node_ids?}` 请求体，以及汇总文案。
 * 对外导出名与签名保持不变（调用方零改动）。
 *
 * 后端只有集群作用域的集合端点 `DELETE /clusters/{cluster_id}/routes`
 * （backend/app/api/v1/cluster_routes.py::delete_routes_batch，委托 services/batch_delete.py 单一实现），
 * 故跨集群勾选按 cluster_id 分组顺序请求；单集群调用级失败不中断整体，失败记入该项
 * 「集群级失败（原因）」。
 *
 * 逐条结果形状（services/batch_delete.py::batch_delete）：
 * `{route_id, route_name, status, error?, results: [{scope, status, node?, message?, error?}]}`
 * ——单条不存在/无权限/Edge 失败都只标记该条，不阻塞其余条。
 *
 * 进度展示复用 BatchActionProgressModal（与节点/上游批量条同款组件）：
 * 其逐项行的身份列（BatchProgressItem.label）在本域承载路由名称——它是「逐项身份标签」，不是地址。
 */
import {
  formatClusterBatchSummary,
  type BatchProgressState,
  type ClusterBatchSummary,
} from '@/composables/useBatchNodeAction'
import {
  batchDeleteSummaryParts,
  runClusterGroupedBatchDelete,
  subScopeLogs,
  type ClusterBatchDeleteSummary,
} from '@/composables/useClusterGroupedBatchDelete'

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

/**
 * 集群分组批量删除路由：逐集群顺序请求集合端点，逐条记录进度日志。
 * 单条失败（不存在 / Edge 同步失败）不阻塞其余条，由后端逐条返回。
 */
export async function runClusterGroupedBatchRouteDelete(
  groups: ClusterRouteBatchGroup[],
  payload: RouteBatchDeletePayload,
  hooks: { progress: BatchProgressState },
): Promise<ClusterBatchSummary[]> {
  return runClusterGroupedBatchDelete(
    groups.map((group) => ({
      clusterId: group.clusterId,
      clusterName: group.clusterName,
      items: group.routes.map((r) => ({ id: r.id, label: r.name })),
      // 节点选择按集群裁剪：把别的集群勾选的节点带进本集群请求会造成跨集群误删
      nodeIds: payload.nodeIds.filter((id) => group.nodeIds.includes(id)),
    })),
    {
      title: '批量删除路由',
      entity: '路由',
      endpoint: (group) => `/clusters/${group.clusterId}/routes`,
      idsField: 'route_ids',
      idField: 'route_id',
      nameField: 'route_name',
      deleteDb: payload.deleteDb,
      deleteEdge: payload.deleteEdge,
      sendNodeIds: true,
      // 单条成功/失败都带 database/edge 子作用域明细（后端逐条返回）
      detailLogs: (entry) => subScopeLogs(entry),
      // 后端 status=success 且无 error 才算成功（有 error 的条目仍要记为失败）
      isSuccess: (entry) => entry.status === 'success' && !entry.error,
    },
    hooks,
  )
}

/** 汇总文案（与节点/上游批量条同源 formatter）：成功/失败一条提示，集群级失败原因并入括号 */
export function routeBatchSummaryMessage(summaries: ClusterBatchSummary[]): ClusterBatchDeleteSummary {
  const { success, failed, clusterErrors } = batchDeleteSummaryParts(summaries)
  const text = `已删除 ${success} 条路由${failed > 0 ? `，${failed} 条失败：${formatClusterBatchSummary(summaries)}` : ''}${
    clusterErrors.length ? `（${clusterErrors.join('；')}）` : ''
  }`
  return { success, failed, text }
}
