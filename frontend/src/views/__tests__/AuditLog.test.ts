import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mockApiGet(...args),
    post: (...args: unknown[]) => mockApiPost(...args),
  },
}))

vi.mock('ant-design-vue', () => ({ message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }))

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
  'a-range-picker': { template: '<div class="mock-range-picker" />' },
  'a-date-picker': { template: '<div class="mock-date-picker" />' },
  'a-tooltip': { template: '<span><slot /></span>', props: ['title'] },
  'a-button': { template: '<button><slot /></button>', props: ['size', 'type'] },
  'a-table': {
    props: ['dataSource', 'columns', 'customRow', 'rowKey'],
    template: `<div class="mock-table"><div
      v-for="(r, i) in dataSource"
      :key="(rowKey && rowKey(r)) || r.id"
      class="mock-row"
      @click="customRow && customRow(r).onClick && customRow(r).onClick($event)"
    ><template v-for="col in columns" :key="col.key"><span class="cell"><slot name="bodyCell" :column="col" :record="r" :index="i" /></span></template></div></div>`,
  },
  'a-drawer': { props: ['open'], template: `<div class="mock-drawer" v-if="open"><slot /></div>` },
}

const MOCK_PAGE = {
  total: 3,
  page: 1,
  page_size: 20,
  items: [
    {
      id: 1,
      created_at: '2026-09-11T01:00:00',
      username: 'admin',
      action: 'route_create',
      resource: 'route',
      resource_id: 7,
      detail: '新增路由 demo (/a/*)',
      ip_address: '10.0.0.1',
    },
    {
      id: 2,
      created_at: '2026-09-11T02:00:00',
      username: 'op',
      action: 'archive',
      resource: 'audit_logs',
      resource_id: null,
      detail: '归档清理 3 条审计记录',
      ip_address: '10.0.0.2',
    },
    {
      id: 3,
      created_at: '2026-09-11T03:00:00',
      username: 'admin',
      action: 'cluster_update',
      resource: 'cluster',
      resource_id: 1,
      detail: '更新集群 demo',
      ip_address: '10.0.0.3',
    },
  ],
}

describe('AuditLog.vue 详情抽屉', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/system/operations') return Promise.resolve({ data: MOCK_PAGE })
      if (url === '/system/operations/meta')
        return Promise.resolve({
          data: { users: ['admin'], actions: ['route_create'], resources: ['route'], total: 3, oldest: null },
        })
      return Promise.reject(new Error('unknown url'))
    })
    mockApiPost.mockResolvedValue({ data: {} })
  })

  async function mountPage() {
    const AuditLog = (await import('../AuditLog.vue')).default
    const wrapper = mount(AuditLog, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('点击行打开详情抽屉并显示完整内容', async () => {
    const wrapper = await mountPage()
    expect(wrapper.find('.mock-drawer').exists()).toBe(false)

    await wrapper.findAll('.mock-row')[0].trigger('click')
    await wrapper.vm.$nextTick()

    const drawer = wrapper.find('.mock-drawer')
    expect(drawer.exists()).toBe(true)
    expect(drawer.text()).toContain('新增路由 demo (/a/*)')
    expect(drawer.text()).toContain('10.0.0.1')
  })

  it('点击行内资源链接不触发行打开', async () => {
    const wrapper = await mountPage()
    // 第三条为 cluster 资源（有跳转链接映射）
    const firstRow = wrapper.findAll('.mock-row')[2]
    const link = firstRow.find('a')
    expect(link.exists()).toBe(true)

    await link.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.mock-drawer').exists()).toBe(false)
  })
})
