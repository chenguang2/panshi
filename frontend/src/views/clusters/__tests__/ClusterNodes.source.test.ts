// ClusterNodes（统一管理节点 Tab）源码守卫：node-management-ux-batch2 1.4 / design D9
// 「节点状态控件与措辞统一」需求：节点语境 = 启用/禁用（「正常」废弃）。
// 既有守卫机制（CentralList.source.test.ts / NodeList.source.test.ts）的 Tab 侧扩展。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function src(): string {
  return readFileSync(resolve(process.cwd(), 'src/views/clusters/ClusterNodes.vue'), 'utf-8')
}

// ── batch3 5.1 / F3：Tab 全部动作确认走共享 showDangerConfirm，手写确认机制清零 ──
describe('ClusterNodes 动作确认收敛守卫（batch3 5.1）', () => {
  it('confirmState/showConfirm/executeConfirm 与手写确认模板零残留', () => {
    const s = src()
    expect(s).not.toContain('confirmState')
    expect(s).not.toContain('executeConfirm')
    expect(s).not.toContain('showConfirm')
  })

  it('动作确认统一 showDangerConfirm（全危险红语义）', () => {
    expect(src()).toContain('showDangerConfirm')
  })
})

// ── 措辞守卫（batch2 1.4 / design D9）：节点语境 = 启用/禁用（「正常」废弃）──
describe('ClusterNodes 措辞守卫（batch2 1.4 / D9）', () => {
  it('表单 a-select 与批量导入 select 状态选项为「启用/禁用」', () => {
    const s = src()
    expect(s).toContain('<a-select-option :value="1">启用</a-select-option>')
    expect(s).toContain('<a-select-option :value="0">禁用</a-select-option>')
    expect(s).toContain('<option :value="1">启用</option>')
    expect(s).toContain('<option :value="0">禁用</option>')
  })

  it('节点语境零「正常」措辞残留', () => {
    expect(src()).not.toContain('>正常<')
  })
})
