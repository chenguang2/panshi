import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { ref } from 'vue'
import { message } from 'ant-design-vue'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
const mockDelete = vi.fn()
const mockRouterPush = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  },
}))

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return { ...actual, useRouter: () => ({ push: (...args: unknown[]) => mockRouterPush(...args) }) }
})

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
    // 动态按 columns 渲染 bodyCell（relay-gateways-ux-redesign 列结构变更后不再硬编码 key 集）
    template: `<div class="mock-table" :data-columns="JSON.stringify(columns || [])">
      <div v-for="r in dataSource" :key="r.id" class="mock-row" :data-code="r.code">
        <span class="mock-name">{{ r.name }}</span>
        <slot v-for="c in columns || []" :key="c.key" name="bodyCell" :column="c" :record="r" />
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
    attached_cluster_count: 1,
    enabled_node_count: 0,
    total_node_count: 0,
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
    // 写操作默认成功（批次三 popover 保存链路默认路径；个别用例自行覆盖）
    mockPut.mockResolvedValue({ data: {} })
    mockPost.mockResolvedValue({ data: {} })
    // URL 感知 mock（约定 #43）：列表/体检/凭据单查走 get
    mockGet.mockImplementation((url: string) => {
      if (url === '/relay/gateways') return Promise.resolve({ data: REGIONS })
      if (/\/relay\/gateways\/\d+\/credential$/.test(url)) {
        return Promise.resolve({ data: { ssh_password: 'edit-fetched-pass' } })
      }
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

  /** 打开既有「新建区域」弹窗：批次三后页头「+ 新建区域」改走图内草稿卡（3.7），
   * 旧弹窗的生产入口为悬空卡「注册该区域」（openCreate），旧弹窗用例经此进入。 */
  async function mountPageAndOpenLegacyModal() {
    mockWithTopology()
    const wrapper = await mountPage()
    await wrapper.find('.orphan-card button').trigger('click')
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
    const wrapper = await mountPageAndOpenLegacyModal()

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

  it('创建载荷 SSH 字段留空（收集推迟到登记两腿；2026-11-10 新建弹窗化后仅 2 必填）', async () => {
    mockPost.mockResolvedValue({ data: { id: 3, code: 'tianjin', name: '路局B', status: 'enabled' } })
    const wrapper = await mountPageAndOpenLegacyModal()

    const inputs = wrapper.findAll('.modal input.form-input')
    expect(inputs.length, '新建模式仅 code+name 两个输入（两腿/SSH 段隐藏）').toBe(2)
    await inputs[0]!.setValue('tianjin')
    await inputs[1]!.setValue('路局B')
    await wrapper
      .findAll('.modal button.btn-primary')
      .find((b) => b.text().includes('保存'))!
      .trigger('click')
    await flushPromises()

    expect(mockPost).toHaveBeenCalledWith(
      '/relay/gateways',
      expect.objectContaining({
        code: 'tianjin',
        ssh_user: '',
        ssh_password: null,
        ssh_port: 22,
      }),
    )
  })

  // 编辑模式助手：打开指定区域行的「编辑」弹窗（新建模式已无 SSH 字段，编辑语义用例走此入口）
  async function openEditModal(wrapper: ReturnType<typeof mount>, code = 'luju') {
    const row = wrapper.find(`.mock-row[data-code="${code}"]`)
    const editBtn = row.findAll('.mock-menu-item').find((b) => b.text().startsWith('编辑'))!
    await editBtn.trigger('click')
    await flushPromises()
  }

  it('SSH 用户必填：未填被前端拦截（口令不入列表，编辑按需单查；新建模式该字段隐藏）', async () => {
    const wrapper = await mountPage()
    await flushPromises()
    await openEditModal(wrapper)
    mockPut.mockClear()

    const sshUser = wrapper
      .findAll('.modal input.form-input')
      .find((i) => (i.attributes('placeholder') || '').includes('网关机上的账号'))!
    await sshUser.setValue('')
    await wrapper
      .findAll('.modal button.btn-primary')
      .find((b) => b.text().includes('保存'))!
      .trigger('click')
    await flushPromises()

    expect(mockPut).not.toHaveBeenCalled()
    const errors = wrapper.findAll('.modal .form-error')
    expect(errors.some((e) => e.text().includes('SSH 用户'))).toBe(true)
  })

  it('说明卡：结论句 + 三步走 + 动作对照表折叠（relay-gateways-ux-redesign）', async () => {
    const wrapper = await mountPage()
    const text = wrapper.text()
    expect(text).toContain('哪些局需要建中继区域')
    expect(text).toContain('登记区域')
    expect(text).toContain('初始化网关')
    expect(text).toContain('下发配置')
    // 对照表独立卡默认展开（示例页形态）
    const guide = wrapper.find('.relay-guide')
    expect(guide.exists()).toBe(true)
    expect((guide.element as HTMLDetailsElement).open).toBe(true)
    expect(guide.text()).toContain('何时用哪个')
  })

  it('直连语义降级为提示：分组说明含直连文案，不再有分段选择（编辑模式断言；用户新建模式两腿段隐藏）', async () => {
    const wrapper = await mountPage()
    await flushPromises()
    await openEditModal(wrapper, 'direct')

    expect(wrapper.find('.segment-control').exists()).toBe(false)
    const desc = wrapper.findAll('.modal .form-section-desc')[1]! // 组2 网关两腿连接
    expect(desc.text()).toContain('两腿均留空会成为「直连区域」')
    // 两腿输入保持可用（无禁用联动）
    const http = wrapper.findAll('.modal input.form-input').find((i) => i.attributes('placeholder')?.includes('8443'))!
    expect(http.attributes('disabled')).toBeUndefined()
  })

  it('编辑存量直连区域：两腿为空且可编辑，表格保留直连徽章', async () => {
    const wrapper = await mountPage()
    await flushPromises()
    const row = wrapper.find('.mock-row[data-code="direct"]')
    expect(row.text()).toContain('直连 · 无网关机')

    const editBtn = row.findAll('.mock-menu-item').find((b) => b.text().startsWith('编辑'))!
    await editBtn.trigger('click')
    await flushPromises()
    const http = wrapper.findAll('.modal input.form-input').find((i) => i.attributes('placeholder')?.includes('8443'))!
    expect((http.element as HTMLInputElement).value).toBe('')
    expect(http.attributes('disabled')).toBeUndefined()
  })

  it('有网关机模式但两腿全空保存：一次性 info 提示（等价直连；编辑模式）', async () => {
    const wrapper = await mountPage()
    await flushPromises()
    await openEditModal(wrapper, 'luju')
    // 清空两腿
    const http = wrapper.findAll('.modal input.form-input').find((i) => i.attributes('placeholder')?.includes('8443'))!
    await http.setValue('')
    const jump = wrapper
      .findAll('.modal input.form-input')
      .find((i) => (i.attributes('placeholder') || '').includes('tunnel@10.10.1.1:22'))!
    await jump.setValue('')
    // fixture 无 ssh_user：编辑校验要求必填，先补上再触发两腿全空分支
    const sshUser = wrapper
      .findAll('.modal input.form-input')
      .find((i) => (i.attributes('placeholder') || '').includes('网关机上的账号'))!
    await sshUser.setValue('jboss')
    await wrapper
      .findAll('.modal button.btn-primary')
      .find((b) => b.text().includes('保存'))!
      .trigger('click')
    await flushPromises()
    expect(message.info).toHaveBeenCalledWith('两腿均为空，将按直连区域保存')
    expect(mockPut).toHaveBeenCalledWith(
      expect.stringMatching(/\/relay\/gateways\/\d+$/),
      expect.objectContaining({ http_base_url: null, ssh_jump: null }),
    )
  })

  it('编辑网关：口令按需单查并回填密码框（列表不回传口令）', async () => {
    const wrapper = await mountPage()
    await flushPromises()
    mockGet.mockClear()
    mockPut.mockResolvedValue({ data: { id: 1 } })
    const buttons = wrapper.findAll('button')
    await buttons.find((b) => b.text().includes('编辑'))!.trigger('click')
    await flushPromises()

    expect(mockGet).toHaveBeenCalledWith(expect.stringMatching(/\/relay\/gateways\/\d+\/credential$/))
    const pwd = wrapper.findAll('.modal input.form-input').find((i) => (i.attributes('type') || '') === 'password')
    expect((pwd!.element as HTMLInputElement).value).toBe('edit-fetched-pass')
  })

  it('删除保护：挂接区域删除菜单禁用并提示解挂（attached_cluster_count）', async () => {
    const wrapper = await mountPage()
    await flushPromises()
    const row = wrapper.find('.mock-row[data-code="luju"]')
    const del = row.findAll('.mock-menu-item').find((b) => b.text().startsWith('删除'))!
    expect(del.classes()).toContain('mock-menu-disabled')
    expect(del.text()).toContain('已被 1 个集群挂接')
    // 无挂接区域（direct）保持可点
    const del2 = wrapper
      .find('.mock-row[data-code="direct"]')
      .findAll('.mock-menu-item')
      .find((b) => b.text().startsWith('删除'))!
    expect(del2.classes()).not.toContain('mock-menu-disabled')
  })

  it('查看凭据：菜单项打开弹窗单查口令（不出列表，可复制）', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/relay/gateways') return Promise.resolve({ data: REGIONS })
      if (/\/relay\/gateways\/\d+\/credential$/.test(url))
        return Promise.resolve({ data: { ssh_password: 'secret-pass' } })
      if (url === '/relay/health-check?region=luju') {
        return Promise.resolve({
          data: { region: 'luju', ok: true, segments: [{ name: '网关HTTP腿', ok: true, elapsed_ms: 5 }] },
        })
      }
      return Promise.reject(new Error('unknown url: ' + url))
    })
    const wrapper = await mountPage()
    await flushPromises()
    const row = wrapper.find('.mock-row[data-code="luju"]')
    const credBtn = row.findAll('.mock-menu-item').find((b) => b.text().startsWith('查看凭据'))!
    expect(credBtn).toBeTruthy()
    await credBtn.trigger('click')
    await flushPromises()

    expect(mockGet).toHaveBeenCalledWith(expect.stringMatching(/\/relay\/gateways\/1\/credential$/))
    const text = wrapper.text()
    expect(text).toContain('查看凭据 — 路局A')
    expect(text).toContain('secret-pass')
    expect(text).toContain('已记录审计日志')
  })

  it('查看凭据：未设置口令显示密钥认证提示', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/relay/gateways') return Promise.resolve({ data: REGIONS })
      if (/\/relay\/gateways\/\d+\/credential$/.test(url)) return Promise.resolve({ data: { ssh_password: null } })
      if (url === '/relay/health-check?region=luju') {
        return Promise.resolve({
          data: { region: 'luju', ok: true, segments: [{ name: '网关HTTP腿', ok: true, elapsed_ms: 5 }] },
        })
      }
      return Promise.reject(new Error('unknown url: ' + url))
    })
    const wrapper = await mountPage()
    await flushPromises()
    const row = wrapper.find('.mock-row[data-code="luju"]')
    await row
      .findAll('.mock-menu-item')
      .find((b) => b.text().startsWith('查看凭据'))!
      .trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('未设置口令（密钥认证）')
  })

  it('新建区域非法 code 被前端拦截（不发请求）', async () => {
    const wrapper = await mountPageAndOpenLegacyModal()

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

    const toggleBtn = wrapper.findAll('.mock-menu-item').find((b) => b.text().startsWith('禁用'))!
    expect(toggleBtn).toBeTruthy()
    await toggleBtn.trigger('click')
    await flushPromises()
    await confirmOverlay()

    expect(mockPut).toHaveBeenCalledWith('/relay/gateways/1', expect.objectContaining({ status: 'disabled' }))
  })

  it('连通性测试调用体检端点并以结果弹窗替代 toast（#217 断言反转：原为 message 多行 toast）', async () => {
    const wrapper = await mountPage()
    await flushPromises()
    const testBtn = wrapper.findAll('button').find((b) => b.text().trim() === '测试')!
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

    const testBtn = wrapper.findAll('button').find((b) => b.text().trim() === '测试')!
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

    // 先弹确认框（2026-11-10：全量体检不再静默直接执行），点「开始体检」才探测
    // popover Teleport 到 body，须用 document.body 查找（同 popEl 助手）
    const confirmPop = document.body.querySelector('.topo-pop')
    expect(confirmPop, '全量体检应先弹确认框').toBeTruthy()
    expect(confirmPop!.textContent).toContain('只读探测')
    const primary = Array.from(confirmPop!.querySelectorAll('button')).find((b) => b.textContent!.trim() === '开始体检')!
    primary!.click()
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

    // 确认框先行，点「开始体检」启动探测（popover Teleport 到 body）
    const primary = Array.from(document.body.querySelectorAll('.topo-pop button')).find(
      (b) => b.textContent!.trim() === '开始体检',
    )!
    primary.click()
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
    const testBtn = wrapper.findAll('button').find((b) => b.text().trim() === '测试')!
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
    const wrapper = await mountPageAndOpenLegacyModal()

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

  it('编辑：三个两腿/SSH 字段 inline 格式校验拦截坏值（不发请求；新建模式字段隐藏）', async () => {
    const cases: [RegExp, string, string][] = [
      [/8443/, '10.10.1.1:8443', '网关 HTTP 腿'],
      [/8443/, 'http://10.10.1.1:8443/api', '网关 HTTP 腿'],
      [/tunnel@10\.10\.1\.1:22/, '10.10.1.1:22', 'SSH 跳板'],
      [/openresty-1\.21\.4\.1/, 'work/openresty', 'OpenResty 前缀'],
    ]
    for (const [placeholder, badValue, errKeyword] of cases) {
      const wrapper = await mountPage()
      await flushPromises()
      await openEditModal(wrapper, 'luju')
      mockPut.mockClear()

      const input = wrapper
        .findAll('.modal input.form-input')
        .find((i) => (i.attributes('placeholder') || '').match(placeholder))!
      await input.setValue(badValue)
      await wrapper
        .findAll('.modal button.btn-primary')
        .find((b) => b.text().includes('保存'))!
        .trigger('click')
      await flushPromises()

      expect(mockPut, `${errKeyword} 坏值 ${badValue} 不应发请求`).not.toHaveBeenCalled()
      const errors = wrapper.findAll('.modal .form-error')
      expect(errors.some((e) => e.text().includes(errKeyword)), `${errKeyword} 应有 inline 红字`).toBe(true)
    }
  })

  it('ssh_jump 端口可省略：tunnel@10.10.1.1 通过前端校验并提交（编辑模式）', async () => {
    const wrapper = await mountPage()
    await flushPromises()
    await openEditModal(wrapper, 'luju')
    const jump = wrapper
      .findAll('.modal input.form-input')
      .find((i) => (i.attributes('placeholder') || '').includes('tunnel@10.10.1.1:22'))!
    await jump.setValue('tunnel@10.10.1.1')
    const sshUser = wrapper
      .findAll('.modal input.form-input')
      .find((i) => (i.attributes('placeholder') || '').includes('网关机上的账号'))!
    await sshUser.setValue('jboss')
    await wrapper
      .findAll('.modal button.btn-primary')
      .find((b) => b.text().includes('保存'))!
      .trigger('click')
    await flushPromises()
    expect(mockPut).toHaveBeenCalled()
    const errors = wrapper.findAll('.modal .form-error')
    expect(errors.some((e) => e.text().includes('SSH 跳板格式错误'))).toBe(false)
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
    const toggleBtn = wrapper.findAll('.mock-menu-item').find((b) => b.text().startsWith('禁用'))!
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
    const rowButtons = row.findAll('.table-actions button')
    const texts = rowButtons.filter((b) => !b.classes().includes('mock-menu-item')).map((b) => b.text())
    expect(texts).toEqual(['测试', '下发配置', '更多 ▾'])

    const items = row.findAll('.mock-menu-item')
    const itemTexts = items.map((b) => b.text().replace(/\s+/g, ' ').trim())
    // 二级描述随菜单项渲染（relay-gateways-ux-redesign）
    expect(itemTexts[0]).toContain('编辑')
    expect(itemTexts[0]).toContain('修改地址、账号与状态')
    expect(itemTexts.some((x) => x.startsWith('初始化网关'))).toBe(true)
    expect(itemTexts.some((x) => x.startsWith('配置跳板转发'))).toBe(true)
    expect(itemTexts.some((x) => x.startsWith('查看配置'))).toBe(true)
    expect(itemTexts.some((x) => x.startsWith('禁用'))).toBe(true)
    const last = items[items.length - 1]!
    expect(last.text()).toContain('删除')
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
    const otherBy = (t: string) => otherMenu.find((i) => i.text().startsWith(t))!
    expect(otherBy('初始化网关').classes()).toContain('mock-menu-disabled')
    expect(otherBy('配置跳板转发').classes()).toContain('mock-menu-disabled')
    expect(otherBy('启用').classes()).not.toContain('mock-menu-disabled')
    expect(otherBy('查看配置').classes()).not.toContain('mock-menu-disabled')
  })

  it('动作列宽 230 且提供更新时间列', async () => {
    const wrapper = await mountPage()
    const cols = JSON.parse(wrapper.find('.mock-table').attributes('data-columns') || '[]') as {
      key: string
      width?: number
    }[]
    expect(cols.some((c) => c.key === 'updated_at')).toBe(true)
    const actions = cols.find((c) => c.key === 'actions')!
    expect(actions.width).toBe(230)
    expect(wrapper.text()).toContain('2026/11/03')
  })

  it('初始化经确认后打开执行抽屉并启动 SSE 流', async () => {
    const wrapper = await mountPage()
    await flushPromises()

    const initBtn = wrapper.findAll('.mock-menu-item').find((b) => b.text().startsWith('初始化网关'))!
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

    const initBtn = wrapper.findAll('.mock-menu-item').find((b) => b.text().startsWith('初始化网关'))!
    await initBtn.trigger('click')
    await flushPromises()
    await confirmOverlay()

    const [, , handlers] = streamMock.start.mock.calls[0]
    handlers.onComplete(0, 'successful')
    await flushPromises()

    const after = wrapper.findAll('.mock-menu-item').find((b) => b.text().startsWith('初始化网关'))
    expect(after).toBeTruthy()
    expect(after!.text()).toContain('初始化网关')
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

    const btn = wrapper.findAll('.mock-menu-item').find((b) => b.text().startsWith('查看配置'))!
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

  it('跳板转发配置成功后自动复检（刷新体检快照 → 跳板框完成即隐）', async () => {
    const wrapper = await mountPage()
    await flushPromises()

    const btn = wrapper.findAll('button').find((b) => b.text().includes('配置跳板转发'))!
    await btn.trigger('click')
    await flushPromises()
    const modal = wrapper.find('.modal-overlay')
    await modal.find('input[type="password"]').setValue('s3cret')
    await modal
      .findAll('button')
      .find((b) => b.text().includes('开始配置'))!
      .trigger('click')
    await flushPromises()

    expect(streamMock.start).toHaveBeenCalledTimes(1)
    const [, , opts] = streamMock.start.mock.calls[0] as [
      string,
      unknown,
      { onComplete: (rc: number, status: string) => void },
    ]
    mockGet.mockClear()
    opts.onComplete(0, 'success')
    await flushPromises()

    expect(mockGet).toHaveBeenCalledWith('/relay/health-check?region=luju', expect.anything())
  })

  it('删除经确认后 DELETE /relay/gateways/:id', async () => {
    mockDelete.mockResolvedValue({ data: { ok: true } })
    const wrapper = await mountPage()
    await flushPromises()

    const delBtn = wrapper.findAll('.mock-menu-item').find((b) => b.text().startsWith('删除'))!
    await delBtn.trigger('click')
    await flushPromises()
    await confirmOverlay()

    expect(mockDelete).toHaveBeenCalledWith('/relay/gateways/1')
  })

  // ── 视图切换共存（relay-region-topology-view 批次二 2.5：拓扑默认 + 表格保留） ──
  const TOPOLOGY = {
    regions: [
      {
        id: 1,
        code: 'luju',
        name: '路局A',
        status: 'enabled',
        http_base_url: 'http://10.10.1.1:8443',
        ssh_jump: 'tunnel@10.10.1.1:22',
        ssh_user: 'jboss',
        ssh_port: 22,
        openresty_prefix: '/work/openresty/nginx',
        last_pushed_at: '2026-11-05T10:22:00',
        clusters: [
          {
            id: 11,
            name: '胶济干线',
            display_name: null,
            nodes: [
              { ip: '10.10.2.1', management_port: 8080, status: 1, whitelist_state: 'synced' },
              { ip: '10.10.2.2', management_port: 8080, status: 1, whitelist_state: 'pending_add' },
            ],
          },
        ],
      },
      {
        id: 2,
        code: 'direct',
        name: '武清本地',
        status: 'enabled',
        http_base_url: null,
        ssh_jump: null,
        ssh_user: null,
        ssh_port: null,
        openresty_prefix: null,
        last_pushed_at: null,
        clusters: [],
      },
    ],
    detachable: [
      { id: 99, name: '青岛港', display_name: null, region_code: null },
      { id: 11, name: '胶济干线', display_name: null, region_code: 'luju' },
    ],
    unregistered_bound_codes: ['luju'],
  }

  function mockWithTopology() {
    mockGet.mockImplementation((url: string) => {
      if (url === '/relay/gateways') return Promise.resolve({ data: REGIONS })
      if (url === '/relay/topology') return Promise.resolve({ data: TOPOLOGY })
      return Promise.reject(new Error(`unmocked get ${url}`))
    })
  }

  it('视图切换：拓扑为默认视图（拓扑卡可见、表格隐藏），拓扑端点被请求', async () => {
    mockWithTopology()
    const wrapper = await mountPage()
    expect(wrapper.find('.topo-view').isVisible()).toBe(true)
    expect(wrapper.find('.table-view-wrap').isVisible()).toBe(false)
    expect(mockGet).toHaveBeenCalledWith('/relay/topology')
    // 拓扑卡渲染区域与集群节点明细（数据来自 /relay/topology）
    const topo = wrapper.find('.topo-view')
    expect(topo.text()).toContain('路局A')
    expect(topo.text()).toContain('10.10.2.1:8080')
    expect(topo.findAll('.cluster-card').length).toBe(1)
  })

  it('视图切换：切到表格后表格可见、拓扑隐藏；既有表格 DOM 零改动（#217 断言继承）', async () => {
    mockWithTopology()
    const wrapper = await mountPage()
    await wrapper
      .findAll('.view-toggle button')
      .find((b) => b.text().includes('表格视图'))!
      .trigger('click')
    expect(wrapper.find('.table-view-wrap').isVisible()).toBe(true)
    expect(wrapper.find('.topo-view').isVisible()).toBe(false)
    expect(wrapper.find('.mock-row[data-code="luju"]').exists()).toBe(true)
  })

  it('悬空区域码提示卡：unregistered_bound_codes 非空时渲染（文案照 mockup）', async () => {
    mockWithTopology()
    const wrapper = await mountPage()
    const orphan = wrapper.find('.orphan-card')
    expect(orphan.exists()).toBe(true)
    expect(orphan.text()).toContain('悬空挂接')
    expect(orphan.text()).toContain('luju')
    expect(orphan.text()).toContain('已被 1 个集群挂接')
    expect(orphan.text()).toContain('该局实际按直连执行')
  })

  // ══ 批次三：图内编辑与新建（就地 popover 体系，relay-region-topology-view 3.1–3.9）══
  // popover Teleport 到 body（mockup popEl 同款）——document 级查询须 attachTo + unmount（约定 #43）。
  let attachedWrapper: { unmount(): void } | null = null

  afterEach(() => {
    if (attachedWrapper) {
      attachedWrapper.unmount()
      attachedWrapper = null
    }
  })

  // mock 数据形状照真实后端响应（#43：GET /relay/topology = schemas/relay.py RelayTopologyOut）
  const REGIONS3 = [
    {
      id: 1,
      code: 'jinan',
      name: '济南局',
      http_base_url: 'http://10.10.1.1:8443',
      ssh_jump: 'tunnel@10.10.1.1:22',
      openresty_prefix: '/work/openresty/nginx',
      status: 'enabled',
      ssh_user: 'jboss',
      ssh_port: 22,
      last_pushed_at: '2026-11-05T10:22:00',
      enabled_node_count: 1,
      total_node_count: 1,
      push_drift: { added: [], removed: [] },
    },
    {
      id: 2,
      code: 'tj',
      name: '天津局',
      http_base_url: null,
      ssh_jump: 'tunnel@10.10.2.1:22',
      openresty_prefix: null,
      status: 'enabled',
      ssh_user: 'jboss',
      ssh_port: 22,
      last_pushed_at: null,
      enabled_node_count: 0,
      total_node_count: 0,
      push_drift: null,
    },
    {
      id: 3,
      code: 'wq',
      name: '武清本地',
      http_base_url: null,
      ssh_jump: null,
      openresty_prefix: null,
      status: 'enabled',
      ssh_user: null,
      ssh_port: null,
      last_pushed_at: null,
      enabled_node_count: 0,
      total_node_count: 0,
      push_drift: null,
    },
  ]

  function topology3(opts: { tjPrefix?: string | null; tjUser?: string | null } = {}) {
    return {
      regions: [
        {
          id: 1,
          code: 'jinan',
          name: '济南局',
          status: 'enabled',
          http_base_url: 'http://10.10.1.1:8443',
          ssh_jump: 'tunnel@10.10.1.1:22',
          ssh_user: 'jboss',
          ssh_port: 22,
          openresty_prefix: '/work/openresty/nginx',
          last_pushed_at: '2026-11-05T10:22:00',
          clusters: [
            {
              id: 11,
              name: '胶济干线',
              display_name: null,
              nodes: [{ ip: '10.10.2.1', management_port: 8080, status: 1, whitelist_state: 'synced' }],
            },
          ],
        },
        {
          id: 2,
          code: 'tj',
          name: '天津局',
          status: 'enabled',
          http_base_url: null,
          ssh_jump: 'tunnel@10.10.2.1:22',
          ssh_user: 'tjUser' in opts ? opts.tjUser : 'jboss',
          ssh_port: 22,
          openresty_prefix: opts.tjPrefix ?? null,
          last_pushed_at: null,
          clusters: [],
        },
        {
          id: 3,
          code: 'wq',
          name: '武清本地',
          status: 'enabled',
          http_base_url: null,
          ssh_jump: null,
          ssh_user: null,
          ssh_port: null,
          openresty_prefix: null,
          last_pushed_at: null,
          clusters: [],
        },
      ],
      detachable: [
        { id: 99, name: '青岛港', display_name: null, region_code: null },
        { id: 11, name: '胶济干线', display_name: null, region_code: 'jinan' },
      ],
      unregistered_bound_codes: [],
    }
  }

  function mockTopology3(opts: { tjPrefix?: string | null; tjUser?: string | null } = {}) {
    mockGet.mockImplementation((url: string) => {
      if (url === '/relay/gateways') return Promise.resolve({ data: REGIONS3 })
      if (url === '/relay/topology') return Promise.resolve({ data: topology3(opts) })
      if (/\/relay\/gateways\/\d+\/credential$/.test(url)) return Promise.resolve({ data: { ssh_password: 'pw' } })
      if (url === '/relay/health-check?region=jinan') {
        return Promise.resolve({
          data: { region: 'jinan', ok: true, segments: [{ name: '网关HTTP腿', ok: true, elapsed_ms: 5 }] },
        })
      }
      return Promise.reject(new Error(`unmocked get ${url}`))
    })
  }

  async function mountTopoPage(opts: { tjPrefix?: string | null; tjUser?: string | null } = {}) {
    mockTopology3(opts)
    attachedWrapper = mount(RelayGateways, {
      attachTo: document.body,
      global: { plugins: [createPinia()], stubs },
    })
    await flushPromises()
    return attachedWrapper as ReturnType<typeof mount>
  }

  function cardOf(wrapper: ReturnType<typeof mount>, code: string) {
    return wrapper.findAll('.topo-card').find((c) => c.attributes('data-code') === code)!
  }

  function popEl(): HTMLElement | null {
    return document.body.querySelector('.topo-pop')
  }

  function popText(): string {
    return popEl()?.textContent || ''
  }

  function popInputs(): NodeListOf<HTMLInputElement> {
    return popEl()!.querySelectorAll('.pf input')
  }

  async function setInputValue(input: HTMLInputElement, value: string) {
    input.value = value
    input.dispatchEvent(new Event('input'))
    await flushPromises()
  }

  async function blurInput(input: HTMLInputElement) {
    input.dispatchEvent(new Event('blur'))
    await flushPromises()
  }

  async function clickPopButton(text: string) {
    const btn = Array.from(popEl()!.querySelectorAll('button')).find((b) => b.textContent!.trim() === text)
    btn!.click()
    await flushPromises()
  }

  async function pressEscape() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
  }

  it('3.1 引擎：锚定打开/预填/Esc 关闭/同图元再点收起/点击空白关闭', async () => {
    const wrapper = await mountTopoPage()
    const chip = cardOf(wrapper, 'jinan')
      .findAll('.leg-chip')
      .find((c) => c.text().includes('HTTP 腿'))!
    await chip.trigger('click')
    await flushPromises()
    expect(popEl()).not.toBeNull()
    expect(popText()).toContain('编辑 HTTP 腿 · 济南局')
    expect((popInputs()[0] as HTMLInputElement).value).toBe('http://10.10.1.1:8443')

    // Esc 关闭
    await pressEscape()
    expect(popEl()).toBeNull()

    // 同图元再点收起（toggle）
    await chip.trigger('click')
    await flushPromises()
    expect(popEl()).not.toBeNull()
    await chip.trigger('click')
    await flushPromises()
    expect(popEl()).toBeNull()

    // 点击空白处关闭
    await chip.trigger('click')
    await flushPromises()
    document.body.click()
    await flushPromises()
    expect(popEl()).toBeNull()
  })

  it('3.1/3.2 即时校验：失焦红字与后端文案逐字一致，输入清红，校验不过不提交', async () => {
    const wrapper = await mountTopoPage()
    await cardOf(wrapper, 'jinan')
      .findAll('.leg-chip')
      .find((c) => c.text().includes('HTTP 腿'))!
      .trigger('click')
    await flushPromises()
    await setInputValue(popInputs()[0], '10.10.1.1:8443')
    await blurInput(popInputs()[0])
    expect(popEl()!.querySelector('.pf.invalid .ferr')?.textContent).toBe(
      '网关 HTTP 腿格式错误: 须以 http:// 或 https:// 开头且不含路径，如 http://10.10.1.1:8443',
    )
    // 输入即清红
    await setInputValue(popInputs()[0], 'http://10.10.1.1:8443')
    expect(popEl()!.querySelector('.pf.invalid')).toBeNull()

    // 校验不过不提交
    await setInputValue(popInputs()[0], 'http://10.10.1.1:8443/api')
    mockPut.mockClear()
    await clickPopButton('保存并测试')
    expect(mockPut).not.toHaveBeenCalled()
    expect(popEl()).not.toBeNull()
  })

  it('3.2 HTTP 腿编辑态「仅保存」：PUT merge 回填未编辑字段且不携带 ssh_password，成功后刷新', async () => {
    const wrapper = await mountTopoPage()
    await cardOf(wrapper, 'jinan')
      .findAll('.leg-chip')
      .find((c) => c.text().includes('HTTP 腿'))!
      .trigger('click')
    await flushPromises()
    await clickPopButton('仅保存')

    expect(mockPut).toHaveBeenCalledTimes(1)
    const [url, payload] = mockPut.mock.calls[0] as [string, Record<string, unknown>]
    expect(url).toBe('/relay/gateways/1')
    expect(payload).toEqual({
      name: '济南局',
      http_base_url: 'http://10.10.1.1:8443',
      ssh_jump: 'tunnel@10.10.1.1:22',
      openresty_prefix: '/work/openresty/nginx',
      status: 'enabled',
      ssh_user: 'jboss',
      ssh_port: 22,
      ansible_python_interpreter: null,
      ssh_common_args: null,
    })
    expect('ssh_password' in payload).toBe(false)
    // 保存成功 → refreshAll（load + loadTopology）
    expect(mockGet).toHaveBeenCalledWith('/relay/gateways')
    expect(mockGet).toHaveBeenCalledWith('/relay/topology')
    expect(popEl()).toBeNull()
  })

  it('3.2 HTTP 腿编辑态「保存并测试」：保存后链式调用既有体检端点', async () => {
    const wrapper = await mountTopoPage()
    await cardOf(wrapper, 'jinan')
      .findAll('.leg-chip')
      .find((c) => c.text().includes('SSH 跳板'))!
      .trigger('click')
    await flushPromises()
    expect(popText()).toContain('编辑 SSH 跳板 · 济南局')
    await clickPopButton('保存并测试')

    expect(mockPut).toHaveBeenCalledTimes(1)
    expect(mockGet).toHaveBeenCalledWith('/relay/health-check?region=jinan', { timeout: 180_000 })
    expect(popEl()).toBeNull()
  })

  it('3.2 提交异常就地红字展示且浮层不关闭', async () => {
    const wrapper = await mountTopoPage()
    mockPut.mockRejectedValueOnce({ response: { data: { detail: '保存失败测试' } } })
    await cardOf(wrapper, 'jinan')
      .findAll('.leg-chip')
      .find((c) => c.text().includes('SSH 跳板'))!
      .trigger('click')
    await flushPromises()
    await clickPopButton('仅保存')
    expect(popEl()).not.toBeNull()
    expect(popEl()!.querySelector('.p-error')?.textContent).toBe('保存失败测试')
  })

  it('3.2 SSH 腿登记（区域无 ssh_user）：双字段顺带收集 + 校验 + 保存登记', async () => {
    const wrapper = await mountTopoPage()
    await cardOf(wrapper, 'wq')
      .findAll('.leg-chip.dim')
      .find((c) => c.text().includes('SSH 跳板'))!
      .trigger('click')
    await flushPromises()
    expect(popText()).toContain('登记 SSH 跳板 · 武清本地')
    expect(popInputs().length).toBe(2)
    expect((popInputs()[1] as HTMLInputElement).placeholder).toBe('jboss')
    expect(popText()).toContain('SSH 账号（登录网关机，初始化 / 下发用）')

    // 账号必填
    await setInputValue(popInputs()[0], 'tunnel@10.10.3.1:22')
    await clickPopButton('保存登记')
    expect(mockPut).not.toHaveBeenCalled()
    expect(popEl()!.querySelectorAll('.pf')[1]?.querySelector('.ferr')?.textContent).toBe('SSH 账号不能为空')

    await setInputValue(popInputs()[1], 'jboss')
    await clickPopButton('保存登记')
    const [, payload] = mockPut.mock.calls[0] as [string, Record<string, unknown>]
    expect(payload).toEqual(
      expect.objectContaining({ ssh_jump: 'tunnel@10.10.3.1:22', ssh_user: 'jboss', http_base_url: null }),
    )
    expect(popEl()).toBeNull()
  })

  it('3.3 网关机节点 popover（steady 整卡可点）：三字段预填 + 端口校验 + 保存', async () => {
    const wrapper = await mountTopoPage()
    await cardOf(wrapper, 'jinan').find('.node.editable').trigger('click')
    await flushPromises()
    expect(popText()).toContain('编辑网关机连接 · 济南局')
    expect(popText()).toContain('口令与高级参数（Python 解释器 / SSH 参数）请用「更多 ▸ 编辑」弹窗')
    expect((popInputs()[0] as HTMLInputElement).value).toBe('jboss')
    expect((popInputs()[1] as HTMLInputElement).value).toBe('22')
    expect((popInputs()[2] as HTMLInputElement).value).toBe('/work/openresty/nginx')

    await setInputValue(popInputs()[1], '0')
    await blurInput(popInputs()[1])
    expect(popEl()!.querySelectorAll('.pf')[1]?.querySelector('.ferr')?.textContent).toBe('端口须为 1–65535 的整数')

    await setInputValue(popInputs()[1], '2222')
    await clickPopButton('保存')
    const [, payload] = mockPut.mock.calls[0] as [string, Record<string, unknown>]
    expect(payload).toEqual(
      expect.objectContaining({ ssh_user: 'jboss', ssh_port: 2222, openresty_prefix: '/work/openresty/nginx' }),
    )
    expect(popEl()).toBeNull()
  })

  it('3.3 init-blocked [补 SSH 账号] 按钮开就地 popover 并可保存账号（批次三接线）', async () => {
    const wrapper = await mountTopoPage({ tjUser: null })
    const btn = cardOf(wrapper, 'tj')
      .findAll('button')
      .find((b) => b.text().trim() === '补 SSH 账号')!
    await btn.trigger('click')
    await flushPromises()
    expect(popText()).toContain('编辑网关机连接 · 天津局')
    await setInputValue(popInputs()[0], 'tjboss')
    await clickPopButton('保存')
    const [, payload] = mockPut.mock.calls[0] as [string, Record<string, unknown>]
    expect(payload).toEqual(expect.objectContaining({ ssh_user: 'tjboss' }))
  })

  it('3.8 初始化轻确认（前缀已填）：确认后走既有 init SSE 流', async () => {
    const wrapper = await mountTopoPage({ tjPrefix: '/work/openresty/nginx' })
    const btn = cardOf(wrapper, 'tj')
      .findAll('button')
      .find((b) => b.text().trim() === '初始化网关')!
    await btn.trigger('click')
    await flushPromises()
    expect(popText()).toContain('初始化网关 · 天津局')
    expect(popText()).toContain('幂等可重复执行')
    expect(popText()).toContain('前置：SSH 腿 ✓ · SSH 账号 ✓ · OpenResty 前缀 ✓')
    await clickPopButton('确认初始化')
    expect(popEl()).toBeNull()
    expect(streamMock.start).toHaveBeenCalledWith('/relay/gateways/2/init', {}, expect.any(Object))
  })

  it('3.8 缺前缀链式「填写前缀并初始化」：聚焦前缀框 → 保存并初始化 → PUT 后自动开始初始化', async () => {
    const wrapper = await mountTopoPage()
    const btn = cardOf(wrapper, 'tj')
      .findAll('button')
      .find((b) => b.text().trim() === '初始化网关')!
    await btn.trigger('click')
    await flushPromises()
    expect(popText()).toContain('OpenResty 前缀')
    expect(popText()).toContain('未填（下一步收集）')
    await clickPopButton('填写前缀并初始化')

    // 链式打开 requirePrefix 变体并聚焦前缀框
    expect(popText()).toContain('初始化前置 · OpenResty 前缀 · 天津局')
    expect(popText()).toContain('填完保存即自动开始初始化（写入 8443 监听并 reload）')
    expect(document.activeElement).toBe(popInputs()[2])

    // 直接保存会被 requirePrefix 拦截
    await clickPopButton('保存并初始化')
    expect(mockPut).not.toHaveBeenCalled()
    expect(popEl()!.querySelectorAll('.pf')[2]?.querySelector('.ferr')?.textContent).toBe(
      '初始化网关需要 OpenResty 前缀',
    )

    await setInputValue(popInputs()[2], '/work/nginx')
    await clickPopButton('保存并初始化')
    expect(mockPut).toHaveBeenCalledTimes(1)
    const [, payload] = mockPut.mock.calls[0] as [string, Record<string, unknown>]
    expect(payload).toEqual(expect.objectContaining({ openresty_prefix: '/work/nginx', ssh_user: 'jboss' }))
    // 链式：PUT 成功后自动开始初始化
    expect(streamMock.start).toHaveBeenCalledWith('/relay/gateways/2/init', {}, expect.any(Object))
    expect(popEl()).toBeNull()
  })

  it('3.4 卡头名称就地改名：非空校验 + PUT', async () => {
    const wrapper = await mountTopoPage()
    await cardOf(wrapper, 'jinan').find('.editable-name').trigger('click')
    await flushPromises()
    expect(popText()).toContain('重命名区域 · 济南局')
    await setInputValue(popInputs()[0], '')
    await clickPopButton('保存')
    expect(mockPut).not.toHaveBeenCalled()
    expect(popEl()!.querySelector('.pf.invalid .ferr')?.textContent).toBe('区域名称不能为空')

    await setInputValue(popInputs()[0], '济南局改')
    await clickPopButton('保存')
    const [, payload] = mockPut.mock.calls[0] as [string, Record<string, unknown>]
    expect(payload).toEqual(expect.objectContaining({ name: '济南局改' }))
  })

  it('3.4 状态徽章切换确认 popover：禁用提示 + 确认后 PUT status', async () => {
    const wrapper = await mountTopoPage()
    await cardOf(wrapper, 'jinan').find('.badge.clickable').trigger('click')
    await flushPromises()
    expect(popText()).toContain('禁用区域 · 济南局')
    expect(popText()).toContain('全部挂接集群回退直连执行')
    expect(popText()).toContain('两腿配置保留，随时可再启用')
    await clickPopButton('确认禁用')
    expect(mockPut).toHaveBeenCalledWith('/relay/gateways/1', expect.objectContaining({ status: 'disabled' }))
    expect(mockGet).toHaveBeenCalledWith('/relay/gateways')
  })

  it('3.5 集群挂接/解挂 popover：区域下拉 + 打开集群链接 + 空串解挂', async () => {
    const wrapper = await mountTopoPage()
    await cardOf(wrapper, 'jinan').find('.cluster-card').trigger('click')
    await flushPromises()
    expect(popText()).toContain('挂接 / 解挂 · 胶济干线')
    expect(popText()).toContain('选择所属中继区域；不挂接则该集群按直连执行')
    const select = popEl()!.querySelector('select') as HTMLSelectElement
    expect(select.value).toBe('jinan')
    const optionTexts = Array.from(select.options).map((o) => o.textContent)
    expect(optionTexts).toContain('不挂接（直连）')
    expect(optionTexts).toContain('济南局（jinan）')

    // 打开集群链接
    await clickPopButton('打开集群 ›')
    expect(mockRouterPush).toHaveBeenCalledWith('/clusters')

    // 解挂：选择「不挂接（直连）」后保存
    select.value = ''
    select.dispatchEvent(new Event('change'))
    await flushPromises()
    await clickPopButton('保存')
    expect(mockPut).toHaveBeenCalledWith('/clusters/11', { region_code: '' })
    expect(message.success).toHaveBeenCalledWith('已解挂：该集群回直连')
  })

  it('3.5 +挂接集群候选下拉（含当前区域归属）与提交', async () => {
    const wrapper = await mountTopoPage()
    await cardOf(wrapper, 'wq').find('.attach-dashed').trigger('click')
    await flushPromises()
    expect(popText()).toContain('挂接集群 · 武清本地')
    const select = popEl()!.querySelector('select') as HTMLSelectElement
    const optionTexts = Array.from(select.options).map((o) => o.textContent)
    expect(optionTexts).toContain('青岛港（当前：未挂接）')
    expect(optionTexts).toContain('胶济干线（当前：济南局）')

    select.value = '11'
    select.dispatchEvent(new Event('change'))
    await flushPromises()
    await clickPopButton('挂接')
    expect(mockPut).toHaveBeenCalledWith('/clusters/11', { region_code: 'wq' })
    expect(message.success).toHaveBeenCalledWith(expect.stringContaining('已挂接「胶济干线」至 武清本地'))
  })

  it('3.6 节点行只读详情弹窗：状态/白名单态/体检明细 + 打开节点管理', async () => {
    const wrapper = await mountTopoPage()
    await cardOf(wrapper, 'jinan').find('.nrow').trigger('click')
    await flushPromises()
    const opts = (globalThis as Record<string, unknown>).__lastOverlayOpts as {
      title: string
      content: unknown
      okText: string
    }
    expect(opts.title).toBe('节点 10.10.2.1:8080')
    const text = vnodeText(opts.content)
    expect(text).toContain('启用')
    expect(text).toContain('已同步')
    expect(text).toContain('未检测')
    expect(opts.okText).toBe('打开节点管理')

    const onOk = (globalThis as Record<string, unknown>).__lastOverlayOk as () => unknown
    await onOk()
    expect(mockRouterPush).toHaveBeenCalledWith({ path: '/nodes', query: { cluster_id: '11' } })
  })

  it('3.7 新建走弹窗：虚线卡/页头/表格工具行三入口统一 openCreate，新建模式仅 2 必填', async () => {
    const wrapper = await mountTopoPage()
    await wrapper.find('.create-card').trigger('click')
    await flushPromises()
    const modal = wrapper.find('.modal-overlay')
    expect(modal.exists()).toBe(true)
    expect(modal.text()).toContain('新建区域')
    expect(modal.text()).toContain('区域码是集群挂接的钥匙；展示名给人看')
    // 新建模式裁字段（2026-11-10 用户确认）：状态下拉 / 两腿段 / SSH 凭据段不出现
    expect(modal.text()).not.toContain('网关两腿连接')
    expect(modal.text()).not.toContain('网关机 SSH 凭据')
    expect(modal.findAll('select').length).toBe(0)
    // 取消关闭
    await modal.findAll('button').find((b) => b.text().trim() === '取消')!.trigger('click')
    await flushPromises()
    expect(wrapper.find('.modal-overlay').exists()).toBe(false)

    // 表格视图工具行入口同样打开弹窗（草稿卡已移除，弹窗两视图共用）
    await wrapper
      .findAll('.view-toggle button')
      .find((b) => b.text().includes('表格视图'))!
      .trigger('click')
    await flushPromises()
    await wrapper.find('.card-header button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.modal-overlay').exists()).toBe(true)
  })

  it('3.7 弹窗创建：非法区域码不发请求；合法提交全量载荷（两腿空=null 直连形态）+ toast + 刷新', async () => {
    const wrapper = await mountTopoPage()
    await wrapper.find('.create-card').trigger('click')
    await flushPromises()
    const modal = wrapper.find('.modal-overlay')
    await modal.find('input.mono-input').setValue('Bad_Code')
    await modal.findAll('input.form-input')[1]!.setValue('济南二局')
    mockPost.mockClear()
    await modal.findAll('.modal button.btn-primary').find((b) => b.text().includes('保存'))!.trigger('click')
    await flushPromises()
    expect(mockPost).not.toHaveBeenCalled()
    expect(modal.text()).toContain('区域码格式错误')

    // 后端查重 400 → toast 透因
    mockPost.mockRejectedValueOnce({ response: { data: { detail: '区域code已存在' } } })
    await modal.find('input.mono-input').setValue('jinan2')
    await modal.findAll('.modal button.btn-primary').find((b) => b.text().includes('保存'))!.trigger('click')
    await flushPromises()
    expect(message.error).toHaveBeenCalled()

    // 修正后成功：载荷含全部字段（两腿空=null=直连形态，SSH 字段留空待登记两腿时收集）
    await modal.find('input.mono-input').setValue('jinan3')
    await modal.findAll('.modal button.btn-primary').find((b) => b.text().includes('保存'))!.trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenLastCalledWith(
      '/relay/gateways',
      expect.objectContaining({
        code: 'jinan3',
        name: '济南二局',
        http_base_url: null,
        ssh_jump: null,
        status: 'enabled',
        ssh_user: '',
        ssh_password: null,
        ssh_port: 22,
      }),
    )
    expect(
      vi.mocked(message.success).mock.calls.some((a) => String(a[0]).includes('区域已创建（初始直连形态）')),
    ).toBe(true)
    expect(mockGet).toHaveBeenCalledWith('/relay/gateways')
    expect(mockGet).toHaveBeenCalledWith('/relay/topology')
  })

  it('3.7 页头「+ 新建区域」打开新建弹窗', async () => {
    const wrapper = await mountTopoPage()
    const headerBtn = wrapper.findAll('button').find((b) => b.text().includes('新建区域'))!
    await headerBtn.trigger('click')
    await flushPromises()
    expect(wrapper.find('.modal-overlay').exists()).toBe(true)
  })
})
