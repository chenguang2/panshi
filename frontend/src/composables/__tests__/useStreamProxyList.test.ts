import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'

const mockApiGet = vi.fn()
vi.mock('@/api', () => ({ default: { get: (...args: any[]) => mockApiGet(...args), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }))

function makeProxy(id: number, extra: Record<string, any> = {}) {
  return { id, name: `p${id}`, cluster_id: 1, cluster_group_name: '', listen_port: 10000 + id, ...extra }
}

function makeProxies() {
  return [
    makeProxy(1, { cluster_group_name: '组A' }),
    makeProxy(2, { cluster_group_name: '组A' }),
    makeProxy(3, { cluster_group_name: '组B' }),
    makeProxy(4, { cluster_group_name: '组B' }),
  ]
}

describe('useStreamProxyList 批量选择', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/stream-proxies') return Promise.resolve({ data: { total: 0, items: [] } })
      if (url === '/clusters') return Promise.resolve({ data: { items: [] } })
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  it('toggleBatchMode 进入/退出并清空选择', async () => {
    const { useStreamProxyList } = await import('../useStreamProxyList')
    const proxyType = ref<'normal' | 'dns'>('normal')
    const { batchMode, toggleBatchMode, toggleProxy, selectedProxyIds } = useStreamProxyList(proxyType)

    toggleProxy(1)
    expect(selectedProxyIds.value).toEqual([1])

    toggleBatchMode()
    expect(batchMode.value).toBe(true)
    // 进入模式不清空
    expect(selectedProxyIds.value).toEqual([1])

    toggleBatchMode()
    expect(batchMode.value).toBe(false)
    // 退出模式清空
    expect(selectedProxyIds.value).toEqual([])
  })

  it('toggleProxy 增删 id', async () => {
    const { useStreamProxyList } = await import('../useStreamProxyList')
    const proxyType = ref<'normal' | 'dns'>('normal')
    const { toggleProxy, selectedProxyIds } = useStreamProxyList(proxyType)

    toggleProxy(1)
    toggleProxy(2)
    expect(selectedProxyIds.value).toEqual([1, 2])

    toggleProxy(1)
    expect(selectedProxyIds.value).toEqual([2])
  })

  it('toggleSelectAllGroup 全选当前分组，再点取消全选（toggle）', async () => {
    const { useStreamProxyList } = await import('../useStreamProxyList')
    const proxyType = ref<'normal' | 'dns'>('normal')
    const { proxies, groupFilter, toggleSelectAllGroup, selectedProxyIds, allGroupSelected } = useStreamProxyList(proxyType)

    proxies.value = makeProxies()
    groupFilter.value = '组A'

    expect(allGroupSelected.value).toBe(false)
    toggleSelectAllGroup()
    expect(selectedProxyIds.value.sort()).toEqual([1, 2])
    expect(allGroupSelected.value).toBe(true)

    // toggle：已全选时再点取消
    toggleSelectAllGroup()
    expect(selectedProxyIds.value).toEqual([])
    expect(allGroupSelected.value).toBe(false)
  })

  it('toggleSelectAllFiltered 全选当前已加载结果，再点取消全选（toggle）', async () => {
    const { useStreamProxyList } = await import('../useStreamProxyList')
    const proxyType = ref<'normal' | 'dns'>('normal')
    const { proxies, toggleSelectAllFiltered, selectedProxyIds, allFilteredSelected } = useStreamProxyList(proxyType)

    proxies.value = makeProxies()

    expect(allFilteredSelected.value).toBe(false)
    toggleSelectAllFiltered()
    expect(selectedProxyIds.value.sort()).toEqual([1, 2, 3, 4])
    expect(allFilteredSelected.value).toBe(true)

    toggleSelectAllFiltered()
    expect(selectedProxyIds.value).toEqual([])
    expect(allFilteredSelected.value).toBe(false)
  })

  it('筛选变化后已选 id 保留（V8）：selectedProxies 基于原始 proxies 解析', async () => {
    const { useStreamProxyList } = await import('../useStreamProxyList')
    const proxyType = ref<'normal' | 'dns'>('normal')
    const { proxies, toggleProxy, selectedProxies, selectedProxyIds, groupFilter } = useStreamProxyList(proxyType)

    proxies.value = makeProxies()
    toggleProxy(1)
    toggleProxy(3)

    // 切换分组后 id 1 不可见，但仍保留在选中集合中
    groupFilter.value = '组B'
    expect(selectedProxyIds.value.sort()).toEqual([1, 3])
    expect(selectedProxies.value.map((p: any) => p.id).sort()).toEqual([1, 3])
  })

  it('groupFilter 为 __all__ 时 showGroupSelectAll 为 false（V9）', async () => {
    const { useStreamProxyList } = await import('../useStreamProxyList')
    const proxyType = ref<'normal' | 'dns'>('normal')
    const { proxies, groupFilter, showGroupSelectAll } = useStreamProxyList(proxyType)

    proxies.value = makeProxies()
    groupFilter.value = '__all__'
    expect(showGroupSelectAll.value).toBe(false)

    groupFilter.value = '组A'
    expect(showGroupSelectAll.value).toBe(true)
  })
})
