import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'

const mockApiGet = vi.fn()
const mockApiPut = vi.fn()
const mockMessageSuccess = vi.fn()
const mockMessageError = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    put: (...args: any[]) => mockApiPut(...args),
  },
}))

const mockRouterPush = vi.fn()
vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  useRouter: () => ({ push: mockRouterPush }),
  useRoute: () => ({ name: 'PluginSwitches', query: {} }),
}))

vi.mock('ant-design-vue', () => ({
  message: {
    success: (...a: any[]) => mockMessageSuccess(...a),
    error: (...a: any[]) => mockMessageError(...a),
  },
}))

const stubs = {
  PageHeader: {
    template:
      '<div class="page-header"><div class="page-header-info"><h1>{{ title }}</h1><p v-if="description">{{ description }}</p></div><div class="page-header-actions"><slot name="actions" /></div></div>',
    props: ['title', 'description'],
  },
  RouterLink: {
    template: '<a class="mock-router-link" :data-to="typeof to === \'string\' ? to : JSON.stringify(to)"><slot /></a>',
    props: ['to'],
  },
  ASwitch: {
    template:
      '<button class="mock-switch" role="switch" :aria-checked="String(checked)" @click="$emit(\'change\', !checked)"></button>',
    props: ['checked', 'size'],
    emits: ['change'],
  },
  AButton: {
    template: '<button class="mock-btn" @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'loading', 'size'],
  },
  ASelect: {
    template:
      '<div class="mock-select"><select :value="value" @change="$emit(\'update:value\', $event.target.value)"><slot /></select></div>',
    props: ['value'],
  },
  ASelectOption: {
    template: '<option :value="value"><slot /></option>',
    props: ['value'],
  },
}

const MOCK_PLUGINS = [
  {
    name: 'cors',
    display_name: 'CORS',
    category: 'rewrite',
    description: '跨域资源共享',
    schema: { allow_origins: '*' },
  },
  {
    name: 'proxy_rewrite',
    display_name: '代理重写',
    category: 'rewrite',
    description: '代理重写',
    schema: { uri: '/new' },
  },
  { name: 'auth_basic', display_name: 'Basic 认证', category: 'auth', description: 'Basic 认证', schema: {} },
  { name: 'monitor', display_name: '监控', category: 'monitor', description: '监控统计', schema: '{}' },
]

// 可见弹窗选择：页面有多个 .modal-overlay（确认/守卫/警告），只取 display:flex 的
function visibleModal(wrapper: ReturnType<typeof mount>) {
  const overlay = wrapper.findAll('.modal-overlay').filter((m) => m.attributes('style')?.includes('flex'))[0]
  return overlay.find('.modal')
}

