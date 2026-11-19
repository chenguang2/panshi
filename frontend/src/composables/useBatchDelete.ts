/**
 * 批量删除统一入口（r24，用户裁定 U2：契约统一）。
 *
 * **唯一实现**：所有卡片页/列表页的「批量删除」都走这里，页面只提供服务性配置
 * （名词、端点、取值器、三个回调），禁止再各页手写「拉节点 → 拼标题 → 开确认弹窗
 * → 组请求 → 清选/退出/刷新」（改造前 5 页共约 294 行近似重复）。
 *
 * 契约：后端批量端点统一为「一个 ids 数组 → 一条 results[]」的**全局跨集群**端点
 * （`DELETE /stream-proxies|/routes|/plugin_configs|/global_rules`），因此本模块
 * **只有一条请求路径**，不再按集群分段。逐条结果由 `executeDeleteWithProgress`
 * 渲染（数据库 ✅ / 各 Edge 节点 ✅❌ / 失败重试）。
 *
 * 约束（AGENTS #88 ⑪）：
 * - 确认弹窗**必须**支持节点可选（节点并集 + 归属集群标注 + 默认全选在线）；
 * - 跨集群选择时节点行显示集群名（避免相邻 IP 选错集群）；
 * - 删除结束刷新列表、清空选择、退出批量模式。
 */

import { getClusterNodes } from '@/api/clusters'
import { PAGE_SIZE_DROPDOWN } from '@/constants'
import { executeDeleteWithProgress, showDeleteConfirm } from '@/composables/useClusterUtils'

export interface BatchDeleteNode {
  id: number
  ip: string
  management_port: number
  status?: number
  clusterName?: string
}

export interface BatchDeleteOptions<T> {
  /** 资源中文名（单数），用于标题/按钮文案：「删除选中的 N 个{label}」 */
  label: string
  /** 全局 ids 批量端点，如 '/plugin_configs' */
  endpoint: string
  /** 后端请求体里的 ids 字段名，如 'plugin_config_ids' */
  idField: string
  /** 后端逐条结果里的名称字段，如 'config_name' */
  nameField: string
  /** 当前选中行 */
  rows: () => T[]
  /** 选中 id（顺序即提交顺序） */
  ids: () => number[]
  nameOf: (row: T) => string
  clusterIdOf: (row: T) => number
  /** 集群 id → 显示名（节点清单标注归属集群用；缺省回落「集群 N」） */
  clusterNameOf?: (clusterId: number) => string
  /** 删除成功后刷新列表 */
  refresh: () => Promise<void>
  /** 清空选择 */
  clearSelection: () => void
  /** 退出批量模式（可选） */
  exitBatch?: () => void
  /** 子集勾选后果文案（{n} 占位未选节点数） */
  subsetConsequence?: string
  /** 附加警示行（如全局规则的集群级警示） */
  extraWarning?: (rows: T[]) => string | undefined
  /** Edge 删除后果行（可选） */
  edgeConsequenceHint?: string
}

/** 拉取涉及集群的节点并集（带归属集群名；单集群取数失败不影响其余） */
export async function fetchBatchDeleteNodes<T>(
  rows: T[],
  opts: Pick<BatchDeleteOptions<T>, 'clusterIdOf' | 'clusterNameOf'>,
): Promise<BatchDeleteNode[]> {
  const clusterIds = [...new Set(rows.map((r) => opts.clusterIdOf(r)))].filter((id) => id > 0)
  let nodes: BatchDeleteNode[] = []
  for (const cid of clusterIds) {
    try {
      const res = await getClusterNodes(cid, { page: 1, page_size: PAGE_SIZE_DROPDOWN })
      const clusterName = opts.clusterNameOf ? opts.clusterNameOf(cid) : `集群 ${cid}`
      nodes = nodes.concat(
        (res.data?.items || []).map((n: { id: number; ip: string; management_port: number; status?: number }) => ({
          id: n.id,
          ip: n.ip,
          management_port: n.management_port,
          status: n.status,
          clusterName,
        })),
      )
    } catch {
      /* 单集群节点取数失败：该集群走「后端全量遍历」兜底 */
    }
  }
  // 节点可能被多个集群共享（同 IP 不同 cluster_id），按节点 id 去重
  const seen = new Set<number>()
  return nodes.filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)))
}

/** 批量删除标题（超过 3 个名称时折叠为「A、B、C 等 N 个」） */
export function buildBatchDeleteTitle<T>(rows: T[], label: string, nameOf: (row: T) => string): string {
  const names = rows.map(nameOf)
  return names.length > 3
    ? `确定要删除选中的 ${names.length} 个${label}吗？${names.slice(0, 3).join('、')} 等 ${names.length} 个`
    : `确定要删除选中的 ${names.length} 个${label}吗？${names.join('、')}`
}

/**
 * 创建该页的批量删除动作（返回可直接绑到按钮的函数）。
 *
 * 用法：
 * ```ts
 * const batchDelete = useBatchDelete({
 *   label: '插件组', endpoint: '/plugin_configs',
 *   idField: 'plugin_config_ids', nameField: 'config_name',
 *   rows: () => selectedConfigs.value, ids: () => selectedIds.value,
 *   nameOf: (pc) => pc.name, clusterIdOf: (pc) => pc.cluster_id,
 *   refresh: loadConfigs, clearSelection, exitBatch: toggleBatchMode,
 * })
 * ```
 */
export function useBatchDelete<T>(opts: BatchDeleteOptions<T>): () => Promise<void> {
  return async function batchDelete(): Promise<void> {
    const rows = opts.rows()
    if (!rows.length) return

    const nodes = await fetchBatchDeleteNodes(rows, opts)

    showDeleteConfirm({
      title: buildBatchDeleteTitle(rows, opts.label, opts.nameOf),
      apiEndpoint: opts.endpoint,
      nodes,
      defaultSelectOnline: true,
      subsetConsequence: opts.subsetConsequence,
      extraWarning: opts.extraWarning ? opts.extraWarning(rows) : undefined,
      edgeConsequenceHint: opts.edgeConsequenceHint,
      onOk: async (deleteDb, deleteEdge, nodeIds) => {
        await executeDeleteWithProgress({
          title: `批量删除${opts.label}（${rows.length} 个）`,
          apiEndpoint: opts.endpoint,
          deleteDb,
          deleteEdge,
          nodeIds,
          resourceKey: {
            field: opts.idField,
            label: opts.label,
            nameField: opts.nameField,
            keys: opts.ids(),
          },
          refreshFn: opts.refresh,
          clearSelectedFn: () => {
            opts.clearSelection()
            opts.exitBatch?.()
          },
          retryable: true,
        })
      },
    })
  }
}
