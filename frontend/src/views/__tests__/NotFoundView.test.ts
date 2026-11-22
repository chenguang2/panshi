import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { bootstrapSettled } from '@/router/bootstrapState'
import NotFoundView from '../NotFoundView.vue'

// 组件只消费 useRouter().push，直接桩掉（与 Login.test.ts 同款手法）
const routerPush = vi.fn()

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
}))

describe('NotFoundView（B3 catch-all 占位视图）', () => {
  beforeEach(() => {
    routerPush.mockClear()
    bootstrapSettled.value = true
  })

  afterEach(() => {
    // 模块级 ref：用例间必须复位，否则后续用例被上一条污染
    bootstrapSettled.value = false
  })

  it('渲染主文案、次要说明与「返回概览」按钮', () => {
    const wrapper = mount(NotFoundView)

    expect(wrapper.find('.notfound-page').exists()).toBe(true)
    expect(wrapper.text()).toContain('页面不存在或功能未启用')
    expect(wrapper.text()).toContain('请检查地址，或该功能在当前部署中已关闭')
    const btn = wrapper.find('button')
    expect(btn.exists()).toBe(true)
    expect(btn.text()).toBe('返回概览')

    wrapper.unmount()
  })

  it('点击「返回概览」跳转首页', async () => {
    const wrapper = mount(NotFoundView)

    await wrapper.find('button').trigger('click')

    expect(routerPush).toHaveBeenCalledTimes(1)
    expect(routerPush).toHaveBeenCalledWith('/')

    wrapper.unmount()
  })

  it('bootstrap 未收口时不渲染空态（feature 深链首访不闪 404）', () => {
    bootstrapSettled.value = false
    const wrapper = mount(NotFoundView)

    expect(wrapper.find('.notfound-page').exists()).toBe(false)
    expect(wrapper.text()).toBe('')

    wrapper.unmount()
  })

  it('收口后渲染（ref 跨状态切换的双向验证）', async () => {
    bootstrapSettled.value = false
    const wrapper = mount(NotFoundView)
    expect(wrapper.find('.notfound-page').exists()).toBe(false)

    bootstrapSettled.value = true
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.notfound-page').exists()).toBe(true)
    expect(wrapper.text()).toContain('页面不存在或功能未启用')

    wrapper.unmount()
  })
})
