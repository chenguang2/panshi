import { message } from 'ant-design-vue'
import api from '@/api'
import type { Cluster } from '@/types'

/**
 * 集群子表列表的共享骨架（useClusterListCore）。
 *
 * 2026-11-22：本文件原还提供一个分页资源的通用 CRUD 工厂，面板七个 Tab 改为直接渲染独立页组件
 * （AGENTS #93）后它失去全部生产消费方，已随零消费清理删除——**本文件如今只提供 useClusterListCore
 * 这一共享骨架**（节点子表等分页列表消费）；按 AGENTS #24 它保持独立文件，不向别处合并。
 * 删除/发布/版本十件套的单一实现在 useClusterResourceCore.ts（插件实体等工厂共用），不在本文件。
 */

/** 资源在 Cluster 对象上的状态键名 */
interface ResourceStateKeys {
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

// Cluster 状态键为动态名，通过受控访问器读写（避免散落的类型断言）
function getState<T>(c: Cluster, key: string): T | undefined {
  return (c as unknown as Record<string, T | undefined>)[key]
}
function setState(c: Cluster, key: string, value: unknown): void {
  ;(c as unknown as Record<string, unknown>)[key] = value
}

interface ClusterListCoreConfig {
  /** 资源中文名，如 '路由' / '节点'（用于加载失败与未选择提示） */
  noun: string
  /** API 端点段，如 'routes' / 'nodes' */
  endpoint: string
  /** Cluster 上的状态键名 */
  keys: ResourceStateKeys
  /** 表格排序字段映射（列 key → 后端 sort_by） */
  sortFieldMap?: Record<string, string>
}

/**
 * 集群子表分页列表的共享胶水：加载(搜索/排序/分页/同参去重)、表格翻页排序、单选/多选。
 *
 * 由 useClusterNodes（节点子表）消费，仅以 noun/endpoint/keys/sortFieldMap 参数化；
 * lastQuery 去重与「翻页保勾选、搜索/排序变化清勾选」语义在此单点实现。参数形状取自
 * ant table @change 事件。
 */
export function useClusterListCore<T>(config: ClusterListCoreConfig) {
  const { noun, endpoint, keys } = config

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

  function handleTableChange(cluster: Cluster, pag: Record<string, unknown>, sorter: Record<string, unknown> | null) {
    const pagination = getState<{ page: number; pageSize: number }>(cluster, keys.pagination)
    if (pagination) {
      pagination.page = pag.current as number
      pagination.pageSize = pag.pageSize as number
    }
    if (sorter && sorter.field) {
      const fieldMap = config.sortFieldMap || {}
      setState(cluster, keys.sortBy, fieldMap[sorter.field as string] || (sorter.field as string))
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
  }
}
