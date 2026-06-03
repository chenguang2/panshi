import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PageHeader from '../PageHeader.vue'

describe('PageHeader.vue', () => {
  it('renders title', () => {
    const wrapper = mount(PageHeader, {
      props: { title: '集群管理' }
    })
    expect(wrapper.find('h1').text()).toBe('集群管理')
  })

  it('renders description when provided', () => {
    const wrapper = mount(PageHeader, {
      props: {
        title: '集群管理',
        description: '管理网关集群'
      }
    })
    expect(wrapper.find('p').text()).toBe('管理网关集群')
  })

  it('does not render description paragraph when not provided', () => {
    const wrapper = mount(PageHeader, {
      props: { title: '集群管理' }
    })
    expect(wrapper.find('p').exists()).toBe(false)
  })

  it('renders actions slot content', () => {
    const wrapper = mount(PageHeader, {
      props: { title: '集群管理' },
      slots: {
        actions: '<button class="test-btn">新建</button>'
      }
    })
    expect(wrapper.find('.test-btn').exists()).toBe(true)
    expect(wrapper.find('.test-btn').text()).toBe('新建')
  })

  it('has page-header class', () => {
    const wrapper = mount(PageHeader, {
      props: { title: '集群管理' }
    })
    expect(wrapper.classes()).toContain('page-header')
  })
})
