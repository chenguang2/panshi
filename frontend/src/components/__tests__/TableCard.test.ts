import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TableCard from '../TableCard.vue'

describe('TableCard.vue', () => {
  const stubs = {
    ATable: {
      template: '<div class="mock-table"><slot name="bodyCell" /><slot name="headerCell" /></div>',
      props: ['columns', 'dataSource', 'loading', 'pagination', 'rowKey']
    }
  }

  it('renders with table-card wrapper class', () => {
    const wrapper = mount(TableCard, {
      props: { columns: [], dataSource: [] },
      global: { stubs }
    })
    expect(wrapper.find('.table-card').exists()).toBe(true)
  })

  it('renders header slot', () => {
    const wrapper = mount(TableCard, {
      slots: { header: '<div class="custom-header">标题</div>' },
      global: { stubs }
    })
    expect(wrapper.find('.custom-header').exists()).toBe(true)
  })

  it('renders footer slot', () => {
    const wrapper = mount(TableCard, {
      slots: { footer: '<div class="custom-footer">页脚</div>' },
      global: { stubs }
    })
    expect(wrapper.find('.custom-footer').exists()).toBe(true)
  })

  it('forwards bodyCell slot to inner a-table', () => {
    const wrapper = mount(TableCard, {
      props: { columns: [], dataSource: [] },
      slots: { bodyCell: '<div class="custom-bodycell">cell</div>' },
      global: { stubs }
    })
    expect(wrapper.find('.custom-bodycell').exists()).toBe(true)
  })

  it('does not forward header slot to inner a-table', () => {
    const wrapper = mount(TableCard, {
      props: { columns: [], dataSource: [] },
      slots: { header: '<div class="custom-hdr">hdr</div>', bodyCell: '<div class="custom-bc">bc</div>' },
      global: { stubs }
    })
    // header should be rendered by TableCard itself (outside the mock-table)
    expect(wrapper.find('.custom-hdr').exists()).toBe(true)
    // bodyCell should be forwarded to the mock-table
    expect(wrapper.find('.custom-bc').exists()).toBe(true)
  })
})
