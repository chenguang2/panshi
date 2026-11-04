import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { message } from 'ant-design-vue'

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
// installing/error/status 必须是真正的 ref：视图的 streamBusy computed 依赖其响应性，
// 普通对象会在挂值后不触发重渲染（行级禁用用例 2026-11-03 实测踩坑）。
const streamMock = {
  start: vi.fn(),
  cancel: vi.fn(),
  forceComplete: vi.fn(),
  installing: ref(false),
  error: ref<string | null>(null),
  status: ref('idle'),
}

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

vi.mock('@/composables/useOverlayModal', () => ({
  showOverlayModal: (opts: { onOk?: () => Promise<void> | void; content?: unknown }) => {
    const handle = { close: vi.fn(), update: vi.fn() }
    ;(globalThis as Record<string, unknown>).__lastOverlayOk = opts.onOk
    ;(globalThis as Record<string, unknown>).__lastOverlayOpts = opts
    return handle
  },
}))

import RelayGateways from '@/views/RelayGateways.vue'

// stub props 必须用类型声明形式（Boolean）而非数组形式：数组形式下布尔 attr 会被
// 剥离，`:disabled`/`danger` 的绑定值传不到桩（本轮实测的 3 个失败用例共同根因）。
const stubs = {
  PageHeader: {
    template: '<div class="page-header" :data-desc="description || \'\'"><slot name="actions" /></div>',
    props: { title: String, description: String },
  },
  'a-table': {
    props: {
      columns: Array,
      dataSource: Array,
      loading: Boolean,
      rowKey: String,
      pagination: [Object, Boolean],
      size: String,
    },
    template: `<div class="mock-table" :data-columns="JSON.stringify(columns || [])">
      <div v-for="r in dataSource" :key="r.id" class="mock-row" :data-code="r.code">
        <span class="mock-name">{{ r.name }}</span>
        <slot name="bodyCell" :column="{ key: 'code' }" :record="r" />
        <slot name="bodyCell" :column="{ key: 'status' }" :record="r" />
        <slot name="bodyCell" :column="{ key: 'updated_at' }" :record="r" />
        <slot name="bodyCell" :column="{ key: 'actions' }" :record="r" />
      </div>
    </div>`,
  },
  'a-tag': { template: '<span><slot /></span>', props: { color: String } },
  'a-empty': { template: '<span />' },
  'a-dropdown': {
    template: '<div class="mock-dropdown"><slot /><slot name="overlay" /></div>',
    props: { trigger: Array },
  },
  'a-menu': { template: '<div class="mock-menu"><slot /></div>' },
  'a-menu-item': {
    props: { danger: Boolean, disabled: Boolean },
    template:
      '<button class="mock-menu-item" :class="{ \'mock-menu-danger\': danger, \'mock-menu-disabled\': disabled }" @click="$emit(\'click\')"><slot /></button>',
    emits: ['click'],
  },
  'a-menu-divider': { template: '<hr class="mock-menu-divider" />', props: [] },
  NodeExecutionResultDrawer: {
    template: '<div class="mock-drawer" :data-visible="visible" />',
    props: {
      visible: Boolean,
      title: String,
      progress: Object,
      logs: Array,
      elapsed: Number,
      result: Object,
      highlights: Array,
      statistics: Object,
      installing: Boolean,
      streamError: String,
      streamStatus: String,
    },
  },
}

const REGIONS = [
  {
    id: 1,
    code: 'luju',
    name: '路局A',
    http_base_url: 'http://10.10.1.1:8443',
    ssh_jump: 'tunnel@10.10.1.1:22',
    openresty_prefix: '/work/openresty/nginx',
    status: 'enabled',
    updated_at: '2026-11-03T09:12:00',
    enabled_node_count: 2,
    total_node_count: 3,
  },
  {
    id: 2,
    code: 'direct',
    name: '武清本地',
    http_base_url: null,
    ssh_jump: null,
    openresty_prefix: null,
    status: 'disabled',
    updated_at: '2026-11-03T09:14:00',
    enabled_node_count: 0,
    total_node_count: 0,
  },
]

/** 从 showOverlayModal 的 content vnode 树提取纯文本（断言弹窗文案用）。 */
function vnodeText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(vnodeText).join('')
  const v = node as { children?: unknown }
  return v.children ? vnodeText(v.children) : ''
}