describe('PluginSwitches.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // 页头「操作日志」入口带 canViewAudit 门控：测试身份给 admin（hasPermission 直通）
    const authStore = useAuthStore()
    authStore.user = { id: 1, username: 'admin', role: 'admin' } as never
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/plugin-switches') {
        return Promise.resolve({
          data: {
            items: [{ plugin_name: 'cors', enabled: true }],
            refs: {
              cors: { routes: 2, plugin_configs: 1, global_rules: 0 },
              proxy_rewrite: { routes: 0, plugin_configs: 0, global_rules: 0 },
              auth_basic: { routes: 0, plugin_configs: 0, global_rules: 0 },
              monitor: { routes: 0, plugin_configs: 0, global_rules: 0 },
            },
          },
        })
      }
      if (url === '/plugins/builtin') {
        return Promise.resolve({ data: { plugins: MOCK_PLUGINS } })
      }
      return Promise.reject(new Error('unknown url'))
    })
    mockApiPut.mockResolvedValue({ data: { message: 'ok' } })
  })

  // 3.1 — CSS Grid layout
  it('renders plugin grid container', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    // 21.9b2 卡片页推广：网格挂共享 card-grid + l5-panel 解剖（无集群维度：无 band/seg）
    expect(wrapper.find('.ps-grid.card-grid').exists()).toBe(true)
    expect(wrapper.findAll('.ps-card.l5-panel').length).toBe(MOCK_PLUGINS.length)
  })

  // 3.2 — Card structure
  it('renders each plugin as a card with header, desc, footer', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const cards = wrapper.findAll('.ps-card')
    expect(cards.length).toBe(MOCK_PLUGINS.length)
    cards.forEach((card) => {
      // r14 解剖：lp-head / lp-body / lp-foot 三段
      expect(card.find('.lp-head').exists()).toBe(true)
      expect(card.find('.lp-body').exists()).toBe(true)
      expect(card.find('.lp-foot').exists()).toBe(true)
    })
  })

  it('shows display_name and category tag in card header', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const firstCard = wrapper.find('.ps-card')
    expect(firstCard.text()).toContain('CORS')
    // 批 5（r29 同款）：中文优先 + 裸技术名走弱化 tech 标签；分类为 lp-tag
    expect(firstCard.find('.lp-name').exists()).toBe(true)
    expect(firstCard.find('.lp-tag.tech').exists()).toBe(true)
    expect(firstCard.find('.lp-tag.tech').text()).toBe('cors')
  })

  it('shows plugin tech name in card head (lp-tag tech，弱化标识)', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const head = wrapper.find('.ps-card .lp-head')
    expect(head.text()).toContain('cors')
  })

  it('has 参数定义 op-pub in card footer (r26 同款折叠块入口)', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const footer = wrapper.find('.ps-card .lp-foot')
    expect(footer.find('.op-pub').exists()).toBe(true)
    expect(footer.find('.op-pub').text()).toContain('参数定义')
    // 点击展开 lp-json 折叠块
    await footer.find('.op-pub').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.lp-json').exists()).toBe(true)
  })

  it('has toggle switch in card head lp-status（设计稿：开关与启用文案同位）', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const status = wrapper.find('.ps-card .lp-status')
    expect(status.find('.mock-switch').exists()).toBe(true)
    expect(status.text()).toContain('已启用')
    expect(wrapper.find('.toggle').exists()).toBe(false)
  })

  it('applies disabled-state class when plugin is disabled', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    // Toggle first plugin off
    await wrapper.find('.mock-switch').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.ps-card.is-off').exists()).toBe(true)
    // 未保存的禁用与已保存禁用可区分：虚线框标识
    expect(wrapper.find('.ps-card.unsaved-disabled').exists()).toBe(true)
  })

  // 3.3 — Category pills
  it('分类筛选收进工具条下拉（设计稿：全部分类 + 分类清单），状态归 chips', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    // 分类 pills 退场 → 工具条 select（原生，l5-select）
    expect(wrapper.findAll('.plugin-cat').length).toBe(0)
    const catSelect = wrapper.find('select.l5-select')
    expect(catSelect.exists()).toBe(true)
    const options = catSelect.findAll('option').map((o) => o.text())
    expect(options).toContain('全部分类')
    expect(options).toContain('认证')
  })

  it('filters cards when category select changes', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const catSelect = wrapper.find('select.l5-select')
    await catSelect.setValue('auth')
    await wrapper.vm.$nextTick()
    const cards = wrapper.findAll('.ps-card')
    expect(cards.length).toBe(1) // only auth_basic
    expect(cards[0].text()).toContain('Basic 认证')
  })

  // 3.4 — Search
  it('filters cards by search text', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const searchInput = wrapper.find('.search-input-wrap input')
    await searchInput.setValue('CORS')
    await wrapper.vm.$nextTick()
    const cards = wrapper.findAll('.ps-card')
    expect(cards.length).toBe(1)
    expect(cards[0].text()).toContain('CORS')
  })

  // 3.5 — Status filter + count
  it('filters cards by status chips', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    // Toggle first plugin off to have a disabled one
    await wrapper.find('.mock-switch').trigger('click')
    await wrapper.vm.$nextTick()
    // 点「已禁用」chip（filter-architecture：状态 = chips 单一形态）
    const chip = wrapper.findAll('.f-chip.chip-status').find((c) => c.text().includes('已禁用'))!
    await chip.trigger('click')
    await wrapper.vm.$nextTick()
    const cards = wrapper.findAll('.ps-card')
    // Only the toggled-off plugin should show (has class is-off)
    expect(cards.length).toBeGreaterThanOrEqual(1)
    cards.forEach((c) => expect(c.classes()).toContain('is-off'))
  })

  it('过滤条不再重复「共 N 个插件」计数（双计数合并，批 3）', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.plugin-count').exists()).toBe(false)
  })

  // 3.6 — Schema toggle
  it('参数定义切换 lp-json 折叠块显隐（批 7 同款：默认收起）', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const toggle = wrapper.find('.ps-card .op-pub')
    // Initially schema block hidden
    expect(wrapper.find('.lp-json').exists()).toBe(false)
    // Click to open
    await toggle.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.lp-json').exists()).toBe(true)
    // Click to close
    await toggle.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.lp-json').exists()).toBe(false)
  })

  // 3.7 — Status bar + batch + unsaved + save + guard
  it('状态条退场：计数归 chips「全部/已启用/已禁用」（AGENTS #86）', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.switch-status-bar').exists()).toBe(false)
    // mock 种子：仅 cors 显式 true，其余缺省启用（既有语义）→ 全 4 启用
    const labels = wrapper.findAll('.f-chip.chip-status').map((c) => c.text())
    expect(labels.some((t) => t.includes('全部') && t.includes('4'))).toBe(true)
    expect(labels.some((t) => t.includes('已启用') && t.includes('4'))).toBe(true)
    expect(labels.some((t) => t.includes('已禁用') && t.includes('0'))).toBe(true)
  })

  it('detects unsaved changes after toggle (sticky 保存条)', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.save-bar-sticky').exists()).toBe(false)
    await wrapper.find('.mock-switch').trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.save-bar-sticky').exists()).toBe(true)
    expect(wrapper.find('.save-bar-sticky').text()).toContain('1 项未保存')
  })

  it('放弃更改：还原快照、零请求、保存条消失', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    await wrapper.find('.mock-switch').trigger('click')
    await wrapper.vm.$nextTick()
    mockApiPut.mockClear()
    await wrapper
      .findAll('.mock-btn')
      .filter((b) => b.text().includes('放弃更改'))[0]
      .trigger('click')
    await wrapper.vm.$nextTick()
    expect(mockApiPut).not.toHaveBeenCalled()
    expect(wrapper.find('.save-bar-sticky').exists()).toBe(false)
    expect((wrapper.find('.mock-switch').element as HTMLElement).getAttribute('aria-checked')).toBe('true')
  })

  it('beforeunload 守卫随未保存状态挂载/卸载', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    await wrapper.find('.mock-switch').trigger('click')
    await wrapper.vm.$nextTick()
    expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    await wrapper
      .findAll('.mock-btn')
      .filter((b) => b.text().includes('放弃更改'))[0]
      .trigger('click')
    await wrapper.vm.$nextTick()
    expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function))
    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('全部禁用需确认（列影响 + 需保存生效），确认后仅本地标记（工具条入口）', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    mockApiPut.mockClear()
    await wrapper.find('[data-test="disable-all"]').trigger('click')
    await wrapper.vm.$nextTick()
    // 确认弹窗出现，说明后果与「需保存生效」；开关尚未变化
    const modal = wrapper.find('.modal')
    expect(modal.exists()).toBe(true)
    expect(modal.text()).toContain('需保存生效')
    expect(modal.text()).toContain('无法选择任何插件')
    wrapper.findAll('.mock-switch').forEach((s) => {
      expect(s.attributes('aria-checked')).toBe('true')
    })
    // 确认后全部本地禁用 + 保存条浮现，仍未发请求
    await modal
      .findAll('.btn')
      .filter((b) => b.text().includes('继续标记'))[0]
      .trigger('click')
    await wrapper.vm.$nextTick()
    wrapper.findAll('.mock-switch').forEach((s) => {
      expect(s.attributes('aria-checked')).toBe('false')
    })
    expect(wrapper.find('.save-bar-sticky').exists()).toBe(true)
    expect(mockApiPut).not.toHaveBeenCalled()
  })

  it('全部启用同样经确认后本地标记', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-test="disable-all"]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper
      .find('.modal')
      .findAll('.btn')
      .filter((b) => b.text().includes('继续标记'))[0]
      .trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.find('[data-test="enable-all"]').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper
      .find('.modal')
      .findAll('.btn')
      .filter((b) => b.text().includes('继续标记'))[0]
      .trigger('click')
    await wrapper.vm.$nextTick()
    wrapper.findAll('.mock-switch').forEach((s) => {
      expect(s.attributes('aria-checked')).toBe('true')
    })
  })

  it('保存按钮在 sticky 保存条内并调 PUT；无警告时 toast 而非强模态', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    await wrapper.findAll('.mock-switch')[1].trigger('click') // proxy_rewrite 无引用
    await wrapper.vm.$nextTick()
    const saveBtn = wrapper
      .find('.save-bar-sticky')
      .findAll('.mock-btn')
      .filter((b) => b.text().includes('保存配置'))[0]
    await saveBtn.trigger('click')
    await flushPromises()
    expect(mockApiPut).toHaveBeenCalledWith('/plugin-switches', expect.any(Array))
    expect(mockMessageSuccess).toHaveBeenCalled()
    // 无引用警告 → 不弹 infoModal（信息弹窗仅留给警告）
    const visibleModals = wrapper.findAll('.modal-overlay').filter((m) => m.attributes('style')?.includes('flex'))
    expect(visibleModals.length).toBe(0)
  })

  it('引用警告弹窗：后果语义 + 查看引用 + 还原被引用插件', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    mockApiPut.mockResolvedValue({
      data: {
        message: 'ok',
        warnings: [{ plugin: 'cors', refs: { routes: 2, plugin_configs: 1, global_rules: 0 } }],
      },
    })
    await wrapper.findAll('.mock-switch')[0].trigger('click') // cors 有引用
    await wrapper.vm.$nextTick()
    await wrapper
      .find('.save-bar-sticky')
      .findAll('.mock-btn')
      .filter((b) => b.text().includes('保存配置'))[0]
      .trigger('click')
    await flushPromises()
    const modal = visibleModal(wrapper)
    expect(modal.text()).toContain('插件已从可选清单移除')
    expect(modal.text()).toContain('既有配置中的引用将继续生效')
    expect(modal.text()).toContain('路由 2')
    const viewRef = modal.findAll('.mock-router-link').find((a) => a.text().includes('查看引用'))
    expect(viewRef).toBeDefined()
    expect(viewRef!.attributes('data-to')).toBe('/routes?search=cors')
    // 还原被引用插件：本地拨回启用 + 保存条重现（回到未保存态）
    await modal
      .findAll('.btn')
      .filter((b) => b.text().includes('还原被引用插件'))[0]
      .trigger('click')
    await wrapper.vm.$nextTick()
    expect((wrapper.find('.mock-switch').element as HTMLElement).getAttribute('aria-checked')).toBe('true')
    expect(wrapper.find('.save-bar-sticky').exists()).toBe(true)
  })

  it('引用行：被引用显示「路由 2 · 插件组 1」，无引用显示「未引用」', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const corsCard = wrapper.findAll('.ps-card').find((c) => c.text().includes('CORS'))!
    const corsRefs = corsCard.findAll('.lp-row').find((r) => r.find('.lp-k').text() === '引用')!
    expect(corsRefs.find('.lp-v').text()).toContain('路由 2')
    expect(corsRefs.find('.lp-v').text()).toContain('插件组 1')
    const monitorCard = wrapper.findAll('.ps-card').find((c) => c.text().includes('监控'))!
    const monitorRefs = monitorCard.findAll('.lp-row').find((r) => r.find('.lp-k').text() === '引用')!
    expect(monitorRefs.text()).toContain('未引用')
  })

  it('禁用被引用插件：行内即时警示（新配置不可选 / 既有配置不受影响）', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const corsCard = wrapper.findAll('.ps-card').find((c) => c.text().includes('CORS'))!
    expect(corsCard.find('.lp-notice').exists()).toBe(false)
    await corsCard.find('.mock-switch').trigger('click')
    await wrapper.vm.$nextTick()
    const warn = wrapper.findAll('.ps-card')[0].find('.lp-notice')
    expect(warn.exists()).toBe(true)
    expect(warn.classes()).toContain('alert-warning')
    expect(warn.text()).toContain('既有配置继续生效')
    expect(warn.text()).toContain('新配置不可再选择')
  })

  it('文案：header 说明新语义、⚙ 配置结构替代 schema、技术名标签、空 schema 无参数、操作日志入口', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('控制各插件在新配置中的可选性')
    expect(wrapper.text()).toContain('禁用不影响既有配置')
    // 技术名 = head 的弱化 tech 标签；参数定义 = lp-foot op-pub（r29：目录级静态属性不出徽标）
    const head = wrapper.find('.ps-card .lp-head')
    expect(head.text()).toContain('cors')
    const footers = wrapper.findAll('.ps-card .lp-foot')
    expect(footers.filter((f) => f.text().includes('参数定义')).length).toBeGreaterThan(0)
    expect(wrapper.text()).not.toContain('⚙ schema')
    // 空 schema 卡显示 无参数（lp-body 参数行 dim）
    const emptyCard = wrapper.findAll('.ps-card').find((c) => c.text().includes('Basic 认证'))!
    const paramRow = emptyCard.findAll('.lp-row').find((r) => r.find('.lp-k').text() === '参数')!
    expect(paramRow.text()).toContain('无参数')
    // 操作日志入口：按钮形态 + 审计页深链携带资源预选（与自启动/主机清单/ClickHouse 同机制）
    const auditLink = wrapper.findAll('.mock-router-link').find((a) => a.text().includes('操作日志'))
    expect(auditLink).toBeDefined()
    const toVal = JSON.parse(auditLink!.attributes('data-to')!)
    expect(toVal.path).toBe('/audit-log')
    expect(toVal.query).toEqual({ resource: 'plugin_switch' })
    expect(auditLink!.classes()).toContain('btn-secondary')
  })

  it('离开守卫：三动作（取消/离开/保存并离开），保存并离开先 PUT 再放行', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    await wrapper.findAll('.mock-switch')[1].trigger('click')
    await wrapper.vm.$nextTick()
    mockApiPut.mockClear()
    const vm = wrapper.vm as unknown as { requestLeave: () => Promise<boolean> }
    const p = vm.requestLeave()
    await wrapper.vm.$nextTick()
    const modal = visibleModal(wrapper)
    expect(modal.text()).toContain('保存并离开')
    await modal
      .findAll('.btn')
      .filter((b) => b.text().includes('保存并离开'))[0]
      .trigger('click')
    const allowed = await p
    expect(mockApiPut).toHaveBeenCalled()
    expect(allowed).toBe(true)
  })

  it('离开守卫：离开（放弃）直接放行不保存；取消停留', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    await wrapper.findAll('.mock-switch')[1].trigger('click')
    await wrapper.vm.$nextTick()
    mockApiPut.mockClear()
    const vm = wrapper.vm as unknown as { requestLeave: () => Promise<boolean> }
    const p1 = vm.requestLeave()
    await wrapper.vm.$nextTick()
    await visibleModal(wrapper)
      .findAll('.btn')
      .filter((b) => b.text().includes('离开'))[0]
      .trigger('click')
    expect(await p1).toBe(true)
    expect(mockApiPut).not.toHaveBeenCalled()
    const p2 = vm.requestLeave()
    await wrapper.vm.$nextTick()
    await visibleModal(wrapper)
      .findAll('.btn')
      .filter((b) => b.text().includes('取消'))[0]
      .trigger('click')
    expect(await p2).toBe(false)
  })
})

