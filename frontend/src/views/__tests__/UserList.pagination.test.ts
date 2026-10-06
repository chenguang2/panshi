/**
 * UserList.vue 真后端分页回归（数据截断修复）。
 *
 * 背景：此前页面把 listUsers() 一次性拉回的数据做内存切片，后端默认只回
 * 20 条 → 第 21+ 个用户不可见。现改为 UpstreamList 同款真后端分页：
 * 请求带 page/page_size/keyword/role/status（空值不传），total 来自后端。
 *
 * mock 规则（AGENTS #43）：URL 感知兜底实现（禁止 mockResolvedValueOnce 顺序链），
 * 响应形状取自真实后端 GET /api/v1/admin/users 的 curl 实测：
 * { total, items: [{ id, username, role, status, created_at, permissions, cluster_ids }] }
 * （真实响应无 page/page_size 字段，故不虚构）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import type { TablePaginationConfig } from 'ant-design-vue'
import { useAuthStore } from '@/stores/auth'

const mockApiGet = vi.fn()
const mockApiPut = vi.fn()
const mockApiPost = vi.fn()
const mockApiDelete = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    put: (...args: any[]) => mockApiPut(...args),
    post: (...args: any[]) => mockApiPost(...args),
    delete: (...args: any[]) => mockApiDelete(...args),
  },
}))

// ── 模拟后端 /admin/users：按参数过滤 + 真分页切片 ─────────────────────────
function makeUser(id: number, username: string, overrides: Record<string, any> = {}) {
  return {
    id,
    username,
    role: 'user',
    status: 1,
    created_at: '2026-07-22T00:50:15.983075',
    permissions: [],
    cluster_ids: [],
    ...overrides,
  }
}

const ALL_USERS = [
  ...Array.from({ length: 25 }, (_, i) => makeUser(i + 2, `page-user-${String(i + 1).padStart(2, '0')}`)),
  makeUser(99, 'disabled-user-1', { status: 0 }),
] // 26 个用户：25 启用 + 1 禁用（>20 触发截断场景）

function backendListUsers(params: Record<string, any> = {}) {
  let list = ALL_USERS
  if (params.keyword) list = list.filter((u) => u.username.includes(params.keyword))
  if (params.role) list = list.filter((u) => u.role === params.role)
  if (params.status !== undefined) list = list.filter((u) => u.status === params.status)
  const page = params.page ?? 1
  const size = params.page_size ?? 20
  return { total: list.length, items: list.slice((page - 1) * size, page * size) }
}

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  AButton: {
    template: '<button class="mock-btn" @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'size', 'loading'],
  },
  ATable: {
    template:
      '<div class="mock-table"><template v-for="(item, idx) in dataSource" :key="item.id"><slot name="bodyCell" :column="{ key: \'index\' }" :record="item" :index="idx" /><slot name="bodyCell" :column="{ key: \'username\' }" :record="item" :index="idx" /><slot name="bodyCell" :column="{ key: \'role\' }" :record="item" :index="idx" /><slot name="bodyCell" :column="{ key: \'status\' }" :record="item" :index="idx" /><slot name="bodyCell" :column="{ key: \'permissions\' }" :record="item" :index="idx" /><slot name="bodyCell" :column="{ key: \'clusters\' }" :record="item" :index="idx" /><slot name="bodyCell" :column="{ key: \'created_at\' }" :record="item" :index="idx" /><slot name="bodyCell" :column="{ key: \'actions\' }" :record="item" :index="idx" /></template><slot /></div>',
    props: ['columns', 'dataSource', 'loading', 'pagination', 'rowKey', 'size'],
  },
  ADropdown: { template: '<div class="mock-dropdown"><slot /><slot name="overlay" /></div>', props: ['trigger'] },
  AMenu: { template: '<div class="mock-menu"><slot /></div>' },
  AMenuItem: { template: '<div class="mock-menuitem" @click="$emit(\'click\')"><slot /></div>' },
  ATooltip: { template: '<span><slot name="title" /><slot /></span>' },
  ACheckbox: {
    template: '<input type="checkbox" :checked="checked" @change="$emit(\'update:checked\', $event.target.checked)" />',
    props: ['checked', 'indeterminate'],
  },
}

async function mountPage() {
  const UserList = (await import('../UserList.vue')).default
  const wrapper = mount(UserList, { global: { stubs } })
  await flushPromises()
  await wrapper.vm.$nextTick()
  return wrapper
}

function getTable(wrapper: Awaited<ReturnType<typeof mountPage>>) {
  return wrapper.findComponent(stubs.ATable)
}

function lastListCallParams(): Record<string, any> | undefined {
  const calls = mockApiGet.mock.calls.filter(([url]) => url === '/admin/users')
  const last = calls[calls.length - 1]
  return last?.[1]?.params
}

describe('UserList.vue 真后端分页', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const authStore = useAuthStore()
    authStore.user = makeUser(1, 'admin', { role: 'admin' })
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string, config?: { params?: Record<string, any> }) => {
      if (url === '/admin/users') {
        return Promise.resolve({ data: backendListUsers(config?.params) })
      }
      if (url === '/clusters') {
        return Promise.resolve({
          data: { items: [{ id: 1, name: 'cluster-a', display_name: '集群A', group_name: '默认' }] },
        })
      }
      if (url === '/admin/users/me') {
        return Promise.resolve({ data: makeUser(1, 'admin', { role: 'admin' }) })
      }
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  it('初始加载请求携带 page/page_size，空筛选项不传', async () => {
    await mountPage()
    expect(mockApiGet).toHaveBeenCalledWith('/admin/users', { params: { page: 1, page_size: 20 } })
  })

  it('total 来自后端（而非当前页行数），表格只渲染当前页', async () => {
    const wrapper = await mountPage()
    const table = getTable(wrapper)
    const pagination = table.props('pagination') as TablePaginationConfig
    expect(pagination.total).toBe(26)
    expect(pagination.current).toBe(1)
    expect(pagination.pageSize).toBe(20)
    expect(table.props('dataSource')).toHaveLength(20)
    // 精确匹配计数文案「共 {{ totalCount }} 个用户」，total 是后端全量计数
    const countSpan = wrapper.findAll('span').find((s) => s.text().includes('个用户'))
    expect(countSpan).toBeDefined()
    expect(countSpan!.text()).toBe('共 26 个用户')
  })

  it('翻页触发新请求并渲染第 2 页数据', async () => {
    const wrapper = await mountPage()
    const table = getTable(wrapper)
    table.vm.$emit('change', { current: 2, pageSize: 20 })
    await flushPromises()
    expect(lastListCallParams()).toEqual({ page: 2, page_size: 20 })
    expect(table.props('dataSource')).toHaveLength(6) // 26 - 20
    expect((table.props('pagination') as TablePaginationConfig).current).toBe(2)
  })

  it('修改 pageSize 触发新请求（handleTableChange 写回 pageSize）', async () => {
    const wrapper = await mountPage()
    const table = getTable(wrapper)
    table.vm.$emit('change', { current: 1, pageSize: 50 })
    await flushPromises()
    expect(lastListCallParams()).toEqual({ page: 1, page_size: 50 })
    expect(table.props('dataSource')).toHaveLength(26)
  })

  it('关键词筛选：重置到第 1 页并携带 keyword', async () => {
    const wrapper = await mountPage()
    const table = getTable(wrapper)
    table.vm.$emit('change', { current: 2, pageSize: 20 })
    await flushPromises()
    await wrapper.find('.search-input-wrap input').setValue('disabled')
    await flushPromises()
    expect(lastListCallParams()).toEqual({ page: 1, page_size: 20, keyword: 'disabled' })
    expect(table.props('dataSource')).toHaveLength(1)
  })

  it('角色筛选：携带 role 并重置页码', async () => {
    const wrapper = await mountPage()
    await wrapper.findAll('select')[0].setValue('admin')
    await flushPromises()
    expect(lastListCallParams()).toEqual({ page: 1, page_size: 20, role: 'admin' })
  })

  it('状态筛选：携带数值型 status 并重置页码', async () => {
    const wrapper = await mountPage()
    await wrapper.findAll('select')[1].setValue('0')
    await flushPromises()
    expect(lastListCallParams()).toEqual({ page: 1, page_size: 20, status: 0 })
  })
})

describe('UserList.vue 非管理员路径', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const authStore = useAuthStore()
    authStore.user = null // 非管理员：getMyProfile 兜底，不分页
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters') {
        return Promise.resolve({ data: { items: [] } })
      }
      if (url === '/admin/users/me') {
        return Promise.resolve({ data: makeUser(2, 'normal-user') })
      }
      return Promise.reject(new Error('unknown url: ' + url))
    })
  })

  it('非管理员走 getMyProfile，totalCount=1，不调 listUsers', async () => {
    const wrapper = await mountPage()
    expect(mockApiGet).toHaveBeenCalledWith('/admin/users/me')
    expect(mockApiGet).not.toHaveBeenCalledWith('/admin/users', expect.anything())
    const table = getTable(wrapper)
    expect(table.props('dataSource')).toHaveLength(1)
    const countSpan = wrapper.findAll('span').find((s) => s.text().includes('个用户'))
    expect(countSpan!.text()).toBe('共 1 个用户')
  })
})
