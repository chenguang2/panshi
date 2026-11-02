import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import NodeHealthCard from '../NodeHealthCard.vue'

vi.mock('@/api/metrics', () => ({
  getNodeHealth: vi.fn(),
}))

import { getNodeHealth } from '@/api/metrics'
const mockGetNodeHealth = vi.mocked(getNodeHealth)

const stubs = {
  'a-select': {
    template: '<div class="a-select" @click="$emit(\'change\', \'resource\')"><slot /></div>',
    props: ['value'],
  },
  'a-select-option': { template: '<div class="a-select-option"><slot /></div>', props: ['value'] },
  'a-spin': { template: '<div class="a-spin">loading</div>' },
  'a-table': {
    template:
      '<div class="a-table"><div class="ant-table-row" v-for="r in dataSource" :key="r.key"><span v-for="c in columns" :key="c.key" :class="\'cell-\' + c.key"><slot name="bodyCell" :column="c" :record="r" :text="r[c.dataIndex]">{{ r[c.dataIndex] }}</slot></span></div></div>',
    props: ['dataSource', 'columns', 'pagination', 'size', 'scroll'],
  },
}

describe('NodeHealthCard.vue（metrics-dashboard-ux-optimization D4）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders title', () => {
    mockGetNodeHealth.mockResolvedValue([])
    const wrapper = mount(NodeHealthCard, { global: { stubs } })
    expect(wrapper.find('.chart-title').text()).toBe('节点健康')
  })

  it('切换器文案为「在线状态 / 字典内存」', () => {
    mockGetNodeHealth.mockResolvedValue([])
    const wrapper = mount(NodeHealthCard, { global: { stubs } })
    const options = wrapper.findAll('.a-select-option').map((o) => o.text())
    expect(options).toEqual(['在线状态', '字典内存'])
  })

  it('shows empty state with 暂无上报数据', async () => {
    mockGetNodeHealth.mockResolvedValue([])
    const wrapper = mount(NodeHealthCard, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.find('.chart-empty').exists()).toBe(true)
    expect(wrapper.find('.chart-empty').text()).toBe('暂无上报数据')
  })

  it('状态列渲染 badge 文案 正常/采集中断（不直出 0/1）', async () => {
    mockGetNodeHealth.mockResolvedValue([
      { node_ip: '192.168.100.42', status: 1, last_seen: 'x', last_seen_ts: 1787309262 },
      { node_ip: '192.168.100.99', status: 0, last_seen: 'y', last_seen_ts: 1787309262 },
    ])
    const wrapper = mount(NodeHealthCard, { global: { stubs } })
    await nextTick()
    await nextTick()
    const cells = wrapper.findAll('.cell-status_label')
    expect(cells[0].text()).toBe('正常')
    expect(cells[1].text()).toBe('采集中断')
    expect(cells[0].find('.badge-online').exists()).toBe(true)
    expect(cells[1].find('.badge-offline').exists()).toBe(true)
  })

  it('最后上报经 last_seen_ts 格式化并附相对时间', async () => {
    const ts = Math.floor(Date.now() / 1000) - 180
    mockGetNodeHealth.mockResolvedValue([{ node_ip: '192.168.100.42', status: 1, last_seen: 'raw', last_seen_ts: ts }])
    const wrapper = mount(NodeHealthCard, { global: { stubs } })
    await nextTick()
    await nextTick()
    const cell = wrapper.find('.cell-last_seen_display')
    expect(cell.text()).toContain('3 分钟前')
    expect(cell.text()).not.toContain('raw')
    expect(cell.text()).not.toContain('.887')
  })

  it('字典内存视图：容量 formatFileSize、使用率带 %', async () => {
    mockGetNodeHealth.mockResolvedValue([
      {
        dict_name: 'monitor_metrics1',
        node_ip: '192.168.100.42',
        capacity_bytes: 52428800,
        free_bytes: 52113408,
        usage_percent: 0.6,
      },
    ])
    const wrapper = mount(NodeHealthCard, { global: { stubs } })
    await nextTick()
    await nextTick()
    await wrapper.find('.a-select').trigger('click')
    await nextTick()
    await nextTick()
    expect(mockGetNodeHealth).toHaveBeenLastCalledWith('resource', undefined, undefined)
    expect(wrapper.find('.cell-capacity_fmt').text()).toBe('50.0 MB')
    expect(wrapper.find('.cell-usage_percent').text()).toContain('0.6%')
    expect(wrapper.find('.usage-bar').exists()).toBe(true)
  })

  it('类型切换只发起一次请求（修复双请求）', async () => {
    mockGetNodeHealth.mockResolvedValue([])
    const wrapper = mount(NodeHealthCard, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect(mockGetNodeHealth).toHaveBeenCalledTimes(1)
    await wrapper.find('.a-select').trigger('click')
    await nextTick()
    await nextTick()
    expect(mockGetNodeHealth).toHaveBeenCalledTimes(2)
  })

  it('shows attributed error on failure', async () => {
    mockGetNodeHealth.mockRejectedValue(new Error('fail'))
    const wrapper = mount(NodeHealthCard, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.find('.chart-error').text()).toContain('加载失败')
  })

  it('sourceOk=false 时不发请求并显示数据源不可用', async () => {
    mockGetNodeHealth.mockResolvedValue([])
    const wrapper = mount(NodeHealthCard, { global: { stubs }, props: { sourceOk: false } })
    await nextTick()
    await nextTick()
    expect(mockGetNodeHealth).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('数据源不可用，无法读取指标')
  })

  it('filter 参数透传给 API（metrics-cluster-node-filter）', async () => {
    mockGetNodeHealth.mockResolvedValue([])
    mount(NodeHealthCard, { global: { stubs }, props: { filter: 'cluster:4' } })
    await nextTick()
    await nextTick()
    expect(mockGetNodeHealth).toHaveBeenLastCalledWith('status', undefined, 'cluster:4')
  })

  it('refreshTick 变化时重新加载', async () => {
    mockGetNodeHealth.mockResolvedValue([])
    const wrapper = mount(NodeHealthCard, { global: { stubs }, props: { refreshTick: 0 } })
    await nextTick()
    await nextTick()
    expect(mockGetNodeHealth).toHaveBeenCalledTimes(1)
    await wrapper.setProps({ refreshTick: 1 })
    await nextTick()
    await nextTick()
    expect(mockGetNodeHealth).toHaveBeenCalledTimes(2)
  })
})
