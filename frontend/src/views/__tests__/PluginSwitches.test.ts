import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

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
    template: '<a class="mock-router-link" :data-to="to"><slot /></a>',
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
  AInputSearch: {
    template:
      '<div class="mock-search"><input class="mock-search-input" :value="value" @input="$emit(\'update:value\', $event.target.value)" /></div>',
    props: ['value', 'placeholder'],
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
    schema: '{"allow_origins": "*"}',
  },
  {
    name: 'proxy_rewrite',
    display_name: '代理重写',
    category: 'rewrite',
    description: '代理重写',
    schema: '{"uri": "/new"}',
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
    expect(wrapper.find('.plugin-grid').exists()).toBe(true)
  })

  // 3.2 — Card structure
  it('renders each plugin as a card with header, desc, footer', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const cards = wrapper.findAll('.plugin-card')
    expect(cards.length).toBe(MOCK_PLUGINS.length)
    cards.forEach((card, i) => {
      expect(card.find('.plugin-card-name').exists()).toBe(true)
      expect(card.find('.plugin-card-desc').exists()).toBe(true)
      expect(card.find('.plugin-card-footer').exists()).toBe(true)
    })
  })

  it('shows display_name and category tag in card header', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const firstCard = wrapper.find('.plugin-card')
    expect(firstCard.text()).toContain('CORS')
    expect(firstCard.find('.plugin-card-category').exists()).toBe(true)
  })

  it('shows plugin name in card footer', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const footer = wrapper.find('.plugin-card-footer')
    expect(footer.text()).toContain('cors')
  })

  it('has schema toggle link in card footer', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const footer = wrapper.find('.plugin-card-footer')
    expect(footer.find('.plugin-schema-toggle').exists()).toBe(true)
  })

  it('has toggle switch in card footer (a-switch 统一，无自定义 toggle)', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const footer = wrapper.find('.plugin-card-footer')
    expect(footer.find('.mock-switch').exists()).toBe(true)
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
    expect(wrapper.find('.plugin-card.disabled-state').exists()).toBe(true)
    // 未保存的禁用与已保存禁用可区分：虚线框标识
    expect(wrapper.find('.plugin-card.unsaved-disabled').exists()).toBe(true)
  })

  // 3.3 — Category pills
  it('renders category filter pills from plugin data', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const pills = wrapper.findAll('.plugin-cat')
    expect(pills.length).toBeGreaterThanOrEqual(2)
    expect(pills[0].text()).toContain('全部')
  })

  it('filters cards when category pill is clicked', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    // Click "auth" pill
    const authPill = wrapper.findAll('.plugin-cat').filter((w) => w.text().includes('认证'))
    expect(authPill.length).toBeGreaterThan(0)
    await authPill[0].trigger('click')
    await wrapper.vm.$nextTick()
    const cards = wrapper.findAll('.plugin-card')
    expect(cards.length).toBe(1) // only auth_basic
    expect(cards[0].text()).toContain('Basic 认证')
  })

  // 3.4 — Search
  it('filters cards by search text', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const searchInput = wrapper.find('.mock-search-input')
    await searchInput.setValue('CORS')
    await wrapper.vm.$nextTick()
    const cards = wrapper.findAll('.plugin-card')
    expect(cards.length).toBe(1)
    expect(cards[0].text()).toContain('CORS')
  })

  // 3.5 — Status filter + count
  it('filters cards by status dropdown', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    // Toggle first plugin off to have a disabled one
    await wrapper.find('.mock-switch').trigger('click')
    await wrapper.vm.$nextTick()
    // Select "已禁用" from status filter
    const select = wrapper.find('.mock-select select')
    await select.setValue('disabled')
    await wrapper.vm.$nextTick()
    const cards = wrapper.findAll('.plugin-card')
    // Only the toggled-off plugin should show (has class disabled-state)
    expect(cards.length).toBeGreaterThanOrEqual(1)
    cards.forEach((c) => expect(c.classes()).toContain('disabled-state'))
  })

  it('过滤条不再重复「共 N 个插件」计数（双计数合并，批 3）', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.plugin-count').exists()).toBe(false)
  })

  // 3.6 — Schema toggle
  it('toggles schema visibility on click', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const toggle = wrapper.find('.plugin-schema-toggle')
    // Initially schema box is hidden
    expect(wrapper.find('.plugin-schema-box.visible').exists()).toBe(false)
    // Click to open
    await toggle.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.plugin-schema-box.visible').exists()).toBe(true)
    // Click to close
    await toggle.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.plugin-schema-box.visible').exists()).toBe(false)
  })

  // 3.7 — Status bar + batch + unsaved + save + guard
  it('shows status bar with enabled / total count', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const statusBar = wrapper.find('.switch-status-bar')
    expect(statusBar.exists()).toBe(true)
    expect(statusBar.text()).toContain('4')
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

  it('全部禁用需确认（列影响 + 需保存生效），确认后仅本地标记', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    mockApiPut.mockClear()
    await wrapper
      .findAll('.mock-btn')
      .filter((b) => b.text().includes('全部禁用'))[0]
      .trigger('click')
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
    await wrapper
      .findAll('.mock-btn')
      .filter((b) => b.text().includes('全部禁用'))[0]
      .trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper
      .find('.modal')
      .findAll('.btn')
      .filter((b) => b.text().includes('继续标记'))[0]
      .trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper
      .findAll('.mock-btn')
      .filter((b) => b.text().includes('全部启用'))[0]
      .trigger('click')
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

  it('卡片引用徽标：被引用显示「被引用 路由 2」，无引用不显示', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const corsCard = wrapper.findAll('.plugin-card').find((c) => c.text().includes('cors'))
    expect(corsCard!.find('.plugin-refs').exists()).toBe(true)
    expect(corsCard!.find('.plugin-refs').text()).toContain('路由 2')
    const monitorCard = wrapper.findAll('.plugin-card').find((c) => c.text().includes('monitor'))
    expect(monitorCard!.find('.plugin-refs').exists()).toBe(false)
  })

  it('禁用被引用插件：行内即时警示（新配置不可选 / 既有配置不受影响）', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const corsCard = wrapper.findAll('.plugin-card').find((c) => c.text().includes('cors'))!
    expect(corsCard.find('.plugin-ref-warning').exists()).toBe(false)
    await corsCard.find('.mock-switch').trigger('click')
    await wrapper.vm.$nextTick()
    const warn = wrapper.findAll('.plugin-card')[0].find('.plugin-ref-warning')
    expect(warn.exists()).toBe(true)
    expect(warn.text()).toContain('新配置不可选')
    expect(warn.text()).toContain('既有配置不受影响')
  })

  it('文案：header 说明新语义、⚙ 配置结构替代 schema、技术名标签、空 schema 无参数、操作日志入口', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('控制各插件在新配置中的可选性')
    expect(wrapper.text()).toContain('禁用不影响既有配置')
    const footer = wrapper.find('.plugin-card-footer')
    expect(footer.text()).toContain('技术名')
    expect(footer.text()).toContain('配置结构')
    expect(wrapper.text()).not.toContain('⚙ schema')
    // 空 schema 卡显示 无参数
    const emptyCard = wrapper.findAll('.plugin-card').find((c) => c.text().includes('Basic 认证'))!
    expect(emptyCard.find('.plugin-schema-none').exists()).toBe(true)
    // 操作日志入口
    const auditLink = wrapper.findAll('.mock-router-link').find((a) => a.text().includes('操作日志'))
    expect(auditLink).toBeDefined()
    expect(auditLink!.attributes('data-to')).toBe('/audit-log')
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
