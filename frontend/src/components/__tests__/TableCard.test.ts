import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TableCard from '../TableCard.vue'

describe('TableCard.vue', () => {
  const stubs = { ATable: { template: '<div class="mock-table" />' } }

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
})
