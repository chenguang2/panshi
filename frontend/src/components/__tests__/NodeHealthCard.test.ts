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
  'a-select': { template: '<div class="a-select"><slot /></div>', props: ['value'] },
  'a-select-option': { template: '<div class="a-select-option"><slot /></div>', props: ['value'] },
  'a-spin': { template: '<div class="a-spin">loading</div>' },
  'a-table': { template: '<div class="a-table"><div class="ant-table-row" v-for="r in dataSource" :key="r.key" /></div>', props: ['dataSource', 'columns', 'pagination', 'size', 'scroll'] },
}

describe('NodeHealthCard.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders title', () => {
    mockGetNodeHealth.mockResolvedValue([])
    const wrapper = mount(NodeHealthCard, { global: { stubs } })
    expect(wrapper.find('.chart-title').text()).toBe('节点健康')
  })

  it('shows loading state', async () => {
    mockGetNodeHealth.mockReturnValue(new Promise(() => {}))
    const wrapper = mount(NodeHealthCard, { global: { stubs } })
    await nextTick()
    expect(wrapper.find('.a-spin').exists()).toBe(true)
  })

  it('shows empty state when no data', async () => {
    mockGetNodeHealth.mockResolvedValue([])
    const wrapper = mount(NodeHealthCard, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.find('.chart-empty').exists()).toBe(true)
    expect(wrapper.find('.chart-empty').text()).toBe('当前无数据')
  })

  it('renders node status table', async () => {
    mockGetNodeHealth.mockResolvedValue([
      { node_ip: '192.168.100.42', status: 1, last_seen: '2026-08-21 10:47:42' },
    ])
    const wrapper = mount(NodeHealthCard, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.find('.a-table').exists()).toBe(true)
    const rows = wrapper.findAll('.ant-table-row')
    expect(rows.length).toBe(1)
  })

  it('shows error state on API failure', async () => {
    mockGetNodeHealth.mockRejectedValue(new Error('fail'))
    const wrapper = mount(NodeHealthCard, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.find('.chart-error').text()).toBe('数据加载失败')
  })
})
