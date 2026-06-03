import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MethodTag from '../MethodTag.vue'

describe('MethodTag.vue', () => {
  it('renders method text', () => {
    const wrapper = mount(MethodTag, {
      props: { method: 'GET' }
    })
    expect(wrapper.text()).toBe('GET')
  })

  it('has method class', () => {
    const wrapper = mount(MethodTag, {
      props: { method: 'POST' }
    })
    expect(wrapper.classes()).toContain('method-tag')
    expect(wrapper.classes()).toContain('POST')
  })
})
