import { message } from 'ant-design-vue'
import api from '@/api'
import type { Cluster } from '@/types'
import {
  useClusterResourceCore,
  type VersionModalState,
  type VersionResourceType,
  type ResourceCoreDeps,
} from './useClusterResourceCore'

/** 版本弹窗状态（兼容旧导出名，与 useClusterPluginEntity.VersionModalState 同构） */
export type ResourceVersionModalState = VersionModalState

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
  versionType: VersionResourceType
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

export type ClusterResourceDeps = ResourceCoreDeps

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
 * 删除/发布/版本十件套由 useClusterResourceCore 共享实现（Phase 4 合并）。
 * 导出函数名在各资源内保持原名，视图层零改动。
 */
export function useClusterResource<T extends { id: number; name: string; edge_uuid?: string }>(
  config: ClusterResourceConfig<T>,
  deps: ClusterResourceDeps,
) {
  const { noun, endpoint, versionType, keys } = config

  const core = useClusterResourceCore(
    {
      noun,
      endpoint,
      versionType,
      getSelected: (c) => getState<T>(c, keys.selected) ?? null,
      setSelected: (c, item) => setState(c, keys.selected, item),
      getSelectedKeys: (c) => getState<number[]>(c, keys.selectedKeys) || [],
      setSelectedKeys: (c, k) => setState(c, keys.selectedKeys, k),
      refresh: (c) => load(c),
      batchResourceKey: config.batchResourceKey,
      batchItems: (c) => getState<T[]>(c, keys.items) || [],
      deleteGuard: config.deleteGuard,
      deleteGuardLevel: config.deleteGuardLevel,
      batchFilter: config.batchFilter,
    },
    deps,
  )

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
    if (
      prev &&
      (prev.search !== next.search ||
        prev.field !== next.field ||
        prev.sortBy !== next.sortBy ||
        prev.sortOrder !== next.sortOrder)
    ) {
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

  return {
    load,
    handleTableChange,
    selectOne,
    selectMany,
    requireSelected,
    getActionButtonTitle,
    deleteSelected: core.deleteSelected,
    deleteByRecord: core.deleteByRecord,
    deleteMany: core.deleteMany,
    publishSelected: core.publishSelected,
    publishByRecord: core.publishByRecord,
    openVersionManagement: core.openVersionManagement,
    openVersionManagementByRecord: core.openVersionManagementByRecord,
  }
}

// 兼容旧导入路径的类型重导出
export type { VersionModalState } from './useClusterResourceCore'
