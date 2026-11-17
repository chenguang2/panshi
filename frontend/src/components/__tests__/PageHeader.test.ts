import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PageHeader from '../PageHeader.vue'

describe('PageHeader.vue', () => {
  it('renders title', () => {
    const wrapper = mount(PageHeader, {
      props: { title: '集群管理' },
    })
    expect(wrapper.find('h1').text()).toBe('集群管理')
  })

  it('renders description when provided', () => {
    const wrapper = mount(PageHeader, {
      props: {
        title: '集群管理',
        description: '管理网关集群',
      },
    })
    expect(wrapper.find('p').text()).toBe('管理网关集群')
  })

  it('does not render description paragraph when not provided', () => {
    const wrapper = mount(PageHeader, {
      props: { title: '集群管理' },
    })
    expect(wrapper.find('p').exists()).toBe(false)
  })

  it('renders actions slot content', () => {
    const wrapper = mount(PageHeader, {
      props: { title: '集群管理' },
      slots: {
        actions: '<button class="test-btn">新建</button>',
      },
    })
    expect(wrapper.find('.test-btn').exists()).toBe(true)
    expect(wrapper.find('.test-btn').text()).toBe('新建')
  })

  it('has page-header class', () => {
    const wrapper = mount(PageHeader, {
      props: { title: '集群管理' },
    })
    expect(wrapper.classes()).toContain('page-header')
  })
})

// list-pages-console-restyle：标题行新增可选 #stats slot（页头轻统计徽标）。
// 其余 33 个消费页零影响——slot 无内容时不产生额外视觉，h1/p/actions 结构类名不变。
describe('PageHeader.vue - #stats slot（标题行轻统计徽标）', () => {
  it('无 #stats 时 DOM 结构与既有约定一致（info = 标题行 + 描述，无统计 DOM）', () => {
    const wrapper = mount(PageHeader, {
      props: { title: '节点管理', description: '管理 Edge 网关节点' },
      slots: { actions: '<button class="test-btn">新建</button>' },
    })
    expect(wrapper.classes()).toContain('page-header')
    expect(wrapper.find('.page-header-info').exists()).toBe(true)
    expect(wrapper.find('h1').text()).toBe('节点管理')
    expect(wrapper.find('p').text()).toBe('管理 Edge 网关节点')
    expect(wrapper.find('.page-header-actions .test-btn').exists()).toBe(true)
    expect(wrapper.find('[data-test="page-stat"]').exists()).toBe(false)
  })

  it('传 #stats 后徽标渲染在标题行内（与 h1 同一行）', () => {
    const wrapper = mount(PageHeader, {
      props: { title: '节点管理' },
      slots: {
        stats: '<span class="ph-inline"><span class="ph-lite lite-accent" data-test="page-stat">12 节点</span></span>',
      },
    })
    const titleRow = wrapper.find('.page-header-title-row')
    expect(titleRow.exists()).toBe(true)
    expect(titleRow.find('h1').text()).toBe('节点管理')
    expect(titleRow.find('[data-test="page-stat"]').exists()).toBe(true)
    // 徽标不在描述行、也不在 actions 区
    expect(wrapper.find('.page-header-actions [data-test="page-stat"]').exists()).toBe(false)
    expect(wrapper.find('.page-header-info > p [data-test="page-stat"]').exists()).toBe(false)
  })

  it('#stats 存在时 p 仍只有描述那一个（徽标不得用 p 承载）', () => {
    const wrapper = mount(PageHeader, {
      props: { title: '节点管理', description: '管理 Edge 网关节点' },
      slots: { stats: '<span data-test="page-stat">12 节点</span>' },
    })
    const paragraphs = wrapper.findAll('p')
    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0].text()).toBe('管理 Edge 网关节点')
  })
})
