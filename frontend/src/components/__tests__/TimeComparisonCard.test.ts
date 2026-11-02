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
  'a-select': {
    template: '<div class="a-select" @click="$emit(\'change\', \'week_over_week\')"><slot /></div>',
    props: ['value'],
  },
  'a-select-option': { template: '<div class="a-select-option"><slot /></div>', props: ['value'] },
  'a-spin': { template: '<div class="a-spin">loading</div>' },
  'a-tag': {
    template: '<span class="a-tag" :title="$attrs.title"><slot /></span>',
    props: ['color'],
    inheritAttrs: false,
  },
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

  it('shows empty state when payload invalid', async () => {
    mockGetTimeComparison.mockResolvedValue({})
    const wrapper = mount(TimeComparisonCard, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.find('.chart-empty').exists()).toBe(true)
    expect(wrapper.find('.chart-empty').text()).toBe('暂无上报数据')
  })

  it('renders day-over-day with 较昨日 suffix', async () => {
    mockGetTimeComparison.mockResolvedValue({
      today_requests: 12500,
      yesterday_requests: 11800,
      change_rate: 5.93,
      data_quality: 'complete',
      today_sample_count: 1440,
      yesterday_sample_count: 1440,
    })
    const wrapper = mount(TimeComparisonCard, { global: { stubs } })
    await nextTick()
    await nextTick()
    const values = wrapper.findAll('.compare-value')
    expect(values[0].text()).toBe('12,500')
    expect(wrapper.text()).toContain('今日请求')
    expect(wrapper.text()).toContain('昨日请求')
    expect(wrapper.text()).toContain('较昨日')
    const change = wrapper.find('.change-up')
    expect(change.exists()).toBe(true)
    expect(change.attributes('title')).toBe('请求量较昨日上升 5.9%')
  })

  it('renders week-over-week with 本周/上周 labels（修复：周对比恒空态）', async () => {
    mockGetTimeComparison.mockResolvedValue({
      this_week_requests: 88000,
      last_week_requests: 91000,
      change_rate: -3.3,
      data_quality: 'complete',
      this_week_sample_count: 10080,
      last_week_sample_count: 10080,
    })
    const wrapper = mount(TimeComparisonCard, { global: { stubs } })
    await nextTick()
    await nextTick()
    // stub 的 a-select 点击即切到 week_over_week
    await wrapper.find('.a-select').trigger('click')
    await nextTick()
    await nextTick()
    expect(mockGetTimeComparison).toHaveBeenLastCalledWith('week_over_week', 7, undefined)
    expect(wrapper.text()).toContain('本周请求')
    expect(wrapper.text()).toContain('上周请求')
    expect(wrapper.text()).toContain('较上周')
    const change = wrapper.find('.change-down')
    expect(change.exists()).toBe(true)
    expect(change.attributes('title')).toBe('请求量较上周下降 3.3%')
  })

  it('shows sampling coverage with weak text and tooltip title', async () => {
    mockGetTimeComparison.mockResolvedValue({
      today_requests: 0,
      yesterday_requests: 0,
      change_rate: 0.0,
      data_quality: 'partial',
      today_sample_count: 501,
      yesterday_sample_count: 1440,
    })
    const wrapper = mount(TimeComparisonCard, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.text()).toContain('采样部分')
    expect(wrapper.text()).toContain('今日 501/1440')
    expect(wrapper.text()).toContain('昨日 1440/1440')
    const tag = wrapper.find('.a-tag')
    expect(tag.attributes('title')).toContain('统计日未结束时会显示部分，属正常现象')
  })

  it('shows scope annotation', () => {
    mockGetTimeComparison.mockResolvedValue({})
    const wrapper = mount(TimeComparisonCard, { global: { stubs } })
    expect(wrapper.find('.chart-scope').text()).toBe('今日 vs 昨日')
  })

  it('filter 参数透传给 API（metrics-cluster-node-filter）', async () => {
    mockGetTimeComparison.mockResolvedValue({
      today_requests: 1,
      yesterday_requests: 1,
      change_rate: 0,
      data_quality: 'complete',
    })
    mount(TimeComparisonCard, { global: { stubs }, props: { filter: 'cluster:5' } })
    await nextTick()
    await nextTick()
    expect(mockGetTimeComparison).toHaveBeenLastCalledWith('day_over_day', 7, 'cluster:5')
  })

  it('shows attributed error on failure', async () => {
    mockGetTimeComparison.mockRejectedValue(new Error('fail'))
    const wrapper = mount(TimeComparisonCard, { global: { stubs } })
    await nextTick()
    await nextTick()
    expect(wrapper.find('.chart-error').text()).toContain('加载失败')
  })

  it('sourceOk=false 时不发请求并显示数据源不可用', async () => {
    mockGetTimeComparison.mockResolvedValue({})
    const wrapper = mount(TimeComparisonCard, { global: { stubs }, props: { sourceOk: false } })
    await nextTick()
    await nextTick()
    expect(mockGetTimeComparison).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('数据源不可用，无法读取指标')
  })

  it('refreshTick 变化时重新加载', async () => {
    mockGetTimeComparison.mockResolvedValue({
      today_requests: 1,
      yesterday_requests: 1,
      change_rate: 0,
      data_quality: 'complete',
    })
    const wrapper = mount(TimeComparisonCard, { global: { stubs }, props: { refreshTick: 0 } })
    await nextTick()
    await nextTick()
    expect(mockGetTimeComparison).toHaveBeenCalledTimes(1)
    await wrapper.setProps({ refreshTick: 1 })
    await nextTick()
    await nextTick()
    expect(mockGetTimeComparison).toHaveBeenCalledTimes(2)
  })
})
