// RouteMethodsCell：大写化 + 前 N 枚 + title 全量 + 空值「—」。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import RouteMethodsCell from '../RouteMethodsCell.vue'

const tags = (wrapper: VueWrapper) =>
  wrapper.findAll('.m-tag').map((el) => ({ text: el.text(), classes: el.classes() }))

describe('RouteMethodsCell.vue', () => {
  it('默认最多 2 枚、大写化、带方法色阶类', () => {
    const wrapper = mount(RouteMethodsCell, { props: { methods: 'get,post,put' } })
    expect(tags(wrapper)).toEqual([
      { text: 'GET', classes: expect.arrayContaining(['m-tag', 'GET']) },
      { text: 'POST', classes: expect.arrayContaining(['m-tag', 'POST']) },
    ])
  })

  it('title 给全量方法（顿号分隔）', () => {
    const wrapper = mount(RouteMethodsCell, { props: { methods: 'get,post,put' } })
    expect(wrapper.find('.method-cell').attributes('title')).toBe('GET、POST、PUT')
  })

  it('maxVisible 可放宽（页面 3 枚）', () => {
    const wrapper = mount(RouteMethodsCell, { props: { methods: 'get,post,put,delete', maxVisible: 3 } })
    expect(tags(wrapper).map((t) => t.text)).toEqual(['GET', 'POST', 'PUT'])
  })

  it('空白项与小写归一（` get ,  ` → GET）', () => {
    const wrapper = mount(RouteMethodsCell, { props: { methods: ' get ,  ' } })
    expect(tags(wrapper).map((t) => t.text)).toEqual(['GET'])
  })

  it('空值输出 .dim 的「—」，无胶囊', () => {
    const wrapper = mount(RouteMethodsCell, { props: { methods: '' } })
    expect(wrapper.findAll('.m-tag')).toHaveLength(0)
    expect(wrapper.find('.dim').text()).toBe('—')
  })
})
