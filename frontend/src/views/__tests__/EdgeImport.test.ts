/**
 * EdgeImport.vue 组件回归（edge-import-ux-review-fixes，2026-10-30 UX 评审，用户裁决全 A）。
 *
 * 覆盖：adminKey 说明、测试连接过程提示、下一步 disabled tooltip、导入确认弹窗、
 * skipped_counts 明细、上一步保留集群、取消确认、预览默认展开/空折叠、全选快捷项。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'

const mockMessage = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }
vi.mock('ant-design-vue', () => ({ message: mockMessage }))

const overlayCalls: Array<Record<string, any>> = []
const mockOverlay = vi.fn((opts: Record<string, any>) => {
  overlayCalls.push(opts)
  if (opts.onOk) opts.onOk() // 默认立即确认（确认弹窗用例单独控制）
  return { close: vi.fn() }
})
vi.mock('@/composables/useOverlayModal', () => ({ showOverlayModal: (...a: any[]) => mockOverlay(...a) }))
vi.mock('@/composables/useClusterUtils', () => ({ routeLabel: (r?: string) => (r === 'relay' ? '经中继' : '') }))

const mockTestConnection = vi.fn()
const mockGetPreview = vi.fn()
const mockExecuteImport = vi.fn()
vi.mock('@/api/edgeImport', () => ({
  testConnection: (...a: any[]) => mockTestConnection(...a),
  getPreview: (...a: any[]) => mockGetPreview(...a),
  executeImport: (...a: any[]) => mockExecuteImport(...a),
}))

const mockApiGet = vi.fn()
vi.mock('@/api', () => ({ default: { get: (...a: any[]) => mockApiGet(...a) } }))

function makeUser(id: number, ip: string) {
  return { id, ip, management_port: 16620, edge_path: '/edge' }
}

const stubs = {
  PageHeader: { template: '<div class="page-header" />', props: ['title', 'description'] },
  'a-steps': { template: '<div class="a-steps"><slot /></div>', props: ['current'] },
  'a-step': { template: '<div class="a-step" />', props: ['title'] },
  'a-card': { template: '<div class="a-card"><slot name="title" /><slot /></div>', props: ['title', 'size'] },
  'a-form': { template: '<div class="a-form"><slot /></div>', props: ['layout'] },
  'a-form-item': { template: '<div class="a-form-item"><slot /></div>', props: ['label', 'required'] },
  'a-select': {
    props: ['value', 'placeholder', 'loading', 'disabled'],
    emits: ['update:value', 'change'],
    setup(_: unknown, { emit }: { emit: (e: string, v?: unknown) => void }) {
      const onChange = (e: Event): void => {
        const v = (e.target as HTMLSelectElement).value
        emit('update:value', v)
        emit('change', v)
      }
      return { onChange }
    },
    template: '<select class="a-select" :value="value" :disabled="disabled" @change="onChange"><slot /></select>',
  },
  'a-select-option': {
    template: '<option class="a-select-option" :value="value"><slot /></option>',
    props: ['value', 'key'],
  },
  'a-input-password': {
    props: ['value', 'placeholder'],
    emits: ['update:value'],
    template:
      '<input class="a-input-password" :value="value" :placeholder="placeholder" @input="$emit(\'update:value\', $event.target.value)" />',
  },
  'a-button': {
    template: '<button class="a-btn" :disabled="disabled || undefined" @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'size', 'loading', 'disabled'],
    // 缺 emits 声明时组件层 @click 会经 attrs fallthrough 原生绑定 + stub 内部 $emit 各触发一次 → handler 双执行
    emits: ['click'],
  },
  'a-alert': {
    template:
      '<div class="a-alert" :class="type"><slot name="message" /><slot name="description" />{{ message }}</div>',
    props: ['type', 'showIcon', 'closable', 'message'],
  },
  'a-checkbox': {
    template:
      '<input type="checkbox" class="a-checkbox" :checked="checked" @change="$emit(\'update:checked\', $event.target.checked)" />',
    props: ['checked'],
  },
  'a-table': {
    template: '<div class="a-table">{{ (dataSource || []).length }} 行</div>',
    props: ['columns', 'dataSource', 'pagination', 'rowKey', 'size'],
  },
  'a-tag': { template: '<span class="a-tag"><slot /></span>', props: ['color'] },
  'a-spin': { template: '<div class="a-spin">{{ tip }}</div>', props: ['tip'] },
}

const SAMPLE_PREVIEW = {
  upstreams: [{ id: 'u1', name: 'up-a', type: 'roundrobin', nodes: { '10.0.0.1:80': 1 } }],
  routes: [{ id: 'r1', name: 'route-a', uri: '/a', methods: ['GET'], upstream_id: 'u1' }],
  plugin_configs: [],
  global_rules: [],
  plugin_metadata: [],
  stream_proxies: [],
  ssl_certificates: [],
  warnings: [],
  conflicts: [],
  plugin_summary: { known_count: 0, unknown_count: 0, unknown_plugin_names: [] },
}

async function mountPage(initial = '/edge-import') {
  const EdgeImport = (await import('../EdgeImport.vue')).default
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/edge-import', component: { template: '<div />' } },
      { path: '/clusters', component: { template: '<div />' } },
    ],
  })
  await router.push(initial)
  await router.isReady()
  const wrapper = mount(EdgeImport, { global: { plugins: [router], stubs } })
  await flushPromises()
  return wrapper
}

/** 走到连接成功态（选集群+节点+测试连接成功） */
async function reachConnected(wrapper: Awaited<ReturnType<typeof mountPage>>) {
  mockApiGet.mockImplementation((url: string) => {
    if (url === '/clusters')
      return Promise.resolve({ data: { items: [{ id: 4, name: 'test', display_name: 'test' }] } })
    if (url.includes('/nodes')) return Promise.resolve({ data: { items: [makeUser(2, '192.168.0.14')] } })
    return Promise.reject(new Error('unknown ' + url))
  })
  // remount with proper api mock（beforeEach 已设——这里覆盖后需要重挂？直接改用已挂实例）
  return wrapper
}

