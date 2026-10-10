import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

/**
 * F1-NEW-04 时间显示哨兵（约定 #26）：后端时间列一律 naive UTC（isoformat 无时区后缀），
 * 视图必须经 utils/format.ts（parseBackendDate 按 UTC 解析 → Asia/Shanghai 展示）。
 *
 * 哨兵原理：mock 数据给 naive UTC `2026-09-14T16:30:45`，其 Asia/Shanghai 渲染跨日为
 * `2026-09-15 00:30:45`。合规页（显式 timeZone: 'Asia/Shanghai'）在任何机器时区下都渲染
 * 该确定值；违规页（new Date(x).toLocaleString() 直读）按本地墙钟渲染 naive 原值，
 * 永远渲染不出跨日 +8 结果，故断言与机器时区无关且具判别力。
 *
 * 2026-10-01 整改跟进：原违规页 CentralList.vue 与 ClusterList.vue 集群详情抽屉
 * （曾直读 `new Date(detailCluster.created_at).toLocaleString('zh-CN')`）已改为
 * formatDateTime（utils/format），两页详情抽屉时间渲染已纳入本哨兵。
 */

const responses = new Map<string, { data: unknown }>()

const mockApiGet = vi.fn((url: string) => {
  const hit = responses.get(url)
  if (!hit) return Promise.reject(new Error(`unexpected GET: ${url}`))
  return Promise.resolve(hit)
})

vi.mock('@/api', () => ({
  default: { get: (url: string) => mockApiGet(url) },
}))

vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ query: {} }),
}))

vi.mock('ant-design-vue', () => ({ message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }))

// naive UTC（无时区后缀），+8 后跨日：2026-09-15 00:30:45
const NAIVE_UTC = '2026-09-14T16:30:45'
const SHANGHAI_DATE_ONLY = '2026/09/15'
const SHANGHAI_DASH_FULL = '2026-09-15 00:30:45'
const SHANGHAI_SLASH_FULL = '2026/09/15 00:30:45'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  responses.clear()
})

// ── RouteList：formatDateOnly(created_at) ──

describe('时间哨兵 · RouteList.vue', () => {
  const stubs = {
    PageHeader: { template: '<div class="page-header" />', props: ['title', 'description'] },
    RouteFormModal: { template: '<div class="mock-route-form" />', props: ['visible', 'editingRoute', 'clusters'] },
    VersionManagementModal: { template: '<div class="mock-version-modal" />' },
    PublishConfirmModal: { template: '<div class="mock-publish-modal" />' },
    'a-table': {
      template:
        '<div class="mock-table"><div v-for="r in dataSource" :key="r.id" class="mock-row"><slot name="bodyCell" :record="r" :column="{ key: \'created_at\' }" /></div></div>',
      props: ['columns', 'dataSource', 'loading', 'rowKey', 'pagination', 'size'],
    },
  }

  beforeEach(() => {
    responses.set('/routes', {
      data: {
        total: 1,
        page: 1,
        page_size: 20,
        items: [
          {
            id: 1,
            name: '用户API',
            uri: '/api/v1/users/*',
            methods: 'GET,POST',
            cluster_id: 1,
            cluster_name: '生产集群',
            priority: 0,
            current_version: 5,
            created_at: NAIVE_UTC,
            status: 1,
          },
        ],
      },
    })
    responses.set('/clusters', { data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }] } })
    responses.set('/plugins/builtin', { data: { plugins: [] } })
  })

  it('created_at 列按 Asia/Shanghai 渲染（naive UTC 跨日 +8）', async () => {
    const RouteList = (await import('../RouteList.vue')).default
    const wrapper = mount(RouteList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const cell = wrapper.find('.mock-row .cell-secondary')
    expect(cell.exists()).toBe(true)
    expect(cell.text()).toBe(SHANGHAI_DATE_ONLY)
    expect(wrapper.text()).not.toContain('2026/09/14')
  })
})

