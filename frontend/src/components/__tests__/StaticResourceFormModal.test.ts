// StaticResourceFormModal（B2a）：两入口共用的静态资源表单
// 字段集 = 所属集群 + 路由（含三条资格勾叉 + 换绑警示）+ 描述；name/url_path 由后端推导、不在此表单。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ClusterSelect from '@/components/ClusterSelect.vue'
import StaticResourceFormModal from '@/components/StaticResourceFormModal.vue'

const mockGet = vi.fn()
const mockPost = vi.fn()
const mockPut = vi.fn()
vi.mock('@/api', () => ({
  default: {
    get: (...a: unknown[]) => mockGet(...(a as [])),
    post: (...a: unknown[]) => mockPost(...(a as [])),
    put: (...a: unknown[]) => mockPut(...(a as [])),
  },
}))

const dangerConfirm = vi.fn()
vi.mock('@/composables/useOverlayModal', () => ({
  showDangerConfirm: (...args: unknown[]) => dangerConfirm(...args),
}))

vi.mock('ant-design-vue', () => ({
  message: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}))

// antd 选择器桩：jsdom 下真实 Select 需要 matchMedia/虚拟列表；桩保留 value/disabled 语义
const aSelectStub = {
  name: 'ASelectStub',
  props: ['value', 'placeholder', 'showSearch', 'loading', 'notFoundContent', 'filterOption', 'disabled'],
  emits: ['update:value', 'change'],
  template: '<select class="a-select-stub" :value="value"><slot /></select>',
}
const aSelectOptionStub = {
  props: ['value', 'disabled'],
  template: '<option :value="value" :disabled="disabled"><slot /></option>',
}
const stubs = {
  'a-select': aSelectStub,
  'a-select-option': aSelectOptionStub,
  'a-select-opt-group': { props: ['label'], template: '<optgroup :label="label"><slot /></optgroup>' },
}

const CLUSTERS = [
  { id: 7, name: 'c7', display_name: '生产集群' },
  { id: 8, name: 'c8', display_name: '预发集群' },
]

const ROUTES = [
  { id: 11, name: 'legacy', uri: '/x', current_version: 3, plugins: [] },
  { id: 13, name: 'norel', uri: '/r/*', current_version: null, plugins: [{ plugin_name: 'static_resource' }] },
  { id: 12, name: 'ok', uri: '/y/*', current_version: 3, plugins: [{ plugin_name: 'static_resource' }] },
  { id: 14, name: 'ok2', uri: '/q/*', current_version: 2, plugins: [{ plugin_name: 'static_resource' }] },
]

const EDIT_SR = { id: 1, cluster_id: 7, route_id: 12, name: 'portal', description: '门户', url_path: '/y/*' }

function routeSelectOf(w: ReturnType<typeof mount>) {
  const all = w.findAllComponents({ name: 'ASelectStub' })
  const routeSelect = all.find((c) => (c.element as HTMLElement)?.classList?.contains('route-select'))
  expect(routeSelect, '路由下拉应存在（.route-select）').toBeTruthy()
  return routeSelect!
}

async function chooseRoute(w: ReturnType<typeof mount>, id: number) {
  routeSelectOf(w).vm.$emit('update:value', id)
  await flushPromises()
}

async function mountModal(props: Record<string, unknown> = {}) {
  const w = mount(StaticResourceFormModal, {
    props: { visible: true, clusters: CLUSTERS, ...props },
    global: { stubs },
  })
  await flushPromises()
  return w
}

beforeEach(() => {
  mockGet.mockReset()
  mockPost.mockReset()
  mockPut.mockReset()
  dangerConfirm.mockReset()
  mockGet.mockImplementation(async () => ({ data: { items: ROUTES } }))
  mockPost.mockResolvedValue({ data: { id: 99 } })
  mockPut.mockResolvedValue({ data: {} })
})

describe('StaticResourceFormModal · 字段集与集群上下文', () => {
  it('字段 = 所属集群 + 路由 + 描述（无 name/url_path：由后端按路由与 ZIP 上传推导）', async () => {
    const w = await mountModal()
    const labels = w.findAll('.form-label').map((l) => l.text())
    expect(labels.length).toBe(3)
    expect(labels[0]).toContain('所属集群')
    expect(labels[1]).toContain('选择路由')
    expect(labels[2]).toContain('描述')
    expect(w.findComponent(ClusterSelect).exists()).toBe(true)
    expect(w.find('textarea').exists()).toBe(true)
    // 死字段不得回流：页面原 formData 里的 name / url_path 从未渲染也从未提交
    expect(w.text()).not.toContain('url_path')
    expect(w.findAll('input').length).toBe(0)
  })

  it('新增态：defaultClusterId 预选 + lockCluster 禁用 + 立即加载该集群路由', async () => {
    const w = await mountModal({ defaultClusterId: 7, lockCluster: true })
    const cs = w.findComponent(ClusterSelect)
    expect(cs.props('modelValue')).toBe(7)
    expect(cs.props('disabled')).toBe(true)
    expect(mockGet).toHaveBeenCalledWith('/clusters/7/routes', expect.anything())
    // 路由未选 → 创建按钮禁用
    expect(w.find('.btn-primary').attributes('disabled')).toBeDefined()
  })

  it('页面形态（不锁集群）：集群可改，改集群清空已选路由并按新集群重载', async () => {
    const w = await mountModal({ defaultClusterId: 7 })
    expect(w.findComponent(ClusterSelect).props('disabled')).toBe(false)
    await chooseRoute(w, 12)
    expect(routeSelectOf(w).props('value')).toBe(12)
    w.findComponent(ClusterSelect).vm.$emit('update:modelValue', 8)
    w.findComponent(ClusterSelect).vm.$emit('change', 8)
    await flushPromises()
    expect(routeSelectOf(w).props('value')).toBeNull()
    expect(mockGet).toHaveBeenCalledWith('/clusters/8/routes', expect.anything())
  })

  it('编辑态：集群与路由回填，集群禁用（不允许跨集群搬迁）', async () => {
    const w = await mountModal({ editingResource: EDIT_SR })
    const cs = w.findComponent(ClusterSelect)
    expect(cs.props('modelValue')).toBe(7)
    expect(cs.props('disabled')).toBe(true)
    expect(routeSelectOf(w).props('value')).toBe(12)
    expect((w.find('textarea').element as HTMLTextAreaElement).value).toBe('门户')
    expect(w.findAll('.form-label')[1].text()).toContain('关联路由（可换绑）')
  })
})