// 单区域体检失败样例（首失败段摘要用）
const FAIL_RESULT = {
  region: 'luju',
  ok: false,
  segments: [
    { name: '网关HTTP腿', ok: false, error: 'connect timeout', elapsed_ms: 5000 },
    { name: 'SSH跳板', ok: true, elapsed_ms: 6 },
  ],
}

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
      if (url === '/relay/health-check') {
        return Promise.resolve({
          data: {
            regions: [
              {
                region: 'luju',
                ok: true,
                segments: [
                  { name: '网关HTTP腿', ok: true, elapsed_ms: 5 },
                  { name: 'SSH跳板', ok: true, elapsed_ms: 6 },
                ],
              },
              { region: 'direct', ok: false, segments: [{ name: '网关HTTP腿', ok: false, error: 'refused' }] },
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

    const inputs = wrapper.findAll('.modal input.form-input')
    await inputs[0]!.setValue('tianjin')
    await inputs[1]!.setValue('路局B')
    await wrapper
      .findAll('.modal button.btn-primary')
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

    const inputs = wrapper.findAll('.modal input.form-input')
    await inputs[0]!.setValue('Bad_Code')
    await inputs[1]!.setValue('x')
    mockPost.mockClear()
    await wrapper
      .findAll('.modal button.btn-primary')
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

  it('连通性测试调用体检端点并以结果弹窗替代 toast（#217 断言反转：原为 message 多行 toast）', async () => {
    const wrapper = await mountPage()
    await flushPromises()
    const testBtn = wrapper.findAll('button').find((b) => b.text().includes('连通性测试'))!
    await testBtn.trigger('click')
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/relay/health-check?region=luju', { timeout: 180_000 })

    // 结果弹窗：分段逐条 + 可复制
    const modal = wrapper.find('.modal-overlay')
    expect(modal.exists()).toBe(true)
    const text = modal.text()
    expect(text).toContain('网关HTTP腿')
    expect(text).toContain('SSH跳板')
    expect(text).toContain('复制')
    // toast 不再承载分段明细（message.success 一行为终态提示）
    const toastCalls = (message.success as ReturnType<typeof vi.fn>).mock.calls
    expect(toastCalls.length).toBeGreaterThanOrEqual(1)
    expect(toastCalls.every((c) => !String(c[0]).includes('✓ 可达'))).toBe(true)

    // 健康状态列：✓ 正常
    const row = wrapper.find('.mock-row[data-code="luju"]')
    expect(row.find('.health-state.is-ok').exists()).toBe(true)
  })

  it('首次失败段摘要：失败检测后健康列显示 ✗ 摘要 + 体检时间', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/relay/gateways') return Promise.resolve({ data: REGIONS })
      if (url === '/relay/health-check?region=luju') return Promise.resolve({ data: FAIL_RESULT })
      return Promise.reject(new Error(`unmocked get ${url}`))
    })
    const wrapper = await mountPage()
    await flushPromises()

    // period 未检测态
    expect(wrapper.find('.mock-row[data-code="luju"] .health-state.is-unknown').text()).toContain('未检测')

    const testBtn = wrapper.findAll('button').find((b) => b.text().includes('连通性测试'))!
    await testBtn.trigger('click')
    await flushPromises()

    const health = wrapper.find('.mock-row[data-code="luju"] .health-state.is-fail')
    expect(health.exists()).toBe(true)
    expect(health.text()).toContain('✗')
    expect(health.text()).toContain('网关HTTP腿')
    // tooltip 承载全部分段明细（title 挂在 .health-state 本体上）
    expect(health.attributes('title')).toContain('connect timeout')
    // 体检时间
    expect(wrapper.find('.mock-row[data-code="luju"] .health-time').text()).toMatch(/^\d{4}\//)
  })

  it('全量体检：页头按钮无参调用 check_all，结果弹窗按区域分组', async () => {
    const wrapper = await mountPage()
    await flushPromises()
    mockGet.mockClear()

    const checkAllBtn = wrapper.findAll('button').find((b) => b.text().includes('全量体检'))!
    await checkAllBtn.trigger('click')
    await flushPromises()

    expect(mockGet).toHaveBeenCalledWith('/relay/health-check', { timeout: 180_000 })
    const modal = wrapper.find('.modal-overlay')
    expect(modal.exists()).toBe(true)
    expect(modal.text()).toContain('路局A')
    expect(modal.text()).toContain('武清本地')
    // 各区域行的健康态与体检时间逐一更新
    expect(wrapper.find('.mock-row[data-code="luju"] .health-state.is-ok').exists()).toBe(true)
    expect(wrapper.find('.mock-row[data-code="direct"] .health-state.is-fail').exists()).toBe(true)
  })

  it('全量体检期间关闭弹窗不中断探测：完成后健康列仍更新且不再弹回', async () => {
    let resolveCheck!: (v: unknown) => void
    mockGet.mockImplementation((url: string) => {
      if (url === '/relay/gateways') return Promise.resolve({ data: REGIONS })
      if (url === '/relay/health-check') {
        return new Promise((resolve) => {
          resolveCheck = resolve
        })
      }
      return Promise.reject(new Error(`unmocked get ${url}`))
    })
    const wrapper = await mountPage()
    await flushPromises()

    const checkAllBtn = wrapper.findAll('button').find((b) => b.text().includes('全量体检'))!
    await checkAllBtn.trigger('click')
    await flushPromises()

    // 弹窗已打开（探测进行中），用户关闭
    expect(wrapper.find('.modal-overlay').exists()).toBe(true)
    await wrapper.find('.modal-overlay .modal-close').trigger('click')
    await flushPromises()
    expect(wrapper.find('.modal-overlay').exists()).toBe(false)

    // 探测完成：状态列仍更新 + 终态一行 message，弹窗不再弹回
    resolveCheck({
      data: {
        regions: [
          { region: 'luju', ok: true, segments: [{ name: '网关HTTP腿', ok: true }] },
          { region: 'direct', ok: true, segments: [{ name: '网关HTTP腿', ok: true }] },
        ],
      },
    })
    await flushPromises()

    expect(wrapper.find('.modal-overlay').exists()).toBe(false)
    expect(wrapper.find('.mock-row[data-code="luju"] .health-state.is-ok').exists()).toBe(true)
    expect(wrapper.find('.mock-row[data-code="direct"] .health-state.is-ok').exists()).toBe(true)
    expect(message.warning).not.toHaveBeenCalled()
  })

  it('体检结果弹窗复制按钮写入分段明细文本', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    })
    const wrapper = await mountPage()
    await flushPromises()
    const testBtn = wrapper.findAll('button').find((b) => b.text().includes('连通性测试'))!
    await testBtn.trigger('click')
    await flushPromises()

    const copyBtn = wrapper
      .find('.modal-overlay')
      .findAll('button')
      .find((b) => b.text().includes('复制'))!
    await copyBtn.trigger('click')
    await flushPromises()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((navigator as any).clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('网关HTTP腿'))
  })

  it('新建：展示名缺失 inline 提示而非 toast', async () => {
    const wrapper = await mountPage()
    const buttons = wrapper.findAll('button')
    await buttons.find((b) => b.text().includes('新建区域'))!.trigger('click')
    await flushPromises()

    const inputs = wrapper.findAll('.modal input.form-input')
    await inputs[0]!.setValue('tianjin')
    mockPost.mockClear()
    await wrapper
      .findAll('.modal button.btn-primary')
      .find((b) => b.text().includes('保存'))!
      .trigger('click')
    await flushPromises()

    expect(mockPost).not.toHaveBeenCalled()
    expect(message.error).not.toHaveBeenCalled()
    const errors = wrapper.findAll('.modal .form-error')
    expect(errors.some((e) => e.text().includes('展示名'))).toBe(true)
  })

  it('新建：三个路由字段 inline 格式校验拦截坏值（不发请求）', async () => {
    const cases: [string, string, string][] = [
      ['http_base_url', '10.10.1.1:8443', '网关 HTTP 腿'],
      ['http_base_url', 'http://10.10.1.1:8443/api', '网关 HTTP 腿'],
      ['ssh_jump', '10.10.1.1:22', 'SSH 跳板'],
      ['openresty_prefix', 'work/openresty', 'OpenResty 前缀'],
    ]
    for (const [field, badValue, errKeyword] of cases) {
      const wrapper = await mountPage()
      const buttons = wrapper.findAll('button')
      await buttons.find((b) => b.text().includes('新建区域'))!.trigger('click')
      await flushPromises()

      const inputs = wrapper.findAll('.modal input.form-input')
      await inputs[0]!.setValue('tianjin')
      await inputs[1]!.setValue('路局B')
      // inputs: code, name, http_base_url, ssh_jump, openresty_prefix
      const idx = field === 'http_base_url' ? 2 : field === 'ssh_jump' ? 3 : 4
      await inputs[idx]!.setValue(badValue)
      mockPost.mockClear()
      await wrapper
        .findAll('.modal button.btn-primary')
        .find((b) => b.text().includes('保存'))!
        .trigger('click')
      await flushPromises()

      expect(mockPost).not.toHaveBeenCalled()
      const errors = wrapper.findAll('.modal .form-error')
      expect(errors.some((e) => e.text().includes(errKeyword))).toBe(true)
    }
  })

  it('ssh_jump 端口可省略：tunnel@10.10.1.1 通过前端校验并提交', async () => {
    mockPost.mockResolvedValue({ data: { id: 3 } })
    const wrapper = await mountPage()
    const buttons = wrapper.findAll('button')
    await buttons.find((b) => b.text().includes('新建区域'))!.trigger('click')
    await flushPromises()

    const inputs = wrapper.findAll('.modal input.form-input')
    await inputs[0]!.setValue('tianjin')
    await inputs[1]!.setValue('路局B')
    await inputs[3]!.setValue('tunnel@10.10.1.1')
    await wrapper
      .findAll('.modal button.btn-primary')
      .find((b) => b.text().includes('保存'))!
      .trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalled()
  })

  it('页头描述精简为一句话', async () => {
    const wrapper = await mountPage()
    const desc = wrapper.find('.page-header').attributes('data-desc') || ''
    expect(desc).toContain('维护各局中继网关注册信息')
    expect(desc.length).toBeLessThan(120)
  })

  it('空态追加三步引导文案', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/relay/gateways') return Promise.resolve({ data: [] })
      return Promise.reject(new Error(`unmocked get ${url}`))
    })
    const wrapper = await mountPage()
    const hint = wrapper.text()
    expect(hint).toContain('暂无区域')
    expect(hint).toContain('新建区域')
    expect(hint).toContain('初始化网关')
    expect(hint).toContain('下发配置')
  })

  it('禁用确认文案直述后果', async () => {
    const wrapper = await mountPage()
    await flushPromises()
    const toggleBtn = wrapper.findAll('button').find((b) => b.text() === '禁用')!
    await toggleBtn.trigger('click')
    await flushPromises()
    const opts = (globalThis as Record<string, unknown>).__lastOverlayOpts as { content: { children: string } }
    const contentText = String(opts.content.children)
    expect(contentText).toContain('不再经网关中转')
    expect(contentText).not.toContain('直连通常不可达，操作会失败并附提示')
  })

  it('sshd 弹窗补 PermitOpen 降级说明', async () => {
    const wrapper = await mountPage()
    await flushPromises()
    const btn = wrapper.findAll('button').find((b) => b.text().includes('配置跳板转发'))!
    await btn.trigger('click')
    await flushPromises()
    expect(wrapper.find('.modal-overlay').text()).toContain('降级')
  })

  it('低频操作收纳进「更多」下拉：行内仅 3 项 + 更多，删除红色置底', async () => {
    const wrapper = await mountPage()
    await flushPromises()
    const row = wrapper.find('.mock-row[data-code="luju"]')
    const rowButtons = row.findAll('.table-actions > button')
    const texts = rowButtons.map((b) => b.text())
    expect(texts).toEqual(['编辑', '连通性测试', '下发配置'])
    expect(row.find('.mock-dropdown > button:not(.mock-menu-item)').text()).toBe('更多 ▾')

    const items = row.findAll('.mock-menu-item')
    const itemTexts = items.map((b) => b.text().trim())
    expect(itemTexts).toContain('初始化网关')
    expect(itemTexts).toContain('配置跳板转发')
    expect(itemTexts).toContain('查看配置')
    expect(itemTexts).toContain('禁用')
    const last = items[items.length - 1]!
    expect(last.text().trim()).toBe('删除')
    expect(last.classes()).toContain('mock-menu-danger')
  })

  it('执行中行级禁用：执行行整体禁用；其他行非流式可用、流式禁用', async () => {
    const wrapper = await mountPage()
    await flushPromises()

    const pushBtn = wrapper.findAll('button').find((b) => b.text().includes('下发配置'))!
    await pushBtn.trigger('click')
    await flushPromises()
    await confirmOverlay()
    streamMock.installing.value = true
    await flushPromises()

    const execRow = wrapper.find('.mock-row[data-code="luju"]')
    const otherRow = wrapper.find('.mock-row[data-code="direct"]')

    // 执行行（luju）：整行禁用，下发按钮文案带进度
    // 注意 disabled 属性存在时 attributes 返回 ""（falsy），须判 undefined 而非 Boolean(x)
    expect(
      execRow
        .findAll('.table-actions > button, .mock-dropdown > button:not(.mock-menu-item)')
        .map((b) => b.attributes('disabled'))
        .every((d) => d !== undefined),
    ).toBe(true)
    expect(
      execRow
        .findAll('button')
        .find((b) => b.text().includes('下发中…'))
        ?.attributes('disabled'),
    ).toBeDefined()
    // 执行中的更多项整体为禁用态
    const execMenu = execRow.findAll('.mock-menu-item')
    expect(execMenu.every((i) => i.classes().includes('mock-menu-disabled'))).toBe(true)

    // 其他行（direct）：非流式操作可用（启用/查看配置等），流式操作禁用
    const otherMenu = otherRow.findAll('.mock-menu-item')
    const otherBy = (t: string) => otherMenu.find((i) => i.text().trim() === t)!
    expect(otherBy('初始化网关').classes()).toContain('mock-menu-disabled')
    expect(otherBy('配置跳板转发').classes()).toContain('mock-menu-disabled')
    expect(otherBy('启用').classes()).not.toContain('mock-menu-disabled')
    expect(otherBy('查看配置').classes()).not.toContain('mock-menu-disabled')
  })

  it('动作列宽 240 且提供更新时间列', async () => {
    const wrapper = await mountPage()
    const cols = JSON.parse(wrapper.find('.mock-table').attributes('data-columns') || '[]') as {
      key: string
      width?: number
    }[]
    expect(cols.some((c) => c.key === 'updated_at')).toBe(true)
    const actions = cols.find((c) => c.key === 'actions')!
    expect(actions.width).toBe(240)
    expect(wrapper.text()).toContain('2026/11/03')
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

    // 确认弹窗展示本次白名单规模（openspec: relay-push-empty-whitelist-guard D6）
    const opts = (globalThis as Record<string, unknown>).__lastOverlayOpts as {
      content: unknown
      okText: string
    }
    expect(vnodeText(opts.content)).toContain(
      '本次将下发 2 个启用节点（共 3 个节点；全量替换，未启用的节点将从白名单移除）',
    )
    expect(opts.okText).toBe('开始下发')

    await confirmOverlay()

    expect(streamMock.start).toHaveBeenCalledTimes(1)
    const [url, body, handlers] = streamMock.start.mock.calls[0]
    expect(url).toBe('/relay/gateways/1/push-config')
    expect(body).toEqual({})

    // 模拟流事件：日志行 + 终态（结构化事件以 JSON 字符串转发）
    handlers.onLine('TASK [写入白名单 map]')
    handlers.onLine(JSON.stringify({ rc: 0, status: 'successful', hosts_pattern: 'gateways_luju' }))
    handlers.onComplete(0, 'successful')
    await flushPromises()

    const drawers = wrapper.findAll('.mock-drawer')
    expect(drawers.length).toBe(1)
    expect(drawers[0]!.attributes('data-visible')).toBe('true')
  })

  it('零启用节点时危险确认并显式携带 allow_empty 下发', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/relay/gateways') {
        return Promise.resolve({
          data: [{ ...REGIONS[0], enabled_node_count: 0, total_node_count: 4 }],
        })
      }
      return Promise.reject(new Error(`unmocked get ${url}`))
    })
    const wrapper = await mountPage()

    const pushBtn = wrapper.findAll('button').find((b) => b.text().includes('下发配置'))!
    await pushBtn.trigger('click')
    await flushPromises()

    const opts = (globalThis as Record<string, unknown>).__lastOverlayOpts as {
      content: unknown
      okText: string
      okDanger?: boolean
    }
    expect(opts.okText).toBe('仍要下发（白名单为空）')
    expect(opts.okDanger).toBe(true)
    const text = vnodeText(opts.content)
    expect(text).toContain('该区域当前没有启用节点')
    expect(text).toContain('白名单清空')
    expect(text).toContain('403')
    expect(text).toContain('将节点状态改为「启用」')

    await confirmOverlay()

    expect(streamMock.start).toHaveBeenCalledTimes(1)
    const [url, body] = streamMock.start.mock.calls[0]
    expect(url).toBe('/relay/gateways/1/push-config')
    expect(body).toEqual({ allow_empty: true })
  })

  // ── 下发漂移预览（openspec: relay-push-drift-preview） ─────────
  async function openPushDialog(overrides: Record<string, unknown>) {
    mockGet.mockImplementation((url: string) => {
      if (url === '/relay/gateways') {
        return Promise.resolve({ data: [{ ...REGIONS[0], ...overrides }] })
      }
      return Promise.reject(new Error(`unmocked get ${url}`))
    })
    const wrapper = await mountPage()
    const pushBtn = wrapper.findAll('button').find((b) => b.text().includes('下发配置'))!
    await pushBtn.trigger('click')
    await flushPromises()
    return (globalThis as Record<string, unknown>).__lastOverlayOpts as {
      content: unknown
      okText: string
    }
  }

  it('下发漂移：将移除节点时警示并改确认文案', async () => {
    const opts = await openPushDialog({
      enabled_node_count: 3,
      total_node_count: 3,
      last_pushed_at: '2026-11-04T09:00:00',
      push_drift: { added: [], removed: ['10.99.9.9:9999'] },
    })
    const text = vnodeText(opts.content)
    // last_pushed_at 为 naive UTC（#26），formatDateTime 按 Asia/Shanghai 展示 → +8h
    expect(text).toContain('与上次成功下发（2026/11/04 17:00:00）相比，本次将移除 1 个节点：10.99.9.9:9999。')
    expect(opts.okText).toBe('开始下发（将移除 1 个节点）')
  })

  it('下发漂移：仅新增时灰字提示，确认文案不变', async () => {
    const opts = await openPushDialog({
      enabled_node_count: 3,
      total_node_count: 3,
      last_pushed_at: '2026-11-04T09:00:00',
      push_drift: { added: ['10.20.0.1:9180'], removed: [] },
    })
    const text = vnodeText(opts.content)
    expect(text).toContain('较上次成功下发将新增 1 个节点：10.20.0.1:9180。')
    expect(text).not.toContain('将移除')
    expect(opts.okText).toBe('开始下发')
  })

  it('下发漂移：无快照提示首次写入', async () => {
    const opts = await openPushDialog({})
    const text = vnodeText(opts.content)
    expect(text).toContain('该区域尚无成功下发记录，本次为首次写入白名单。')
    expect(opts.okText).toBe('开始下发')
  })

  it('下发漂移：与上次一致不加提示行', async () => {
    const opts = await openPushDialog({
      enabled_node_count: 2,
      total_node_count: 3,
      last_pushed_at: '2026-11-04T09:00:00',
      push_drift: { added: [], removed: [] },
    })
    const text = vnodeText(opts.content)
    expect(text).not.toContain('上次成功下发')
    expect(text).not.toContain('首次写入白名单')
    expect(opts.okText).toBe('开始下发')
  })

  it('下发漂移：移除清单超过 10 个时截断标注总数', async () => {
    const removed = Array.from({ length: 12 }, (_, i) => `10.90.0.${i}:9180`)
    const opts = await openPushDialog({
      enabled_node_count: 3,
      total_node_count: 3,
      last_pushed_at: '2026-11-04T09:00:00',
      push_drift: { added: [], removed },
    })
    const text = vnodeText(opts.content)
    expect(text).toContain('本次将移除 12 个节点：')
    expect(text).toContain('10.90.0.9:9180 等。')
    expect(text).not.toContain('10.90.0.10:9180')
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