// ── UpstreamList：PublishStatusTag（formatPublishDateTime(published_at)） ──
// upstream-ux-close-loop 2.6：「创建时间」列已由「发布状态」列（PublishStatusTag）取代，
// 时间哨兵随之迁移到最近发布时间 published_at 的渲染。

describe('时间哨兵 · UpstreamList.vue（PublishStatusTag 发布时间）', () => {
  const stubs = {
    PageHeader: { template: '<div class="page-header" />', props: ['title', 'description'] },
    'a-table': {
      template:
        '<div class="mock-table"><template v-for="item in dataSource"><slot name="bodyCell" :column="{ key: \'publish_status\' }" :record="item" /></template></div>',
      props: ['columns', 'dataSource', 'loading', 'pagination', 'rowKey', 'size'],
    },
  }

  beforeEach(() => {
    responses.set('/upstreams', {
      data: {
        total: 1,
        page: 1,
        page_size: 20,
        items: [
          {
            id: 1,
            name: 'user-service',
            description: '用户服务',
            cluster_id: 1,
            cluster_name: '生产集群',
            load_balance: 'weighted_roundrobin',
            targets: [{ target: '10.0.0.1:8080', weight: 100 }],
            current_version: 3,
            published_at: '2026-09-14T16:30:45Z',
            pending_publish: false,
            last_publish_status: null,
            created_at: NAIVE_UTC,
          },
        ],
      },
    })
    responses.set('/clusters', { data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }] } })
  })

  it('发布时间按 Asia/Shanghai 渲染（UTC 跨日 +8，含秒）', async () => {
    const UpstreamList = (await import('../UpstreamList.vue')).default
    const wrapper = mount(UpstreamList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const dateEl = wrapper.find('.ps-date')
    expect(dateEl.exists()).toBe(true)
    expect(dateEl.text()).toBe(SHANGHAI_SLASH_FULL)
    expect(dateEl.attributes('title')).toBe(`发布时间: ${SHANGHAI_SLASH_FULL}`)
  })
})

// ── AuditLog：formatDateTimeDash(created_at) ──

