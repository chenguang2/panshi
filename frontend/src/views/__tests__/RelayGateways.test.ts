import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
const mockDelete = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}))

vi.mock('ant-design-vue', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ant-design-vue')>()
  return { ...actual, message: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }
})

const stubs = {
  PageHeader: {
    template: '<div class="page-header"><slot name="actions" /></div>',
    props: ['title', 'description'],
  },
  'a-table': {
    props: ['columns', 'dataSource', 'loading', 'rowKey', 'pagination', 'size'],
    template: `<div class="mock-table">
      <div v-for="r in dataSource" :key="r.id" class="mock-row" :data-code="r.code">
        <span class="mock-name">{{ r.name }}</span>
        <slot name="bodyCell" :column="{ key: 'actions' }" :record="r" />
        <slot name="bodyCell" :column="{ key: 'code' }" :record="r" />
      </div>
    </div>`,
  },
  'a-tag': { template: '<span><slot /></span>', props: ['color'] },
  'a-empty': { template: '<span />' },
}

vi.mock('@/composables/useOverlayModal', () => ({
  showOverlayModal: (opts: { onOk?: () => Promise<void> | void }) => {
    ;(globalThis as Record<string, unknown>).__lastOverlayOk = opts.onOk
    return { close: vi.fn() }
  },
}))

import RelayGateways from '@/views/RelayGateways.vue'

const REGIONS = [
  {
    id: 1,
    code: 'luju',
    name: '路局A',
    http_base_url: 'http://10.10.1.1:8443',
    ssh_jump: 'tunnel@10.10.1.1:22',
    openresty_prefix: '/work/openresty/nginx',
    status: 'enabled',
  },
  {
    id: 2,
    code: 'direct',
    name: '武清本地',
    http_base_url: null,
    ssh_jump: null,
    openresty_prefix: null,
    status: 'disabled',
  },
]

function urlOf(args: unknown[]): string {
  return String(args[0] ?? '')
}

