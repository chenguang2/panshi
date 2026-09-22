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

// 复用节点管理同款流：视图只调用 start(url, body, handlers)，测试断言 URL 与回调接线。
const streamMock = vi.hoisted(() => ({
  start: vi.fn(),
  cancel: vi.fn(),
  forceComplete: vi.fn(),
  installing: { value: false },
  error: { value: null as string | null },
  status: { value: 'idle' },
}))

vi.mock('@/composables/useInstallStream', () => ({
  useInstallStream: () => ({
    start: streamMock.start,
    cancel: streamMock.cancel,
    forceComplete: streamMock.forceComplete,
    installing: streamMock.installing,
    error: streamMock.error,
    status: streamMock.status,
    progress: { percent: 0 },
    logs: { value: [] },
  }),
}))

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
  NodeExecutionResultDrawer: {
    template: '<div class="mock-drawer" :data-visible="visible" />',
    props: [
      'visible',
      'title',
      'progress',
      'logs',
      'elapsed',
      'result',
      'highlights',
      'statistics',
      'installing',
      'streamError',
      'streamStatus',
    ],
  },
}

vi.mock('@/composables/useOverlayModal', () => ({
  showOverlayModal: (opts: { onOk?: () => Promise<void> | void }) => {
    const handle = { close: vi.fn(), update: vi.fn() }
    ;(globalThis as Record<string, unknown>).__lastOverlayOk = opts.onOk
    return handle
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

describe('RelayGateways', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    streamMock.installing.value = false
    streamMock.error.value = null
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

  async function confirmOverlay() {
    const onOk = (globalThis as Record<string, unknown>).__lastOverlayOk as () => unknown
    await onOk()
    await flushPromises()
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
      expect.objectContaining({ code: 'tianjin', name: '路局B' }),
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
    await confirmOverlay()

    expect(mockPut).toHaveBeenCalledWith('/relay/gateways/1', expect.objectContaining({ status: 'disabled' }))
  })

  it('连通性测试调用体检端点并展示分段', async () => {
    const wrapper = await mountPage()
    await flushPromises()
    const testBtn = wrapper.findAll('button').find((b) => b.text().includes('连通性测试'))!
    await testBtn.trigger('click')
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/relay/health-check?region=luju', { timeout: 180_000 })
  })

  it('初始化经确认后打开执行抽屉并启动 SSE 流', async () => {
    const wrapper = await mountPage()
    await flushPromises()

    const initBtn = wrapper.findAll('button').find((b) => b.text().includes('初始化网关'))!
    await initBtn.trigger('click')
    await flushPromises()
    await confirmOverlay()

    expect(streamMock.start).toHaveBeenCalledTimes(1)
    const [url, body, handlers] = streamMock.start.mock.calls[0]
    expect(url).toBe('/relay/gateways/1/init')
    expect(body).toEqual({})
    expect(typeof handlers.onLine).toBe('function')
    expect(typeof handlers.onComplete).toBe('function')
  })

  it('下发配置经确认后启动 push SSE 流，完成后刷新列表', async () => {
    const wrapper = await mountPage()
    await flushPromises()

    const pushBtn = wrapper.findAll('button').find((b) => b.text().includes('下发配置'))!
    await pushBtn.trigger('click')
    await flushPromises()
    await confirmOverlay()

    expect(streamMock.start).toHaveBeenCalledTimes(1)
    const [url, , handlers] = streamMock.start.mock.calls[0]
    expect(url).toBe('/relay/gateways/1/push-config')

    // 模拟流事件：日志行 + 终态（结构化事件以 JSON 字符串转发）
    handlers.onLine('TASK [写入白名单 map]')
    handlers.onLine(JSON.stringify({ rc: 0, status: 'successful', hosts_pattern: 'gateways_luju' }))
    handlers.onComplete(0, 'successful')
    await flushPromises()

    const drawers = wrapper.findAll('.mock-drawer')
    expect(drawers.length).toBe(1)
    expect(drawers[0]!.attributes('data-visible')).toBe('true')
  })

  it('执行完成后按钮文案恢复（回归：activeId/activeKind 未清空导致卡在「初始化中...」）', async () => {
    const wrapper = await mountPage()
    await flushPromises()

    const initBtn = wrapper.findAll('button').find((b) => b.text().includes('初始化网关'))!
    await initBtn.trigger('click')
    await flushPromises()
    await confirmOverlay()

    const [, , handlers] = streamMock.start.mock.calls[0]
    handlers.onComplete(0, 'successful')
    await flushPromises()

    const after = wrapper.findAll('button').find((b) => b.text().includes('初始化网关'))
    expect(after).toBeTruthy()
    expect(after!.text()).toBe('初始化网关')
    expect(after!.attributes('disabled')).toBeUndefined()
    expect(streamMock.forceComplete).toHaveBeenCalled()
  })

  it('查看配置拉取预览并渲染文件路径与内容（ansible 不可用时手工配置兜底）', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/relay/gateways') return Promise.resolve({ data: REGIONS })
      if (url === '/relay/gateways/1/config-preview') {
        return Promise.resolve({
          data: {
            region_code: 'luju',
            openresty_prefix: '/work/openresty/nginx',
            listen_port: 8443,
            files: [
              {
                path: '/work/openresty/nginx/conf/relay_8443.conf',
                content: 'listen 8443;',
                purpose: '8443 server 块',
              },
              {
                path: '/work/openresty/nginx/conf/edge_targets.conf',
                content: '"10.0.0.1:9180"',
                purpose: '节点白名单',
              },
            ],
            notes: ['手工应用：写入对应路径'],
          },
        })
      }
      return Promise.reject(new Error(`unmocked get ${url}`))
    })
    const wrapper = await mountPage()
    await flushPromises()

    const btn = wrapper.findAll('button').find((b) => b.text() === '查看配置')!
    await btn.trigger('click')
    await flushPromises()

    expect(mockGet).toHaveBeenCalledWith('/relay/gateways/1/config-preview')
    const text = wrapper.text()
    expect(text).toContain('/work/openresty/nginx/conf/relay_8443.conf')
    expect(text).toContain('listen 8443;')
    expect(text).toContain('/work/openresty/nginx/conf/edge_targets.conf')
    expect(text).toContain('手工应用：写入对应路径')
  })

  it('配置跳板转发：输入 root 密码后以 sshd 流启动，且凭据不残留', async () => {
    const wrapper = await mountPage()
    await flushPromises()

    const btn = wrapper.findAll('button').find((b) => b.text().includes('配置跳板转发'))!
    await btn.trigger('click')
    await flushPromises()

    // 模态出现，未填密码时「开始配置」禁用
    const modal = wrapper.find('.modal-overlay')
    expect(modal.exists()).toBe(true)
    const pwd = modal.find('input[type="password"]')
    expect(pwd.exists()).toBe(true)

    await pwd.setValue('s3cret')
    await flushPromises()
    const startBtn = modal.findAll('button').find((b) => b.text().includes('开始配置'))!
    await startBtn.trigger('click')
    await flushPromises()

    expect(streamMock.start).toHaveBeenCalledTimes(1)
    const [url, body] = streamMock.start.mock.calls[0]
    expect(url).toBe('/relay/gateways/1/sshd-setup')
    expect(body).toEqual({ root_user: 'root', root_password: 's3cret' })

    // 凭据不残留：再次打开模态时密码为空
    await btn.trigger('click')
    await flushPromises()
    expect((wrapper.find('.modal-overlay input[type="password"]').element as HTMLInputElement).value).toBe('')
  })

  it('删除经确认后 DELETE /relay/gateways/:id', async () => {
    mockDelete.mockResolvedValue({ data: { ok: true } })
    const wrapper = await mountPage()
    await flushPromises()

    const delBtn = wrapper.findAll('button').find((b) => b.text() === '删除')!
    await delBtn.trigger('click')
    await flushPromises()
    await confirmOverlay()

    expect(mockDelete).toHaveBeenCalledWith('/relay/gateways/1')
  })
})
