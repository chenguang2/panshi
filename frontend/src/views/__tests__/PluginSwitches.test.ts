import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const mockApiGet = vi.fn()
const mockApiPut = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    put: (...args: any[]) => mockApiPut(...args),
  }
}))

const stubs = {
  PageHeader: {
    template: '<div class="page-header"><slot /></div>',
    props: ['title', 'description']
  },
  AButton: {
    template: '<button class="mock-btn" @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'loading', 'size']
  },
  AInputSearch: {
    template: '<div class="mock-search"><input class="mock-search-input" :value="value" @input="$emit(\'update:value\', $event.target.value)" /></div>',
    props: ['value', 'placeholder']
  },
  ASelect: {
    template: '<div class="mock-select"><select :value="value" @change="$emit(\'update:value\', $event.target.value)"><slot /></select></div>',
    props: ['value']
  },
  ASelectOption: {
    template: '<option :value="value"><slot /></option>',
    props: ['value']
  },
}

const MOCK_PLUGINS = [
  { name: 'cors', display_name: 'CORS', category: 'rewrite', description: '跨域资源共享', schema: '{"allow_origins": "*"}' },
  { name: 'proxy_rewrite', display_name: '代理重写', category: 'rewrite', description: '代理重写', schema: '{"uri": "/new"}' },
  { name: 'auth_basic', display_name: 'Basic 认证', category: 'auth', description: 'Basic 认证', schema: '{}' },
  { name: 'monitor', display_name: '监控', category: 'monitor', description: '监控统计', schema: '{}' },
]

describe('PluginSwitches.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/plugin-switches') {
        return Promise.resolve({ data: { items: [{ plugin_name: 'cors', enabled: true }] } })
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
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.plugin-grid').exists()).toBe(true)
  })

  // 3.2 — Card structure
  it('renders each plugin as a card with header, desc, footer', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await new Promise(r => setTimeout(r, 50))
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
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()
    const firstCard = wrapper.find('.plugin-card')
    expect(firstCard.text()).toContain('CORS')
    expect(firstCard.find('.plugin-card-category').exists()).toBe(true)
  })

  it('shows plugin name in card footer', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()
    const footer = wrapper.find('.plugin-card-footer')
    expect(footer.text()).toContain('cors')
  })

  it('has schema toggle link in card footer', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()
    const footer = wrapper.find('.plugin-card-footer')
    expect(footer.find('.plugin-schema-toggle').exists()).toBe(true)
  })

  it('has toggle switch in card footer', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()
    const footer = wrapper.find('.plugin-card-footer')
    expect(footer.find('.toggle').exists()).toBe(true)
  })

  it('applies disabled-state class when plugin is disabled', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()
    // Toggle first plugin off
    const firstToggle = wrapper.find('.toggle input')
    await firstToggle.setValue(false)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.plugin-card.disabled-state').exists()).toBe(true)
  })

  // 3.3 — Category pills
  it('renders category filter pills from plugin data', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()
    const pills = wrapper.findAll('.plugin-cat')
    expect(pills.length).toBeGreaterThanOrEqual(2)
    expect(pills[0].text()).toContain('全部')
  })

  it('filters cards when category pill is clicked', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()
    // Click "auth" pill
    const authPill = wrapper.findAll('.plugin-cat').filter(w => w.text().includes('认证'))
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
    await new Promise(r => setTimeout(r, 50))
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
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()
    // Toggle first plugin off to have a disabled one
    await wrapper.find('.toggle input').setValue(false)
    await wrapper.vm.$nextTick()
    // Select "已禁用" from status filter
    const select = wrapper.find('.mock-select select')
    await select.setValue('disabled')
    await wrapper.vm.$nextTick()
    const cards = wrapper.findAll('.plugin-card')
    // Only the toggled-off plugin should show (has class disabled-state)
    expect(cards.length).toBeGreaterThanOrEqual(1)
    cards.forEach(c => expect(c.classes()).toContain('disabled-state'))
  })

  it('shows filtered plugin count text', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.plugin-count').exists()).toBe(true)
    expect(wrapper.find('.plugin-count').text()).toContain('4')
  })

  // 3.6 — Schema toggle
  it('toggles schema visibility on click', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await new Promise(r => setTimeout(r, 50))
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
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()
    const statusBar = wrapper.find('.switch-status-bar')
    expect(statusBar.exists()).toBe(true)
    expect(statusBar.text()).toContain('4')
  })

  it('detects unsaved changes after toggle', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.unsaved-hint').exists()).toBe(false)
    await wrapper.find('.toggle input').setValue(false)
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.unsaved-hint').exists()).toBe(true)
  })

  it('batch disable all works', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()
    const disableBtn = wrapper.findAll('.mock-btn').filter(b => b.text().includes('全部禁用'))
    await disableBtn[0].trigger('click')
    await wrapper.vm.$nextTick()
    wrapper.findAll('.toggle input').forEach(s => {
      expect((s.element as HTMLInputElement).checked).toBe(false)
    })
  })

  it('batch enable all works after disable', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()
    await wrapper.findAll('.mock-btn').filter(b => b.text().includes('全部禁用'))[0].trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.findAll('.mock-btn').filter(b => b.text().includes('全部启用'))[0].trigger('click')
    await wrapper.vm.$nextTick()
    wrapper.findAll('.toggle input').forEach(s => {
      expect((s.element as HTMLInputElement).checked).toBe(true)
    })
  })

  it('save button calls PUT API', async () => {
    const PluginSwitches = (await import('../PluginSwitches.vue')).default
    const wrapper = mount(PluginSwitches, { global: { stubs } })
    await new Promise(r => setTimeout(r, 50))
    await wrapper.vm.$nextTick()
    await wrapper.find('.toggle input').setValue(false)
    await wrapper.vm.$nextTick()
    const saveBtn = wrapper.findAll('.mock-btn').filter(b => b.text().includes('保存配置'))
    await saveBtn[0].trigger('click')
    await wrapper.vm.$nextTick()
    expect(mockApiPut).toHaveBeenCalledWith('/plugin-switches', expect.any(Array))
  })
})