describe('RelayGateways', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // URL 感知 mock（约定 #43）：列表/体检走 get
    mockGet.mockImplementation((url: string) => {
      if (url === '/relay/gateways') return Promise.resolve({ data: REGIONS })
      if (url === '/relay/health-check?region=luju') {
        return Promise.resolve({
          data: {
            region: 'luju',
            ok: true,
            segments: [
              { name: '网关HTTP腿', ok: true, elapsed_ms: 5 },
              { name: 'SSH跳板', ok: true, elapsed_ms: 6 },
              { name: '抽样节点两腿', ok: true, elapsed_ms: 9 },
            ],
          },
        })
      }
      return Promise.reject(new Error(`unmocked get ${url}`))
    })
  })

  async function mountPage() {
    const wrapper = mount(RelayGateways, { global: { plugins: [createPinia()], stubs } })
    await flushPromises()
    return wrapper
  }

  it('加载并渲染区域列表', async () => {
    const wrapper = await mountPage()
    const html = wrapper.text()
    expect(html).toContain('luju')
    expect(html).toContain('路局A')
    expect(html).toContain('武清本地')
  })

  it('新建区域提交 POST /relay/gateways', async () => {
    mockPost.mockResolvedValue({ data: { id: 3, code: 'tianjin', name: '路局B', status: 'enabled' } })
    const wrapper = await mountPage()
    const buttons = wrapper.findAll('button')
    await buttons.find((b) => b.text().includes('新建区域'))!.trigger('click')
    await flushPromises()

    const inputs = wrapper.findAll('.modal-card input.form-input')
    await inputs[0]!.setValue('tianjin')
    await inputs[1]!.setValue('路局B')
    await wrapper
      .findAll('.modal-card button.btn-primary')
      .find((b) => b.text().includes('保存'))!
      .trigger('click')
    await flushPromises()

    expect(mockPost).toHaveBeenCalledWith(
      '/relay/gateways',
      expect.objectContaining({
        code: 'tianjin',
        name: '路局B',
      }),
    )
  })

  it('新建区域非法 code 被前端拦截（不发请求）', async () => {
    const wrapper = await mountPage()
    const buttons = wrapper.findAll('button')
    await buttons.find((b) => b.text().includes('新建区域'))!.trigger('click')
    await flushPromises()

    const inputs = wrapper.findAll('.modal-card input.form-input')
    await inputs[0]!.setValue('Bad_Code')
    await inputs[1]!.setValue('x')
    mockPost.mockClear()
    await wrapper
      .findAll('.modal-card button.btn-primary')
      .find((b) => b.text().includes('保存'))!
      .trigger('click')
    await flushPromises()
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('禁用区域经确认后 PUT status', async () => {
    mockPut.mockResolvedValue({ data: { ...REGIONS[0], status: 'disabled' } })
    const wrapper = await mountPage()
    await flushPromises()

    const toggleBtn = wrapper.findAll('button').find((b) => b.text() === '禁用')!
    expect(toggleBtn).toBeTruthy()
    await toggleBtn.trigger('click')
    await flushPromises()

    const onOk = (globalThis as Record<string, unknown>).__lastOverlayOk as () => Promise<void>
    await onOk()
    await flushPromises()

    expect(mockPut).toHaveBeenCalledWith('/relay/gateways/1', expect.objectContaining({ status: 'disabled' }))
  })

  it('连通性测试调用体检端点并展示分段', async () => {
    const wrapper = await mountPage()
    await flushPromises()
    const testBtn = wrapper.findAll('button').find((b) => b.text().includes('连通性测试'))!
    await testBtn.trigger('click')
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/relay/health-check?region=luju')
  })

  it('下发配置经确认后 POST push-config', async () => {
    mockPost.mockImplementation((url: string) => {
      if (url === '/relay/gateways/1/push-config') {
        return Promise.resolve({ data: { ok: true, region: 'luju', hosts_pattern: 'gateways_luju' } })
      }
      return Promise.reject(new Error(`unmocked post ${url}`))
    })
    const wrapper = await mountPage()
    await flushPromises()

    const pushBtn = wrapper.findAll('button').find((b) => b.text().includes('下发配置'))!
    await pushBtn.trigger('click')
    await flushPromises()

    const onOk = (globalThis as Record<string, unknown>).__lastOverlayOk as () => Promise<void>
    await onOk()
    await flushPromises()

    expect(mockPost).toHaveBeenCalledWith('/relay/gateways/1/push-config')
  })

  it('初始化网关经确认后 POST init', async () => {
    mockPost.mockImplementation((url: string) => {
      if (url === '/relay/gateways/1/init') {
        return Promise.resolve({
          data: { ok: true, region: 'luju', hosts_pattern: 'gateways_luju', listen_port: 8443 },
        })
      }
      return Promise.reject(new Error(`unmocked post ${url}`))
    })
    const wrapper = await mountPage()
    await flushPromises()

    const initBtn = wrapper.findAll('button').find((b) => b.text().includes('初始化网关'))!
    await initBtn.trigger('click')
    await flushPromises()

    const onOk = (globalThis as Record<string, unknown>).__lastOverlayOk as () => Promise<void>
    await onOk()
    await flushPromises()

    expect(mockPost).toHaveBeenCalledWith('/relay/gateways/1/init')
  })

  it('删除经确认后 DELETE /relay/gateways/:id', async () => {
    mockDelete.mockResolvedValue({ data: { ok: true } })
    const wrapper = await mountPage()
    await flushPromises()

    const delBtn = wrapper.findAll('button').find((b) => b.text() === '删除')!
    await delBtn.trigger('click')
    await flushPromises()

    const onOk = (globalThis as Record<string, unknown>).__lastOverlayOk as () => Promise<void>
    await onOk()
    await flushPromises()

    expect(mockDelete).toHaveBeenCalledWith('/relay/gateways/1')
  })
})