function buttons(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('button')
}

beforeEach(() => {
  vi.clearAllMocks()
  overlayCalls.length = 0
  mockApiGet.mockImplementation((url: string) => {
    if (url === '/clusters')
      return Promise.resolve({ data: { items: [{ id: 4, name: 'test', display_name: 'test' }] } })
    if (url.includes('/nodes')) return Promise.resolve({ data: { items: [makeUser(2, '192.168.0.14')] } })
    return Promise.reject(new Error('unknown ' + url))
  })
  mockTestConnection.mockResolvedValue({
    data: {
      success: true,
      version: '3.1',
      route_count: 5,
      upstream_count: 2,
      plugin_count: 3,
      plugin_config_count: 1,
      global_rule_count: 1,
      plugin_metadata_count: 0,
      stream_proxy_count: 0,
      ssl_certificate_count: 0,
      node: '192.168.0.14:16620',
      response_time_ms: 4300,
    },
  })
  mockGetPreview.mockResolvedValue({ data: SAMPLE_PREVIEW })
  mockExecuteImport.mockResolvedValue({
    data: {
      success: true,
      imported_counts: {
        upstreams: 2,
        routes: 5,
        plugin_configs: 1,
        global_rules: 1,
        plugin_metadata: 0,
        stream_proxies: 0,
        ssl_certificates: 0,
        skipped: 3,
      },
      skipped_counts: { upstreams: 2, routes: 1, plugin_configs: 0, global_rules: 0 },
      plugin_summary: { known_count: 0, unknown_count: 0, unknown_plugin_names: [] },
    },
  })
})

// ── 批 1 ──

describe('EdgeImport 批 1：连接测试反馈', () => {
  it('adminKey placeholder 说明留空回退语义', async () => {
    const wrapper = await mountPage()
    const keyInput = wrapper.find('.a-input-password')
    expect(keyInput.attributes('placeholder')).toContain('留空')
  })

  it('测试连接 loading 期间显示过程提示（非静默）', async () => {
    const wrapper = await mountPage()
    // 手动触发集群选择（select stub 走 change 事件）
    const select = wrapper.find('.a-select')
    await select.setValue('4')
    await flushPromises()
    const nodeSelect = wrapper.findAll('.a-select')[1]
    await nodeSelect.setValue('2')
    await flushPromises()
    // 触发测试连接且挂起（延迟 resolve）
    let resolveConn: (v: unknown) => void
    mockTestConnection.mockImplementation(
      () =>
        new Promise((r) => {
          resolveConn = r
        }),
    )
    const testBtn = buttons(wrapper).find((b) => b.text().includes('测试连接'))!
    await testBtn.trigger('click')
    await flushPromises()
    expect(wrapper.find('.testing-hint').exists()).toBe(true)
    expect(wrapper.find('.testing-hint').text()).toContain('正在连接节点并统计配置数据')
    resolveConn!({ data: { success: true } })
    await flushPromises()
    expect(wrapper.find('.testing-hint').exists()).toBe(false)
  })

  it('下一步未测连接时禁用且 tooltip 说明', async () => {
    const wrapper = await mountPage()
    const nextBtn = buttons(wrapper).find((b) => b.text().includes('下一步'))!
    expect(nextBtn.attributes('disabled')).toBeDefined()
    const tipHost = nextBtn.element.closest('.tip-host') as HTMLElement | null
    expect(tipHost?.getAttribute('title')).toContain('请先完成连接测试')
  })
})

// ── 批 2 ──

