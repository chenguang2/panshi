import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

describe('HealthCheckForm.vue', () => {
  it('renders mode radio buttons when enabled', async () => {
    const HealthCheckForm = (await import('../HealthCheckForm.vue')).default
    const wrapper = mount(HealthCheckForm, {
      props: {
        checks: null,
        enabled: true,
      },
    })
    expect(wrapper.text()).toContain('仅主动检查')
    expect(wrapper.text()).toContain('仅被动检查')
    expect(wrapper.text()).toContain('主动+被动')
  })

  it('renders disabled state when not enabled', async () => {
    const HealthCheckForm = (await import('../HealthCheckForm.vue')).default
    const wrapper = mount(HealthCheckForm, {
      props: {
        checks: null,
        enabled: false,
      },
    })
    const radios = wrapper.findAll('input[type="radio"]')
    expect(radios.length).toBeGreaterThan(0)
    radios.forEach(radio => {
      expect(radio.attributes('disabled')).toBeDefined()
    })
  })

  describe('active check fields', () => {
    it('renders active check section by default', async () => {
      const HealthCheckForm = (await import('../HealthCheckForm.vue')).default
      const wrapper = mount(HealthCheckForm, {
        props: { checks: null, enabled: true },
      })
      expect(wrapper.text()).toContain('主动检查配置')
      expect(wrapper.text()).toContain('检查类型')
      expect(wrapper.text()).toContain('检查路径')
      expect(wrapper.text()).toContain('超时')
      expect(wrapper.text()).toContain('间隔')
      expect(wrapper.text()).toContain('并发')
    })

    it('uses default values for active fields', async () => {
      const HealthCheckForm = (await import('../HealthCheckForm.vue')).default
      const wrapper = mount(HealthCheckForm, {
        props: { checks: null, enabled: true },
      })
      const selects = wrapper.findAll('select')
      const typeSelect = selects.find(s => [...s.element.options].some(o => o.value === 'http'))
      if (typeSelect) {
        expect((typeSelect.element as HTMLSelectElement).value).toBe('http')
      }
    })

    it('renders healthy/unhealthy collapsible sections', async () => {
      const HealthCheckForm = (await import('../HealthCheckForm.vue')).default
      const wrapper = mount(HealthCheckForm, {
        props: { checks: null, enabled: true },
      })
      expect(wrapper.text()).toContain('健康判断')
      expect(wrapper.text()).toContain('不健康判断')
    })

    it('shows healthy fields with defaults', async () => {
      const HealthCheckForm = (await import('../HealthCheckForm.vue')).default
      const wrapper = mount(HealthCheckForm, {
        props: { checks: null, enabled: true },
      })
      expect(wrapper.text()).toContain('连续成功次数')
      expect(wrapper.text()).toContain('健康 HTTP 状态码')
    })

    it('shows unhealthy fields with defaults', async () => {
      const HealthCheckForm = (await import('../HealthCheckForm.vue')).default
      const wrapper = mount(HealthCheckForm, {
        props: { checks: null, enabled: true },
      })
      expect(wrapper.text()).toContain('连续失败次数')
      expect(wrapper.text()).toContain('TCP 失败次数')
      expect(wrapper.text()).toContain('超时次数')
      expect(wrapper.text()).toContain('不健康间隔')
      expect(wrapper.text()).toContain('不健康 HTTP 状态码')
    })
  })

  describe('passive check fields', () => {
    function mountPassive() {
      return mount(HealthCheckForm, {
        props: { checks: null, enabled: true, modelMode: 'passive' },
      })
    }

    it('renders passive section when mode is passive only', async () => {
      const HealthCheckForm = (await import('../HealthCheckForm.vue')).default
      const wrapper = mount(HealthCheckForm, {
        props: { checks: null, enabled: true, modelMode: 'passive' },
      })
      expect(wrapper.text()).toContain('被动检查配置')
    })

    it('renders passive healthy/unhealthy sections', async () => {
      const HealthCheckForm = (await import('../HealthCheckForm.vue')).default
      const wrapper = mount(HealthCheckForm, {
        props: { checks: null, enabled: true, modelMode: 'passive' },
      })
      expect(wrapper.text()).toContain('被动健康判断')
      expect(wrapper.text()).toContain('被动不健康判断')
    })

    it('shows passive healthy fields with defaults', async () => {
      const HealthCheckForm = (await import('../HealthCheckForm.vue')).default
      const wrapper = mount(HealthCheckForm, {
        props: { checks: null, enabled: true, modelMode: 'passive' },
      })
      expect(wrapper.text()).toContain('连续成功次数')
      expect(wrapper.text()).toContain('健康 HTTP 状态码')
    })

    it('shows passive unhealthy fields with defaults', async () => {
      const HealthCheckForm = (await import('../HealthCheckForm.vue')).default
      const wrapper = mount(HealthCheckForm, {
        props: { checks: null, enabled: true, modelMode: 'passive' },
      })
      expect(wrapper.text()).toContain('连续失败次数')
      expect(wrapper.text()).toContain('TCP 失败次数')
      expect(wrapper.text()).toContain('超时次数')
      expect(wrapper.text()).toContain('不健康 HTTP 状态码')
    })
  })

  describe('reset button', () => {
    it('renders reset button when enabled', async () => {
      const HealthCheckForm = (await import('../HealthCheckForm.vue')).default
      const wrapper = mount(HealthCheckForm, {
        props: { checks: null, enabled: true },
      })
      expect(wrapper.text()).toContain('重置为默认')
    })
  })

  describe('JSON editor', () => {
    it('renders edit JSON button when enabled', async () => {
      const HealthCheckForm = (await import('../HealthCheckForm.vue')).default
      const wrapper = mount(HealthCheckForm, {
        props: { checks: null, enabled: true },
      })
      expect(wrapper.text()).toContain('编辑原始 JSON')
    })

    it('opens JSON editor modal on button click', async () => {
      const HealthCheckForm = (await import('../HealthCheckForm.vue')).default
      const wrapper = mount(HealthCheckForm, {
        props: { checks: null, enabled: true },
      })
      await wrapper.find('button.json-edit-btn').trigger('click')
      expect(wrapper.text()).toContain('健康检查 JSON')
    })

    it('shows current form state as JSON in modal', async () => {
      const HealthCheckForm = (await import('../HealthCheckForm.vue')).default
      const wrapper = mount(HealthCheckForm, {
        props: { checks: null, enabled: true },
      })
      await wrapper.find('button.json-edit-btn').trigger('click')
      const textarea = wrapper.find('textarea.json-textarea')
      expect(textarea.exists()).toBe(true)
      const json = JSON.parse(textarea.element.value)
      expect(json.active).toBeDefined()
      expect(json.active.type).toBe('http')
    })
  })
})
