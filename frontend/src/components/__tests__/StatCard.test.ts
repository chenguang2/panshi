import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import StatCard from '../StatCard.vue'

describe('StatCard.vue', () => {
  it('renders value and label', () => {
    const wrapper = mount(StatCard, {
      props: { value: '42', label: '集群' }
    })
    expect(wrapper.find('.stat-card-value').text()).toBe('42')
    expect(wrapper.find('.stat-card-label').text()).toBe('集群')
  })

  it('renders icon slot', () => {
    const wrapper = mount(StatCard, {
      props: { value: '5', label: '集群' },
      slots: { icon: '<span class="test-icon">◆</span>' }
    })
    expect(wrapper.find('.test-icon').exists()).toBe(true)
  })

  it('renders subtitle when provided', () => {
    const wrapper = mount(StatCard, {
      props: {
        value: '5',
        label: '集群',
        subtitle: '3 在线 / 1 离线'
      }
    })
    expect(wrapper.find('.stat-card-sub').text()).toBe('3 在线 / 1 离线')
  })

  it('has accent class when provided', () => {
    const wrapper = mount(StatCard, {
      props: { value: '5', label: '集群', accent: 'cluster' }
    })
    expect(wrapper.classes()).toContain('accent-cluster')
  })

  it('has stat-card class', () => {
    const wrapper = mount(StatCard, {
      props: { value: '5', label: '集群' }
    })
    expect(wrapper.classes()).toContain('stat-card')
  })
})
