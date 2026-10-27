import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import MetricsSourceBanner from '../MetricsSourceBanner.vue'

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('vue-router')>()
  return { ...actual, RouterLink: { template: '<a><slot /></a>', props: ['to'] } }
})

describe('MetricsSourceBanner.vue', () => {
  it('hidden when sourceOk is null (summary itself failed)', () => {
    const wrapper = mount(MetricsSourceBanner, { props: { sourceOk: null } })
    expect(wrapper.find('.ck-source-banner').exists()).toBe(false)
  })

  it('hidden when sourceOk is true', () => {
    const wrapper = mount(MetricsSourceBanner, { props: { sourceOk: true } })
    expect(wrapper.find('.ck-source-banner').exists()).toBe(false)
  })

  it('visible with target and config link when sourceOk is false', () => {
    const wrapper = mount(MetricsSourceBanner, { props: { sourceOk: false, target: '192.168.100.42:9000' } })
    const banner = wrapper.find('.ck-source-banner')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('指标数据源不可用')
    expect(banner.text()).toContain('192.168.100.42:9000')
    expect(banner.text()).toContain('查看 ClickHouse 配置')
  })

  it('visible without target segment when target empty', () => {
    const wrapper = mount(MetricsSourceBanner, { props: { sourceOk: false } })
    expect(wrapper.find('.ck-source-banner').text()).not.toContain('（')
  })
})
