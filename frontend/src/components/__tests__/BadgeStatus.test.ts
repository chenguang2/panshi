import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BadgeStatus from '../BadgeStatus.vue'

describe('BadgeStatus.vue', () => {
  it('renders text', () => {
    const wrapper = mount(BadgeStatus, {
      props: { text: '在线', status: 'online' }
    })
    expect(wrapper.text()).toContain('在线')
  })

  it('has correct status class', () => {
    const wrapper = mount(BadgeStatus, {
      props: { text: '离线', status: 'offline' }
    })
    expect(wrapper.find('.status-dot').classes()).toContain('offline')
  })
})
