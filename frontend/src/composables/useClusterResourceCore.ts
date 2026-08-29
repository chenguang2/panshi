import { type Ref } from 'vue'
import { message } from 'ant-design-vue'
import type { Cluster } from '@/types'
import { executePublish, executeDeleteWithProgress } from './useClusterUtils'

/** 版本管理弹窗可用的资源类型 */
export type VersionResourceType = 'upstream' | 'route' | 'plugin_config' | 'global_rule' | 'static_resource'

/** 版本管理弹窗共享状态（useClusterResource 与 useClusterPluginEntity 共用） */
export interface VersionModalState {
  type: Ref<VersionResourceType>
  visible: Ref<boolean>
  resourceId: Ref<number | null>
  clusterId: Ref<number | null>
  resourceName: Ref<string>
  edgeUuid: Ref<string>
}

export interface ResourceCoreDeps {
  openPublishModal: (title: string, clusterId: number) => Promise<number[]>
  showDeleteConfirm: (opts: {
    title: string
    apiEndpoint: string
    onOk: (deleteDb: boolean, deleteEdge: boolean, nodeIds: number[]) => void
    showResourceStats?: boolean
    stats?: Record<string, number>
    nodes?: { id: number; ip: string; management_port: number }[]
  }) => void
  versionModal: VersionModalState
}

export interface ResourceCoreConfig<T extends { id: number; name: string; edge_uuid?: string }> {
  /** 资源中文名，如 '路由' / '上游' / '插件组'（用于所有提示与确认文案） */
  noun: string
  /** API 端点段，如 'routes' / 'plugin_configs' */
  endpoint: string
  /** 版本管理弹窗的 resource_type */
  versionType: VersionResourceType
  /** 当前选中项（单选）——各工厂按自己的状态位置实现 */
  getSelected: (cluster: Cluster) => T | null
  setSelected: (cluster: Cluster, item: T | null) => void
  /** 批量勾选 key（不支持批量的工厂返回空数组） */
  getSelectedKeys: (cluster: Cluster) => number[]
  setSelectedKeys: (cluster: Cluster, keys: number[]) => void
  /** 操作完成后的列表刷新 */
  refresh: (cluster: Cluster) => Promise<void>
  /** 批量删除参数（不配置则删除/批量操作不可用，plugin-entity 单选模式） */
  batchResourceKey?: { field: string; label: string; nameField: string }
  /** 批量勾选对应的完整列表（供批量删除筛选目标） */
  batchItems?: (cluster: Cluster) => T[]
  /** 单条删除前置守卫：返回提示文案则阻止删除 */
  deleteGuard?: (cluster: Cluster, item: T) => Promise<string | null> | string | null
  /** 守卫提示的消息级别 */
  deleteGuardLevel?: 'warning' | 'error'
  /** 批量删除过滤：返回参与删除的子集；返回 null 表示整体中止 */
  batchFilter?: (cluster: Cluster, items: T[]) => Promise<T[] | null> | T[] | null
}

/**
 * 集群子资源的共享删除/发布/版本骨架（Phase 4 合并）。
 *
 * useClusterResource（分页资源）与 useClusterPluginEntity（插件实体）的
 * 十件套中，删除/发布/版本管理完全同构，仅状态位置不同——通过 selection
 * 访问器参数化收敛为单一实现；各工厂保留负载/表单/抽屉等真实差异。
 */
