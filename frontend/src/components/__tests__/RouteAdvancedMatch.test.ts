import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import RouteAdvancedMatch from '../src/components/RouteAdvancedMatch.vue'

describe('RouteAdvancedMatch Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should emit empty object when disabled', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: {
        modelValue: {}
      }
    })

    const switchEl = wrapper.find('.ant-switch')
    await switchEl.trigger('click')

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    expect(emitted![0]).toEqual([{}])
  })

  it('should reset priority and rules when disabled', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: {
        modelValue: {
          priority: 10,
          vars: [['header', 'Host', '==', 'example.com']]
        }
      }
    })

    await wrapper.vm.$nextTick()

    const switchEl = wrapper.find('.ant-switch')
    await switchEl.trigger('click')

    expect(wrapper.vm.priority).toBe(0)
    expect(wrapper.vm.rules).toEqual([])
  })

  it('should enable and show content when switch is clicked', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: {
        modelValue: {}
      }
    })

    expect(wrapper.find('.match-content').exists()).toBe(false)

    const switchEl = wrapper.find('.ant-switch')
    await switchEl.trigger('click')

    expect(wrapper.find('.match-content').exists()).toBe(true)
  })

  it('should auto-enable when modelValue has vars', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: {
        modelValue: {
          vars: [['header', 'Host', '==', 'example.com']]
        }
      }
    })

    await wrapper.vm.$nextTick()

    expect(wrapper.vm.enabled).toBe(true)
    expect(wrapper.find('.match-content').exists()).toBe(true)
  })

  it('should auto-enable when modelValue has priority > 0', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: {
        modelValue: {
          priority: 5
        }
      }
    })

    await wrapper.vm.$nextTick()

    expect(wrapper.vm.enabled).toBe(true)
  })

  it('should not auto-enable when modelValue has empty vars and priority 0', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: {
        modelValue: {
          priority: 0,
          vars: []
        }
      }
    })

    await wrapper.vm.$nextTick()

    expect(wrapper.vm.enabled).toBe(false)
  })

  it('should not reset priority when user manually enables then changes priority', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: {
        modelValue: {
          priority: 10,
          vars: []
        }
      }
    })

    await wrapper.vm.$nextTick()
    expect(wrapper.vm.enabled).toBe(true)

    const switchEl = wrapper.find('.ant-switch')
    await switchEl.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.enabled).toBe(false)

    await switchEl.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.enabled).toBe(true)
    expect(wrapper.vm.priority).toBe(10)
  })

  it('should emit updated modelValue with priority when enabled and priority changed', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: {
        modelValue: {}
      }
    })

    const switchEl = wrapper.find('.ant-switch')
    await switchEl.trigger('click')
    await wrapper.vm.$nextTick()

    const priorityInput = wrapper.find('input[type="number"]')
    await priorityInput.setValue(15)
    await wrapper.vm.$nextTick()

    const emitted = wrapper.emitted('update:modelValue')
    expect(emitted).toBeTruthy()
    const lastEmit = emitted![emitted!.length - 1][0] as any
    expect(lastEmit.priority).toBe(15)
  })
})