describe('时间哨兵 · AuditLog.vue', () => {
  const stubs = {
    PageHeader: { template: '<div class="page-header" />', props: ['title', 'description'] },
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
      ><template v-for="col in columns" :key="col.key"><span class="cell"><slot name="bodyCell" :column="col" :record="r" :index="i" /></span></template></div></div>`,
    },
  }

  beforeEach(() => {
    responses.set('/system/operations', {
      data: {
        total: 1,
        page: 1,
        page_size: 20,
        items: [
          {
            id: 1,
            created_at: NAIVE_UTC,
            username: 'admin',
            action: 'route_create',
            resource: 'route',
            resource_id: 7,
            detail: '新增路由 demo (/a/*)',
            ip_address: '10.0.0.1',
          },
        ],
      },
    })
    responses.set('/system/operations/meta', {
      data: { users: ['admin'], actions: ['route_create'], resources: ['route'], total: 1, oldest: null },
    })
  })

  it('列表时间列按 Asia/Shanghai 渲染（naive UTC 跨日 +8，含秒）', async () => {
    const AuditLog = (await import('../AuditLog.vue')).default
    const wrapper = mount(AuditLog, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain(SHANGHAI_DASH_FULL)
    // 直读（本地墙钟）渲染会得到 naive 原值 2026-09-14 16:30:45，不应出现
    expect(wrapper.text()).not.toContain('2026-09-14 16:30:45')
  })
})

// ── SslList：卡片 PublishStatusTag（formatPublishDateTime(published_at)） ──

describe('时间哨兵 · SslList.vue（PublishStatusTag 发布时间）', () => {
  const stubs = {
    PageHeader: { template: '<div><slot name="actions" /><slot /></div>' },
    SslFormDrawer: true,
    SslViewDrawer: true,
    SslGenerateDialog: true,
    SslCertDownloadDialog: true,
    CaCreateDialog: true,
    VersionManagementModal: true,
    PublishConfirmModal: true,
  }

  beforeEach(() => {
    responses.set('/clusters', { data: { items: [] } })
    responses.set('/ssl', {
      data: {
        items: [
          {
            id: 1,
            name: 'srv',
            cluster_id: 1,
            cert_type: 'server',
            sni: 'edge.local,api.example.com',
            cert: 'crt',
            key: 'key',
            algorithm: 'rsa',
            current_version: 5,
            published_at: NAIVE_UTC,
          },
        ],
      },
    })
  })

  it('发布时间按 Asia/Shanghai 渲染（naive UTC 跨日 +8，含秒）', async () => {
    const SslList = (await import('../SslList.vue')).default
    const wrapper = mount(SslList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const dateEl = wrapper.find('.ps-date')
    expect(dateEl.exists()).toBe(true)
    expect(dateEl.text()).toBe(SHANGHAI_SLASH_FULL)
    expect(dateEl.attributes('title')).toBe(`发布时间: ${SHANGHAI_SLASH_FULL}`)
  })
})

// ── 集群详情抽屉（2026-10-01 整改：new Date().toLocaleString 直读 → formatDateTime） ──

const DETAIL_CLUSTER = {
  id: 1,
  name: 'demo-cluster',
  display_name: '演示集群',
  group_name: '线上',
  description: '',
  status: 1,
  created_at: NAIVE_UTC,
  healthy_node_count: 1,
  node_count: 2,
  upstream_count: 3,
  route_count: 4,
  plugin_config_count: 5,
  global_rule_count: 6,
  static_resource_count: 7,
  plugin_metadata_count: 8,
  nodes: [],
}

/** 打开集群详情抽屉（modal-overlay 常驻 DOM，仅 display 切换，置 state 即可断言渲染） */
async function openDetailDrawer(vm: Record<string, unknown>) {
  vm.detailCluster = { ...DETAIL_CLUSTER }
  vm.detailVisible = true
}

describe('时间哨兵 · CentralList.vue 集群详情抽屉', () => {
  beforeEach(() => {
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }))
    localStorage.setItem('token', 'sentinel-token')
    responses.set('/clusters', { data: { items: [{ ...DETAIL_CLUSTER }], total: 1 } })
    responses.set('/clusters/1/nodes', { data: { items: [] } })
    responses.set('/relay/gateways', { data: { items: [] } })
  })

  it('创建时间按 Asia/Shanghai 渲染（naive UTC 跨日 +8，含秒）', async () => {
    const CentralList = (await import('../CentralList.vue')).default
    const wrapper = mount(CentralList, { attachTo: document.body })
    await flushPromises()
    await wrapper.vm.$nextTick()
    await openDetailDrawer(wrapper.vm as unknown as Record<string, unknown>)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain(SHANGHAI_SLASH_FULL)
    // 整改前直读会渲染 naive 本地墙钟 2026/9/14 16:30:45，不应再出现
    expect(wrapper.text()).not.toContain('2026/09/14 16:30:45')
    wrapper.unmount()
    document.body.innerHTML = ''
  })
})

describe('时间哨兵 · ClusterList.vue 集群详情抽屉', () => {
  beforeEach(() => {
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role: 'admin' }))
    localStorage.setItem('token', 'sentinel-token')
    responses.set('/clusters', { data: { items: [{ ...DETAIL_CLUSTER }], total: 1 } })
    responses.set('/relay/gateways', { data: { items: [] } })
  })

  it('创建时间按 Asia/Shanghai 渲染（naive UTC 跨日 +8，含秒）', async () => {
    const ClusterList = (await import('../ClusterList.vue')).default
    const wrapper = mount(ClusterList, { attachTo: document.body })
    await flushPromises()
    await wrapper.vm.$nextTick()
    await openDetailDrawer(wrapper.vm as unknown as Record<string, unknown>)
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain(SHANGHAI_SLASH_FULL)
    expect(wrapper.text()).not.toContain('2026/09/14 16:30:45')
    wrapper.unmount()
    document.body.innerHTML = ''
  })
})
