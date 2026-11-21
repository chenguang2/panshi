// IndexCell：表格序号列（#59）——后端分页跨页连续公式。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import IndexCell from '../IndexCell.vue'

describe('IndexCell.vue', () => {
  it('第 2 页首页行 = (2-1)*20 + 0 + 1 = 21', () => {
    const wrapper = mount(IndexCell, { props: { page: 2, pageSize: 20, index: 0 } })
    expect(wrapper.text()).toBe('21')
    expect(wrapper.find('.c-idx').exists()).toBe(true)
  })

  it('本页第 5 行（index 4）= 25', () => {
    const wrapper = mount(IndexCell, { props: { page: 2, pageSize: 20, index: 4 } })
    expect(wrapper.text()).toBe('25')
  })

  it('page/pageSize 缺省（未加载）= index + 1', () => {
    const wrapper = mount(IndexCell, { props: { index: 2 } })
    expect(wrapper.text()).toBe('3')
  })

  it('pageSize 变更后公式随动（每页 50）', () => {
    const wrapper = mount(IndexCell, { props: { page: 3, pageSize: 50, index: 0 } })
    expect(wrapper.text()).toBe('101')
  })
})
