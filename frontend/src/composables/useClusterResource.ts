import { type Ref } from 'vue'
import { message } from 'ant-design-vue'
import api from '@/api'
import type { Cluster } from '@/types'
import { executePublish, executeDeleteWithProgress } from './useClusterUtils'

/** 与 useClusterPluginEntity.VersionModalState 对齐的版本弹窗状态 */
export interface ResourceVersionModalState {
  type: Ref<'upstream' | 'route' | 'plugin_config' | 'global_rule' | 'static_resource'>
  visible: Ref<boolean>
  resourceId: Ref<number | null>
  clusterId: Ref<number | null>
  resourceName: Ref<string>
  edgeUuid: Ref<string>
}

/** 资源在 Cluster 对象上的状态键名 */
export interface ResourceStateKeys {
  items: string
  pagination: string
  loading: string
  search: string
  searchField: string
  sortBy: string
  sortOrder: string
  selected: string
  selectedKeys: string
  count?: string
}

export interface ClusterResourceConfig<T extends { id: number; name: string }> {
  /** 资源中文名，如 '路由' / '上游'（用于所有提示与确认文案） */
  noun: string
  /** API 端点段，如 'routes' / 'upstreams' */
  endpoint: string
  /** 版本管理弹窗的 resource_type */
  versionType: 'upstream' | 'route' | 'plugin_config' | 'global_rule' | 'static_resource'
  /** Cluster 上的状态键名 */
  keys: ResourceStateKeys
  /** 表格排序字段映射（列 key → 后端 sort_by） */
  sortFieldMap?: Record<string, string>
  /**
   * 单条删除前置守卫：返回提示文案则阻止删除（如 DNS 路由、被路由引用的上游）。
   * 可为 async（如上游需先拉取路由列表）。
   */
  deleteGuard?: (cluster: Cluster, item: T) => Promise<string | null> | string | null
  /** 守卫提示的消息级别（routes 的 DNS 守卫用 warning，upstream 的引用守卫用 error） */
  deleteGuardLevel?: 'warning' | 'error'
  /**
   * 批量删除过滤：返回参与删除的子集；返回 null 表示整体中止。
   * 警告文案由过滤器自行 message 提示。
   */
  batchFilter?: (cluster: Cluster, items: T[]) => Promise<T[] | null> | T[] | null
  /** 批量删除的 resourceKey 参数 */
  batchResourceKey: { field: string; label: string; nameField: string }
}

export interface ClusterResourceDeps {
  openPublishModal: (title: string, clusterId: number) => Promise<number[]>
  showDeleteConfirm: (opts: {
    title: string
    apiEndpoint: string
    onOk: (deleteDb: boolean, deleteEdge: boolean, nodeIds: number[]) => void
    showResourceStats?: boolean
    stats?: Record<string, number>
    nodes?: { id: number; ip: string; management_port: number }[]
  }) => void
  versionModal: ResourceVersionModalState
}

// Cluster 状态键为动态名，通过受控访问器读写（避免散落的类型断言）
function getState<T>(c: Cluster, key: string): T | undefined {
  return (c as unknown as Record<string, T | undefined>)[key]
}
function setState(c: Cluster, key: string, value: unknown): void {
  ;(c as unknown as Record<string, unknown>)[key] = value
}

/**
 * 集群子资源的通用 CRUD 骨架：加载(搜索/排序/分页)、选择、删除(单条/批量)、发布、版本管理。
 *
 * 各资源 composable 保留表单模型、校验、编辑/复制表单填充等真实差异，
 * 通过本工厂消除 load/select/delete/publish/version 十件套的平行复制。
 * 导出函数名在各资源内保持原名，视图层零改动。
 */