async function reachStep2() {
  const wrapper = await mountPage()
  const select = wrapper.find('.a-select')
  await select.setValue('4')
  await flushPromises()
  const nodeSelect = wrapper.findAll('.a-select')[1]
  await nodeSelect.setValue('2')
  await flushPromises()
  const testBtn = buttons(wrapper).find((b) => b.text().includes('测试连接'))!
  await testBtn.trigger('click')
  await flushPromises()
  // 第一次点击后 DOM 重渲染——重新查找按钮引用（游离元素 trigger 无效）
  const next1 = buttons(wrapper).find((b) => b.text().includes('下一步'))!
  await next1.trigger('click')
  await flushPromises()
  const next2 = buttons(wrapper).find((b) => b.text().includes('下一步'))!
  await next2.trigger('click') // 进入 step2（触发 getPreview）
  await flushPromises()
  return wrapper
}

describe('EdgeImport 批 2：导入确认与明细', () => {
  it('点「确认导入」先弹摘要确认，确认后才调 executeImport', async () => {
    const wrapper = await reachStep2()
    mockExecuteImport.mockClear()
    const importBtn = buttons(wrapper).find((b) => b.text().includes('确认导入'))!
    await importBtn.trigger('click')
    await flushPromises()
    await flushPromises()
    const confirmCalls = overlayCalls.filter((c) => (c.title || '').includes('确认导入'))
    expect(confirmCalls).toHaveLength(1)
    const opts = confirmCalls[0]
    expect(opts.content).toContain('冲突项将自动跳过')
    // onOk 已被 mock 立即调用 → executeImport 调用一次
    expect(mockExecuteImport).toHaveBeenCalledTimes(1)
  })

  it('结果弹窗展示 skipped_counts 分类明细', async () => {
    const wrapper = await reachStep2()
    const importBtn = buttons(wrapper).find((b) => b.text().includes('确认导入'))!
    await importBtn.trigger('click')
    await flushPromises()
    await flushPromises()
    // showImportResult 的 overlay content 是 VNode 树——断言第二次 overlay 调用的 content 包含明细
    const resultCall = overlayCalls.find((c) => c.title === '导入结果')
    expect(resultCall).toBeDefined()
    // VNode 树转 JSON 断言关键文案
    const json = JSON.stringify(resultCall!.content)
    expect(json).toContain('上游跳过 2 个')
    expect(json).toContain('路由跳过 1 条')
  })

  it('取消按钮弹确认后清空', async () => {
    const wrapper = await reachStep2()
    // 此时 overlayCalls[0] 是导入前确认？不是——取消按钮独立点
    const cancelBtn = buttons(wrapper).find((b) => b.text() === '取消')!
    await cancelBtn.trigger('click')
    await flushPromises()
    const cancelCall = overlayCalls.find((c) => (c.title || '').includes('取消'))
    expect(cancelCall).toBeDefined()
    expect(cancelCall!.content).toContain('丢弃')
  })

  it('上一步回 step0 保留集群选择', async () => {
    const wrapper = await reachStep2()
    // 直接调 goToStep(0)（step2 无「上一步」到 step0 的按钮——有！step-actions 有「上一步」= goToStep(1)。回 step0 场景：step1 的上一步）
    const backBtn = buttons(wrapper).find((b) => b.text() === '上一步')!
    await backBtn.trigger('click') // → step1
    await flushPromises()
    const backBtn2 = buttons(wrapper).find((b) => b.text() === '上一步')!
    await backBtn2.trigger('click') // → step0
    await flushPromises()
    // 集群仍选中（select stub value=4）
    const select = wrapper.find('.a-select')
    expect(select.element.value).toBe('4')
    // 节点已重置 → 节点下拉禁用（未选集群态不存在——集群在，节点下拉应启用且列表保留）
    expect(wrapper.find('.a-select:nth-of-type(1)').exists()).toBe(true)
  })
})

// ── 批 3 ──

describe('EdgeImport 批 3：预览交互', () => {
  it('进入预览：有数据 section 默认展开，0 项 section 折叠为单行提示', async () => {
    const wrapper = await reachStep2()
    // 上游有 1 项 → 展开（渲染 a-table）；插件组 0 项 → 单行提示不渲染表格
    const tables = wrapper.findAll('.a-table')
    expect(tables.length).toBeGreaterThanOrEqual(1)
    const text = wrapper.text()
    expect(text).toContain('插件组：0 个')
    expect(wrapper.findAll('.section-card').length).toBe(7) // 7 张卡仍在（含空态单行）
  })

  it('全选/全不选快捷项作用全部勾选', async () => {
    const wrapper = await reachStep2()
    const uncheckAll = wrapper.findAll('button').find((b) => b.text() === '全不选')!
    await uncheckAll.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('input.a-checkbox').every((c) => !(c.element as HTMLInputElement).checked)).toBe(true)
    const checkAll = wrapper.findAll('button').find((b) => b.text() === '全选')!
    await checkAll.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('input.a-checkbox').every((c) => (c.element as HTMLInputElement).checked)).toBe(true)
  })
})
