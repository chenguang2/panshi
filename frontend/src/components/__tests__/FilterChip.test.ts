import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FilterChip from '../FilterChip.vue'

describe('FilterChip.vue', () => {
  it('renders label', () => {
    const wrapper = mount(FilterChip, {
      props: { label: '全部' }
    })
    expect(wrapper.text()).toBe('全部')
  })

  it('has active class when active', () => {
    const wrapper = mount(FilterChip, {
      props: { label: 'GET', active: true }
    })
    expect(wrapper.classes()).toContain('active')
  })

  it('does not have active class when not active', () => {
    const wrapper = mount(FilterChip, {
      props: { label: 'GET', active: false }
    })
    expect(wrapper.classes()).not.toContain('active')
  })
})