export function useClusterResourceCore<T extends { id: number; name: string; edge_uuid?: string }>(
  config: ResourceCoreConfig<T>,
  deps: ResourceCoreDeps,
) {
  const { noun, endpoint, versionType } = config
  const { openPublishModal, showDeleteConfirm } = deps
  const versionModal = deps.versionModal

  // ── 删除 ───────────────────────────────────────────────────────────

  function proceedDelete(cluster: Cluster, item: T) {
    showDeleteConfirm({
      title: `确定要删除${noun} "${item.name}" 吗？`,
      apiEndpoint: `/clusters/${cluster.id}/${endpoint}/${item.id}`,
      nodes: cluster.nodes,
      onOk: async (deleteDb, deleteEdge, nodeIds) => {
        await executeDeleteWithProgress({
          title: `删除${noun}: ${item.name}`,
          apiEndpoint: `/clusters/${cluster.id}/${endpoint}/${item.id}`,
          cluster,
          deleteDb,
          deleteEdge,
          nodeIds,
          refreshFn: () => config.refresh(cluster),
          clearSelectedFn: () => config.setSelected(cluster, null),
        })
      },
    })
  }

  function notifyBlocked(blocked: string) {
    const notify = config.deleteGuardLevel === 'error' ? message.error : message.warning
    notify(blocked)
  }

  function deleteByRecord(cluster: Cluster, item: T) {
    if (!config.deleteGuard) {
      return proceedDelete(cluster, item)
    }
    const blocked = config.deleteGuard(cluster, item)
    if (blocked instanceof Promise) {
      return blocked.then((msg) => {
        if (msg) {
          notifyBlocked(msg)
          return
        }
        proceedDelete(cluster, item)
      })
    }
    if (blocked) {
      notifyBlocked(blocked)
      return
    }
    proceedDelete(cluster, item)
  }

  function deleteSelected(cluster: Cluster) {
    const selected = config.getSelected(cluster)
    if (!selected) {
      message.warning(`请先选择一个${noun}`)
      return
    }
    deleteByRecord(cluster, selected)
  }

  function proceedDeleteMany(cluster: Cluster, targets: T[]) {
    if (!config.batchResourceKey) return
    const names = targets.map((r) => r.name)
    const title =
      names.length > 3
        ? `确定要删除选中的 ${names.length} 条${noun}吗？${names.slice(0, 3).join('、')} 等 ${names.length} 条`
        : `确定要删除选中的 ${names.length} 条${noun}吗？${names.join('、')}`
    const ids = targets.map((r) => r.id)
    showDeleteConfirm({
      title,
      apiEndpoint: `/clusters/${cluster.id}/${endpoint}`,
      nodes: cluster.nodes,
      onOk: async (deleteDb, deleteEdge, nodeIds) => {
        await executeDeleteWithProgress({
          title: `批量删除${noun}: ${names.join('、')}`,
          apiEndpoint: `/clusters/${cluster.id}/${endpoint}`,
          resourceKey: { ...config.batchResourceKey!, keys: ids },
          cluster,
          deleteDb,
          deleteEdge,
          nodeIds,
          refreshFn: () => config.refresh(cluster),
          clearSelectedFn: () => {
            config.setSelectedKeys(cluster, [])
            config.setSelected(cluster, null)
          },
        })
      },
    })
  }

  function deleteMany(cluster: Cluster) {
    if (!config.batchResourceKey) {
      message.warning('该资源不支持批量删除')
      return
    }
    const selectedKeys = config.getSelectedKeys(cluster)
    if (selectedKeys.length === 0) {
      message.warning(`请先勾选要删除的${noun}`)
      return
    }
    // 批量目标从列表状态取——调用方通过 itemsProvider 提供（避免核心依赖具体状态键）
    const items = config.batchItems ? config.batchItems(cluster) : []
    const selected = items.filter((r) => selectedKeys.includes(r.id))

    if (!config.batchFilter) {
      return proceedDeleteMany(cluster, selected)
    }
    const filtered = config.batchFilter(cluster, selected)
    if (filtered instanceof Promise) {
      return filtered.then((targets) => {
        if (!targets || targets.length === 0) return
        proceedDeleteMany(cluster, targets)
      })
    }
    if (!filtered || filtered.length === 0) return
    proceedDeleteMany(cluster, filtered)
  }

  // ── 发布 ───────────────────────────────────────────────────────────

  async function publishByRecord(cluster: Cluster, record: T) {
    const nodeIds = await openPublishModal(`发布${noun}: ${record.name}`, cluster.id)
    if (!nodeIds.length) return

    await executePublish({
      title: `发布${noun}: ${record.name}`,
      apiEndpoint: `/clusters/${cluster.id}/${endpoint}/${record.id}/publish`,
      nodeIds,
      refreshFn: () => config.refresh(cluster),
    })
  }

  async function publishSelected(cluster: Cluster) {
    const selected = config.getSelected(cluster)
    if (!selected) {
      message.warning(`请先选择一个${noun}`)
      return
    }
    await publishByRecord(cluster, selected)
  }

  // ── 版本管理 ───────────────────────────────────────────────────────

  function openVersionManagementByRecord(cluster: Cluster, record: T) {
    versionModal.type.value = versionType
    versionModal.resourceId.value = record.id
    versionModal.clusterId.value = cluster.id
    versionModal.resourceName.value = record.name
    versionModal.edgeUuid.value = record.edge_uuid || ''
    versionModal.visible.value = true
  }

  function openVersionManagement(cluster: Cluster) {
    const selected = config.getSelected(cluster)
    if (!selected) {
      message.warning(`请先选择一个${noun}`)
      return
    }
    openVersionManagementByRecord(cluster, selected)
  }

  return {
    deleteSelected,
    deleteByRecord,
    deleteMany,
    publishSelected,
    publishByRecord,
    openVersionManagement,
    openVersionManagementByRecord,
  }
}