export function useClusterResource<T extends { id: number; name: string; edge_uuid?: string }>(
  config: ClusterResourceConfig<T>,
  deps: ClusterResourceDeps,
) {
  const { noun, endpoint, versionType, keys } = config
  const { openPublishModal, showDeleteConfirm } = deps
  const versionModal = deps.versionModal

  // 同一查询条件去重（搜索/排序变化时清空勾选）
  const lastQuery = new WeakMap<Cluster, { search: string; field: string; sortBy: string; sortOrder: string }>()

  async function load(cluster: Cluster) {
    const prev = lastQuery.get(cluster)
    const next = {
      search: getState<string>(cluster, keys.search) || '',
      field: getState<string>(cluster, keys.searchField) || '',
      sortBy: getState<string>(cluster, keys.sortBy) || '',
      sortOrder: getState<string>(cluster, keys.sortOrder) || '',
    }
    if (prev && (prev.search !== next.search || prev.field !== next.field || prev.sortBy !== next.sortBy || prev.sortOrder !== next.sortOrder)) {
      setState(cluster, keys.selectedKeys, [])
      setState(cluster, keys.selected, null)
    }
    lastQuery.set(cluster, next)
    setState(cluster, keys.loading, true)
    try {
      const pagination = getState<{ page: number; pageSize: number }>(cluster, keys.pagination)
      const params: Record<string, unknown> = {
        page: pagination?.page || 1,
        page_size: pagination?.pageSize || 20,
      }
      if (next.search) {
        params.search = next.search
        if (next.field) {
          params.search_field = next.field
        }
      }
      if (next.sortBy) {
        params.sort_by = next.sortBy
        params.sort_order = next.sortOrder
      }
      const res = await api.get(`/clusters/${cluster.id}/${endpoint}`, { params })
      setState(cluster, keys.items, res.data.items)
      setState(cluster, keys.pagination, {
        total: res.data.total,
        page: res.data.page,
        pageSize: res.data.page_size,
      })
    } catch {
      message.error(`加载${noun}列表失败`)
    } finally {
      setState(cluster, keys.loading, false)
    }
  }

  function handleTableChange(
    cluster: Cluster,
    pag: { current: number; pageSize: number },
    sorter: { field?: string; order?: string },
  ) {
    const pagination = getState<{ page: number; pageSize: number }>(cluster, keys.pagination)
    if (pagination) {
      pagination.page = pag.current
      pagination.pageSize = pag.pageSize
    }
    if (sorter && sorter.field) {
      const fieldMap = config.sortFieldMap || {}
      setState(cluster, keys.sortBy, fieldMap[sorter.field] || sorter.field)
      setState(cluster, keys.sortOrder, sorter.order === 'ascend' ? 'asc' : 'desc')
      // 排序改变数据集，清除批量勾选与单选（D9）
      setState(cluster, keys.selectedKeys, [])
      setState(cluster, keys.selected, null)
    } else {
      setState(cluster, keys.sortBy, '')
      setState(cluster, keys.sortOrder, 'asc')
    }
    load(cluster)
  }

  function selectOne(cluster: Cluster, item: T | undefined) {
    setState(cluster, keys.selected, item || null)
  }

  function selectMany(cluster: Cluster, keysOrUnknown: number[] | (string | number)[], rows: T[]) {
    setState(cluster, keys.selectedKeys, keysOrUnknown as number[])
    setState(cluster, keys.selected, keysOrUnknown.length === 1 ? (rows[0] ?? null) : null)
  }

  function requireSelected(cluster: Cluster): T | null {
    const selected = getState<T>(cluster, keys.selected)
    if (!selected) {
      message.warning(`请先选择一个${noun}`)
      return null
    }
    return selected
  }

  function getActionButtonTitle(key: string, buttons: { key: string; title: string }[]) {
    const btn = buttons.find((b) => b.key === key)
    return btn?.title || key
  }

  // ── 删除 ───────────────────────────────────────────────────────────

  // 同步守卫时保持与旧实现一致：showDeleteConfirm 同步派发（调用方与单测依赖此契约）
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
          refreshFn: () => load(cluster),
          clearSelectedFn: () => { setState(cluster, keys.selected, null) },
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
    const selected = getState<T>(cluster, keys.selected)
    if (!selected) {
      message.warning(`请先选择一个${noun}`)
      return
    }
    deleteByRecord(cluster, selected)
  }

  function proceedDeleteMany(cluster: Cluster, targets: T[]) {
    const names = targets.map((r) => r.name)
    const title = names.length > 3
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
          resourceKey: { ...config.batchResourceKey, keys: ids },
          cluster,
          deleteDb,
          deleteEdge,
          nodeIds,
          refreshFn: () => load(cluster),
          clearSelectedFn: () => { setState(cluster, keys.selectedKeys, []); setState(cluster, keys.selected, null) },
        })
      },
    })
  }

  function deleteMany(cluster: Cluster) {
    const selectedKeys = getState<number[]>(cluster, keys.selectedKeys) || []
    if (selectedKeys.length === 0) {
      message.warning(`请先勾选要删除的${noun}`)
      return
    }
    const items = (getState<T[]>(cluster, keys.items) || []).filter((r) => selectedKeys.includes(r.id))

    if (!config.batchFilter) {
      return proceedDeleteMany(cluster, items)
    }
    const filtered = config.batchFilter(cluster, items)
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
      refreshFn: () => load(cluster),
    })
  }

  async function publishSelected(cluster: Cluster) {
    const selected = getState<T>(cluster, keys.selected)
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
    const selected = getState<T>(cluster, keys.selected)
    if (!selected) {
      message.warning(`请先选择一个${noun}`)
      return
    }
    openVersionManagementByRecord(cluster, selected)
  }

  return {
    load,
    handleTableChange,
    selectOne,
    selectMany,
    requireSelected,
    getActionButtonTitle,
    deleteSelected,
    deleteByRecord,
    deleteMany,
    publishSelected,
    publishByRecord,
    openVersionManagement,
    openVersionManagementByRecord,
  }
}
