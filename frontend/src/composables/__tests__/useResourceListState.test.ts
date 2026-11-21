// B0 前置层：ResourceListState 适配接口（shared-core-plan 3.2）
// 两个工厂各自覆盖「读取映射 / 集群为空安全 / setPage 写回 / 动作透传」。
import { describe, it, expect, vi } from 'vitest'
import { reactive, ref } from 'vue'
import { clusterResourceState, localResourceState, EMPTY_RESOURCE_PAGINATION } from '@/composables/useResourceListState'
import type { ResourcePagination } from '@/composables/useResourceListState'

interface Row {
  id: number
}

/** 最小集群形状（只含本层读取的字段，证明不依赖 @/types 的具体业务类型） */
interface FakeCluster {
  nodes: Row[]
  nodesLoading: boolean
  nodesPagination: ResourcePagination
  selectedNodeKeys: (number | string)[]
}

function makeCluster(over: Partial<FakeCluster> = {}): FakeCluster {
  return {
    nodes: [{ id: 1 }, { id: 2 }],
    nodesLoading: false,
    nodesPagination: { page: 2, pageSize: 20, total: 42 },
    selectedNodeKeys: [1],
    ...over,
  }
}

function setupCluster(initial: FakeCluster | null) {
  let current = initial
  const reload = vi.fn()
  const clearSelection = vi.fn((c: FakeCluster) => {
    c.selectedNodeKeys = []
  })
  const state = clusterResourceState({
    getCluster: () => current,
    rows: (c) => c.nodes,
    loading: (c) => c.nodesLoading,
    pagination: (c) => c.nodesPagination,
    selectedKeys: (c) => c.selectedNodeKeys,
    clearSelection,
    reload,
  })
  return {
    state,
    reload,
    clearSelection,
    setCluster: (c: FakeCluster | null) => {
      current = c
    },
    cluster: () => current,
  }
}

describe('clusterResourceState · 读取映射', () => {
  it('rows / loading / pagination / selectedKeys 全部取自集群对象', () => {
    const cluster = makeCluster({ nodesLoading: true })
    const { state } = setupCluster(cluster)
    expect(state.rows).toEqual([{ id: 1 }, { id: 2 }])
    expect(state.loading).toBe(true)
    expect(state.pagination).toEqual({ page: 2, pageSize: 20, total: 42 })
    expect(state.selectedKeys).toEqual([1])
  })

  it('分页对象是来源本体（不是拷贝）——下游按引用写回才生效', () => {
    const cluster = makeCluster()
    const { state } = setupCluster(cluster)
    expect(state.pagination).toBe(cluster.nodesPagination)
  })
})

describe('clusterResourceState · 空集群安全', () => {
  it('集群为 null → 空数组 / 空分页 / loading=false，方法全部 no-op', () => {
    const { state, reload, clearSelection } = setupCluster(null)
    expect(state.rows).toEqual([])
    expect(state.loading).toBe(false)
    expect(state.pagination).toEqual(EMPTY_RESOURCE_PAGINATION)
    expect(state.selectedKeys).toEqual([])

    expect(() => state.setPage(3, 50)).not.toThrow()
    expect(() => state.clearSelection()).not.toThrow()
    expect(() => state.reload()).not.toThrow()
    expect(reload).not.toHaveBeenCalled()
    expect(clearSelection).not.toHaveBeenCalled()
  })

  it('未提供 loading 映射时恒为 false', () => {
    const state = clusterResourceState({
      getCluster: () => makeCluster(),
      rows: (c: FakeCluster) => c.nodes,
      pagination: (c: FakeCluster) => c.nodesPagination,
      selectedKeys: (c: FakeCluster) => c.selectedNodeKeys,
      clearSelection: () => undefined,
      reload: () => undefined,
    })
    expect(state.loading).toBe(false)
  })
})

describe('clusterResourceState · setPage 写回来源', () => {
  it('同时写 page 与 pageSize 到集群的分页对象', () => {
    const cluster = makeCluster()
    const { state } = setupCluster(cluster)
    state.setPage(4, 50)
    expect(cluster.nodesPagination.page).toBe(4)
    expect(cluster.nodesPagination.pageSize).toBe(50)
    expect(state.pagination).toEqual({ page: 4, pageSize: 50, total: 42 })
  })

  it('省略 pageSize 时只改 page，保留每页条数', () => {
    const cluster = makeCluster()
    const { state } = setupCluster(cluster)
    state.setPage(3)
    expect(cluster.nodesPagination.page).toBe(3)
    expect(cluster.nodesPagination.pageSize).toBe(20)
  })
})

describe('clusterResourceState · 动作透传', () => {
  it('clearSelection / reload 以集群为参数调用来源方法', async () => {
    const cluster = makeCluster()
    const { state, clearSelection, reload } = setupCluster(cluster)
    state.clearSelection()
    await state.reload()
    expect(clearSelection).toHaveBeenCalledWith(cluster)
    expect(reload).toHaveBeenCalledWith(cluster)
    expect(state.selectedKeys).toEqual([])
  })
})

describe('localResourceState', () => {
  it('读取映射来自本地 ref', () => {
    const rows = ref<Row[]>([{ id: 7 }])
    const loading = ref(true)
    const pagination = ref<ResourcePagination>({ page: 1, pageSize: 20, total: 1 })
    const selectedKeys = ref<(number | string)[]>([7])
    const state = localResourceState({ rows, loading, pagination, selectedKeys, reload: () => undefined })

    expect(state.rows).toEqual([{ id: 7 }])
    expect(state.loading).toBe(true)
    expect(state.pagination).toEqual({ page: 1, pageSize: 20, total: 1 })
    expect(state.selectedKeys).toEqual([7])
  })

  it('setPage 写回 ref（含页容量），省略 pageSize 时保留原值', () => {
    const pagination = ref<ResourcePagination>({ page: 1, pageSize: 20, total: 100 })
    const state = localResourceState({
      rows: ref<Row[]>([]),
      loading: ref(false),
      pagination,
      selectedKeys: ref<(number | string)[]>([]),
      reload: () => undefined,
    })

    state.setPage(2, 50)
    expect(pagination.value).toEqual({ page: 2, pageSize: 50, total: 100 })

    state.setPage(5)
    expect(pagination.value).toEqual({ page: 5, pageSize: 50, total: 100 })
  })

  it('分页来源是 reactive 对象（非 ref）时同样就地写回', () => {
    const pagination = reactive<ResourcePagination>({ page: 1, pageSize: 20, total: 3 })
    const state = localResourceState({
      rows: ref<Row[]>([]),
      loading: ref(false),
      pagination,
      selectedKeys: ref<(number | string)[]>([]),
      reload: () => undefined,
    })

    state.setPage(3, 10)
    expect(pagination.page).toBe(3)
    expect(pagination.pageSize).toBe(10)
    expect(state.pagination).toEqual({ page: 3, pageSize: 10, total: 3 })
  })

  it('clearSelection 清空选择、reload 透传到页面加载函数', async () => {
    const selectedKeys = ref<(number | string)[]>([1, 2])
    const reload = vi.fn()
    const state = localResourceState({
      rows: ref<Row[]>([]),
      loading: ref(false),
      pagination: ref<ResourcePagination>({ page: 1, pageSize: 20, total: 0 }),
      selectedKeys,
      reload,
    })

    state.clearSelection()
    await state.reload()
    expect(selectedKeys.value).toEqual([])
    expect(state.selectedKeys).toEqual([])
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
