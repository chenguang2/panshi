import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import TimeComparisonCard from '../TimeComparisonCard.vue'

vi.mock('@/api/metrics', () => ({
  getTimeComparison: vi.fn(),
}))

import { getTimeComparison } from '@/api/metrics'
const mockGetTimeComparison = vi.mocked(getTimeComparison)

const stubs = {
  'a-select': { template: '<div class="a-select"><slot /></div>', props: ['value'] },
  'a-select-option': { template: '<div class="a-select-option"><slot /></div>', props: ['value'] },
  'a-spin': { template: '<div class="a-spin">loading</div>' },
  'a-tag': { template: '<span class="a-tag"><slot /></span>', props: ['color'] },
}

describe('TimeComparisonCard.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders title', () => {
    mockGetTimeComparison.mockResolvedValue({})
    const wrapper = mount(TimeComparisonCard, { global: { stubs } })
    expect(wrapper.find('.chart-title').text()).toBe('时间对比')
  })

  it('shows loading state', async () => {
    mockGetTimeComparison.mockReturnValue(new Promise(() => {}))
    const wrapper = mount(TimeComparisonCard, { global: { stubs } })
    await nextTick()
    expect(wrapper.find('.a-spin').exists()).toBe(true)
  })

  it('shows empty state when no data', async () => {
    mockGetTimeComparison.mockResolvedValue({})
    const wrapper = mount(TimeComparisonCard, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.find('.chart-empty').exists()).toBe(true)
  })

  it('renders comparison data', async () => {
    mockGetTimeComparison.mockResolvedValue({
      today_requests: 12500,
      yesterday_requests: 11800,
      change_rate: 5.93,
      data_quality: 'complete',
    })
    const wrapper = mount(TimeComparisonCard, { global: { stubs } })
    await nextTick()
    await nextTick()
    const values = wrapper.findAll('.compare-value')
    expect(values.length).toBeGreaterThanOrEqual(2)
    expect(values[0].text()).toBe('12,500')
  })

  it('shows error state on API failure', async () => {
    mockGetTimeComparison.mockRejectedValue(new Error('fail'))
    const wrapper = mount(TimeComparisonCard, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.find('.chart-error').text()).toBe('数据加载失败')
  })
})
