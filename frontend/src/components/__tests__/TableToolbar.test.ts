import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TableToolbar from '../TableToolbar.vue'

function render(extra: Record<string, unknown> = {}) {
  return mount(TableToolbar, {
    props: { count: 12, countUnit: '个节点', ...extra },
    slots: {
      filters: '<input class="f-probe" />',
      config: '<button class="c-probe">列配置</button>',
    },
  })
}

/** 取 toolbar 内所有 data-test 强者出现的文档顺序（右端簇顺序契约） */
function dataTestOrder(wrapper: ReturnType<typeof render>): string[] {
  return wrapper
    .findAll('[data-test]')
    .map((el) => el.attributes('data-test') || '')
    .filter(Boolean)
}

describe('TableToolbar.vue - 结构契约', () => {
  it('右端簇 DOM 顺序 = count → refresh → config → mode', () => {
    const wrapper = render()
    const order = dataTestOrder(wrapper)
    const relevant = order.filter((k) => k !== 'toolbar')
    expect(relevant).toEqual(['toolbar-count', 'toolbar-refresh', 'view-mode-group', 'view-mode-flat'])
    // #config slot 落在刷新与切换器之间
    const html = wrapper.html()
    expect(html.indexOf('toolbar-refresh')).toBeLessThan(html.indexOf('c-probe'))
    expect(html.indexOf('c-probe')).toBeLessThan(html.indexOf('view-mode-group'))
  })

  it('#filters 在左端、计数之前渲染', () => {
    const wrapper = render()
    const html = wrapper.html()
    expect(html.indexOf('f-probe')).toBeLessThan(html.indexOf('toolbar-count'))
  })

  it('showMode=false 时不渲染切换器', () => {
    const wrapper = render({ showMode: false })
    expect(wrapper.find('[data-test="view-mode-group"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="view-mode-flat"]').exists()).toBe(false)
    expect(wrapper.find('.seg').exists()).toBe(false)
  })

  it('计数文案 = count + countUnit', () => {
    const wrapper = mount(TableToolbar, { props: { count: 31, countUnit: '条路由' } })
    expect(wrapper.find('[data-test="toolbar-count"]').text()).toBe('共 31 条路由')
  })
})

describe('TableToolbar.vue - 交互', () => {
  it('点「平铺」emit update:mode(flat)', async () => {
    const wrapper = render({ mode: 'group' })
    await wrapper.find('[data-test="view-mode-flat"]').trigger('click')
    expect(wrapper.emitted('update:mode')).toEqual([['flat']])
  })

  it('点当前模式不重复 emit（避免消费方无谓重算）', async () => {
    const wrapper = render({ mode: 'group' })
    await wrapper.find('[data-test="view-mode-group"]').trigger('click')
    expect(wrapper.emitted('update:mode')).toBeUndefined()
  })

  it('选中态落在对应选项上（.seg-opt.active）', () => {
    const flat = render({ mode: 'flat' })
    expect(flat.find('[data-test="view-mode-flat"]').classes()).toContain('active')
    expect(flat.find('[data-test="view-mode-group"]').classes()).not.toContain('active')
  })

  it('点刷新 emit refresh', async () => {
    const wrapper = render()
    await wrapper.find('[data-test="toolbar-refresh"]').trigger('click')
    expect(wrapper.emitted('refresh')).toHaveLength(1)
  })

  it('refreshing=true 时刷新按钮禁用并显示 loading', () => {
    const wrapper = render({ refreshing: true })
    const btn = wrapper.find('[data-test="toolbar-refresh"]')
    expect(btn.attributes('disabled')).toBeDefined()
  })
})

describe('TableToolbar.vue - showCount 开关（list-pages-console-restyle 路由页 V2）', () => {
  it('showCount=false 不渲染工具条计数（计数由路由页方法 chips 行右端承载）', () => {
    const wrapper = mount(TableToolbar, {
      props: { count: 7, countUnit: '条路由', showCount: false, mode: 'group' },
    })
    expect(wrapper.find('[data-test="toolbar-count"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="toolbar-refresh"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="view-mode-group"]').exists()).toBe(true)
  })
})
