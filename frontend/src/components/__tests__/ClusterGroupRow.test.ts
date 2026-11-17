import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ClusterGroupRow from '../ClusterGroupRow.vue'
import type { GroupHeaderRow } from '@/composables/useListClusterGrouping'

function row(overrides: Partial<GroupHeaderRow> = {}): GroupHeaderRow {
  return {
    __groupHeader: true,
    key: '__group__:3',
    groupKey: '3',
    label: '生产集群',
    chips: [{ label: '7 节点' }, { label: '6 运行中', tone: 'ok' }, { label: '1 未检测', tone: 'warn' }],
    folded: false,
    ...overrides,
  }
}

describe('ClusterGroupRow.vue', () => {
  it('渲染集群名与全部统计芯片文案', () => {
    const wrapper = mount(ClusterGroupRow, { props: { row: row() } })
    expect(wrapper.find('.g-name').text()).toBe('生产集群')
    const chips = wrapper.findAll('.g-chip')
    expect(chips).toHaveLength(3)
    expect(chips.map((c) => c.text())).toEqual(['7 节点', '6 运行中', '1 未检测'])
  })

  it('芯片 tone 落到对应类名（首个数量芯片无色调）', () => {
    const wrapper = mount(ClusterGroupRow, { props: { row: row() } })
    const chips = wrapper.findAll('.g-chip')
    expect(chips[0].classes()).toEqual(['g-chip'])
    expect(chips[1].classes()).toContain('ok')
    expect(chips[2].classes()).toContain('warn')
  })

  it('展开态：箭头不折叠（.g-chev 无 folded，aria-expanded=true）', () => {
    const wrapper = mount(ClusterGroupRow, { props: { row: row() } })
    const chev = wrapper.find('.g-chev')
    expect(chev.classes()).not.toContain('folded')
    expect(chev.attributes('aria-expanded')).toBe('true')
  })

  it('折叠态：.g-chev 带 folded、aria-expanded=false', () => {
    const wrapper = mount(ClusterGroupRow, { props: { row: row({ folded: true }) } })
    const chev = wrapper.find('.g-chev')
    expect(chev.classes()).toContain('folded')
    expect(chev.attributes('aria-expanded')).toBe('false')
  })

  it('点击箭头 emit toggle', async () => {
    const wrapper = mount(ClusterGroupRow, { props: { row: row() } })
    await wrapper.find('.g-chev').trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)
  })

  it('点击行内容（非箭头区）也 emit toggle，且不重复触发', async () => {
    const wrapper = mount(ClusterGroupRow, { props: { row: row() } })
    await wrapper.find('.g-name').trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)
  })

  it('渲染 data-test 定位点与 accent 左条容器', () => {
    const wrapper = mount(ClusterGroupRow, { props: { row: row() } })
    expect(wrapper.find('[data-test="cluster-group-row"]').exists()).toBe(true)
    expect(wrapper.find('.l5-group-inner').exists()).toBe(true)
  })

  it('无芯片时不渲染统计容器', () => {
    const wrapper = mount(ClusterGroupRow, { props: { row: row({ chips: [] }) } })
    expect(wrapper.find('.g-meta').exists()).toBe(false)
  })
})