describe('StaticResourceFormModal · 路由资格（三条勾叉与下拉后缀同源）', () => {
  it('未选路由：三条全叉，创建按钮禁用', async () => {
    const w = await mountModal({ defaultClusterId: 7 })
    expect(w.findAll('.route-validation-item').length).toBe(3)
    for (const key of ['uri', 'published', 'plugin']) {
      const item = w.find(`[data-check="${key}"]`)
      expect(item.classes()).toContain('invalid')
      expect(item.text()).toContain('❌')
    }
    expect(w.find('.btn-primary').attributes('disabled')).toBeDefined()
  })

  it('合格路由：三条全勾，创建按钮可用', async () => {
    const w = await mountModal({ defaultClusterId: 7 })
    await chooseRoute(w, 12)
    for (const key of ['uri', 'published', 'plugin']) {
      const item = w.find(`[data-check="${key}"]`)
      expect(item.classes()).toContain('valid')
      expect(item.text()).toContain('✅')
    }
    expect(w.find('.btn-primary').attributes('disabled')).toBeUndefined()
  })

  it('不合格路由：未发布 → 仅 published 一项叉（下拉项同时禁用并带原因后缀）', async () => {
    const w = await mountModal({ defaultClusterId: 7 })
    await chooseRoute(w, 13)
    expect(w.find('[data-check="uri"]').classes()).toContain('valid')
    expect(w.find('[data-check="published"]').classes()).toContain('invalid')
    expect(w.find('[data-check="plugin"]').classes()).toContain('valid')
    expect(w.find('.btn-primary').attributes('disabled')).toBeDefined()
    // 下拉标注：合格项无后缀、不合格项带短原因
    const options = w.findAll('option').map((o) => o.text())
    expect(options).toContain('ok (/y/*)')
    expect(options.some((t) => t.includes('legacy (/x)（路径须以 /* 结尾、未挂静态资源插件）'))).toBe(true)
  })
})

describe('StaticResourceFormModal · 提交与换绑二次确认', () => {
  it('新增：POST 到集群静态资源端点，emit saved + close', async () => {
    const w = await mountModal({ defaultClusterId: 7 })
    await chooseRoute(w, 12)
    await w.find('.btn-primary').trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/clusters/7/static-resources', { route_id: 12, description: undefined })
    expect(w.emitted('saved')).toBeTruthy()
    expect(w.emitted('close')).toBeTruthy()
  })

  it('编辑（不换绑）：只 PUT 描述，不弹二次确认；出现换绑警示需先改路由', async () => {
    const w = await mountModal({ editingResource: EDIT_SR })
    expect(w.find('[data-check="rebind"]').exists()).toBe(false)
    await w.find('.btn-primary').trigger('click')
    await flushPromises()
    expect(dangerConfirm).not.toHaveBeenCalled()
    expect(mockPut).toHaveBeenCalledWith('/clusters/7/static-resources/1', { description: '门户' })
    expect(w.emitted('saved')).toBeTruthy()
  })

  it('编辑换绑：先弹二次确认，确认后才 PUT（payload 带 route_id）', async () => {
    const w = await mountModal({ editingResource: EDIT_SR })
    await chooseRoute(w, 14)
    expect(w.find('[data-check="rebind"]').exists()).toBe(true)
    await w.find('.btn-primary').trigger('click')
    await flushPromises()
    // 未确认前不发请求
    expect(mockPut).not.toHaveBeenCalled()
    expect(dangerConfirm).toHaveBeenCalledTimes(1)
    const [title, content, okText] = dangerConfirm.mock.calls[0]
    expect(title).toBe('换绑路由')
    expect(String(content)).toContain('需重新上传并发布')
    expect(okText).toBe('确认换绑')
    const onOk = dangerConfirm.mock.calls[0][3] as () => Promise<void>
    await onOk()
    await flushPromises()
    expect(mockPut).toHaveBeenCalledWith('/clusters/7/static-resources/1', { description: '门户', route_id: 14 })
  })
})