describe('PluginSwitches 批 7 bugfix（2026-11-19 用户上报四条）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const authStore = useAuthStore()
    authStore.user = { id: 1, username: 'admin', role: 'admin' } as never
    vi.clearAllMocks()
    mockRouterPush.mockClear()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/plugin-switches') {
        return Promise.resolve({
          data: {
            items: [{ plugin_name: 'cors', enabled: true }],
            refs: {
              cors: { routes: 2, plugin_configs: 1, global_rules: 3 },
              proxy_rewrite: { routes: 0, plugin_configs: 0, global_rules: 0 },
              auth_basic: { routes: 0, plugin_configs: 0, global_rules: 0 },
              monitor: { routes: 0, plugin_configs: 0, global_rules: 0 },
            },
          },
        })
      }
      if (url === '/plugins/builtin') return Promise.resolve({ data: { plugins: MOCK_PLUGINS } })
      return Promise.reject(new Error('unknown url'))
    })
    mockApiPut.mockResolvedValue({ data: {} })
  })

  it('bug1：lp-json 折叠块在 lp-foot 之后（卡底展开，不顶跑按钮）', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const card = wrapper.findAll('.ps-card')[0]
    await card.find('.op-pub').trigger('click')
    await wrapper.vm.$nextTick()
    // 源序：lp-foot 在 lp-json 之前
    const footIdx = card.html().indexOf('lp-foot')
    const jsonIdx = card.html().indexOf('lp-json')
    expect(footIdx).toBeGreaterThan(-1)
    expect(jsonIdx).toBeGreaterThan(footIdx)
  })

  it('bug2：无参数定义的卡「参数定义」恒渲染（disabled + 指路 title），⋯ 恒置右', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const noSchema = wrapper.findAll('.ps-card').find((c) => c.text().includes('Basic 认证'))!
    const btn = noSchema.find('.lp-foot .op-pub')
    expect(btn.exists()).toBe(true)
    expect(btn.attributes('disabled')).toBeDefined()
    expect(btn.attributes('title')).toBe('该插件无参数定义')
    // 有参数卡：按钮可用
    const hasSchema = wrapper.findAll('.ps-card').find((c) => c.text().includes('CORS'))!
    expect(hasSchema.find('.lp-foot .op-pub').attributes('disabled')).toBeUndefined()
  })

  it('bug3：全部启用/全部禁用为带图标按钮（设计稿勾/横线）', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    for (const t of ['enable-all', 'disable-all']) {
      const btn = wrapper.find(`[data-test="${t}"]`)
      expect(btn.find('svg').exists()).toBe(true)
    }
  })

  it('bug4A：⋯ 菜单按引用源拆项（路由/插件组/全局规则各一项），深链走 ?plugin=', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const corsCard = wrapper.findAll('.ps-card').find((c) => c.text().includes('CORS'))!
    await corsCard.find('.op-btn').trigger('click')
    await wrapper.vm.$nextTick()
    const menu = corsCard.find('.l5-menu')
    expect(menu.text()).toContain('查看引用（路由 2）')
    expect(menu.text()).toContain('查看引用（插件组 1）')
    expect(menu.text()).toContain('查看引用（全局规则 3）')
    // 三腿深链各走 ?plugin=
    const items = menu.findAll('.mi').filter((m) => m.text().includes('查看引用'))
    await items[0].trigger('click')
    expect(mockRouterPush).toHaveBeenLastCalledWith('/routes?plugin=cors')
    await items[1].trigger('click')
    expect(mockRouterPush).toHaveBeenLastCalledWith('/plugin-configs?plugin=cors')
    await items[2].trigger('click')
    expect(mockRouterPush).toHaveBeenLastCalledWith('/global-rules?plugin=cors')
    // 无引用插件：菜单无「查看引用」项
    const noRef = wrapper.findAll('.ps-card').find((c) => c.text().includes('监控'))!
    await noRef.find('.op-btn').trigger('click')
    await wrapper.vm.$nextTick()
    expect(noRef.find('.l5-menu').text()).not.toContain('查看引用')
  })
})
