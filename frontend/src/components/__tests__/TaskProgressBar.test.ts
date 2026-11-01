import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TaskProgressBar from '../TaskProgressBar.vue'

/** 节点任务分段进度（node-task-ux-optimization D6 6.4） */
function mountBar(props: Record<string, unknown>) {
  return mount(TaskProgressBar, { props })
}

/** 读取分段宽度百分比（样式串里 width: 25%） */
function widthOf(el: { attributes: (name: string) => string | undefined }): number {
  const style = el.attributes('style') || ''
  const m = style.match(/width:\s*([\d.]+)%/)
  return m ? Number(m[1]) : NaN
}

describe('TaskProgressBar.vue - 分段', () => {
  it('各段宽度按计数占总节点数比例', () => {
    const wrapper = mountBar({ success: 2, failed: 1, skipped: 1, cancelled: 0, total: 8 })
    expect(widthOf(wrapper.find('.tpb-seg-success'))).toBeCloseTo(25)
    expect(widthOf(wrapper.find('.tpb-seg-failed'))).toBeCloseTo(12.5)
    expect(widthOf(wrapper.find('.tpb-seg-skipped'))).toBeCloseTo(12.5)
    expect(wrapper.find('.tpb-seg-cancelled').exists()).toBe(false)
  })

  it('失败任务必须出现可见红段（不能是空灰条）', () => {
    const wrapper = mountBar({ success: 0, failed: 2, total: 2 })
    const failedSeg = wrapper.find('.tpb-seg-failed')
    expect(failedSeg.exists()).toBe(true)
    expect(widthOf(failedSeg)).toBeCloseTo(100)
    expect(wrapper.find('.tpb-seg-success').exists()).toBe(false)
    expect(wrapper.text()).toContain('失败 2')
    expect(wrapper.text()).toContain('100%')
  })

  it('取消节点单独成段（与失败区分）', () => {
    const wrapper = mountBar({ success: 0, failed: 0, skipped: 0, cancelled: 3, total: 6 })
    expect(widthOf(wrapper.find('.tpb-seg-cancelled'))).toBeCloseTo(50)
    expect(wrapper.text()).toContain('取消 3')
  })

  it('执行中：剩余份额渲染条纹动画段', () => {
    const wrapper = mountBar({ success: 1, failed: 0, total: 4, running: true })
    const runningSeg = wrapper.find('.tpb-seg-running')
    expect(runningSeg.exists()).toBe(true)
    expect(widthOf(runningSeg)).toBeCloseTo(75)
  })

  it('非执行中不渲染剩余动画段', () => {
    const wrapper = mountBar({ success: 1, failed: 0, total: 4 })
    expect(wrapper.find('.tpb-seg-running').exists()).toBe(false)
  })
})

describe('TaskProgressBar.vue - 文案', () => {
  it('百分比取完成度（成功+失败+跳过+取消）/总数，不是成功率', () => {
    const wrapper = mountBar({ success: 3, failed: 1, skipped: 1, cancelled: 1, total: 10 })
    expect(wrapper.text()).toContain('60%')
  })

  it('有跳过/取消时才追加对应计数', () => {
    const onlyDone = mountBar({ success: 2, failed: 1, total: 3 })
    expect(onlyDone.text()).toContain('成功 2')
    expect(onlyDone.text()).toContain('失败 1')
    expect(onlyDone.text()).not.toContain('跳过')
    expect(onlyDone.text()).not.toContain('取消')

    const withExtra = mountBar({ success: 1, failed: 1, skipped: 2, cancelled: 3, total: 10 })
    expect(withExtra.text()).toContain('跳过 2')
    expect(withExtra.text()).toContain('取消 3')
  })

  it('total=0：空条 + 占位「—」，不渲染任何分段', () => {
    const wrapper = mountBar({ success: 0, failed: 0, total: 0 })
    expect(wrapper.find('.tpb-track').exists()).toBe(true)
    expect(wrapper.find('.tpb-seg').exists()).toBe(false)
    expect(wrapper.text()).toContain('—')
  })

  it('showText=false 时不渲染文案区', () => {
    const wrapper = mountBar({ success: 1, failed: 1, total: 2, showText: false })
    expect(wrapper.find('.tpb-text').exists()).toBe(false)
    expect(wrapper.find('.tpb-seg-success').exists()).toBe(true)
  })
})
