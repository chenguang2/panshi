// 统一管理（CentralList）节点表单状态守卫：与节点管理（NodeList）措辞/提示统一
// 统一规则（2026-10-04 用户确认）：节点维度 = 启用/禁用 + 同一条白名单后果提示；集群维度不动。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function src(): string {
  return readFileSync(resolve(process.cwd(), 'src/views/CentralList.vue'), 'utf-8')
}

describe('统一管理·节点表单状态控件', () => {
  it('状态选项为 启用/禁用（与节点管理一致）', () => {
    const s = src()
    expect(s).toContain(':value="1">启用<')
    expect(s).toContain(':value="0">禁用<')
  })
  it('附带与节点管理字面一致的白名单后果提示', () => {
    expect(src()).toContain('禁用的节点不进入中继网关流量白名单（不承载业务流量），但仍可执行节点任务与状态查询')
  })
})

describe('统一管理·卡片动作单循环一致（central-management-parity 断言反转）', () => {
  it('唯一的卡片动作插槽（renderGroups 单循环）带完整动作集：更多 ▾ 收纳菜单', () => {
    const s = src()
    // 断言反转（#217）：分组/未分组双分支模板已收敛为 renderGroups 单循环（旧「两份拷贝只改
    // 一处」的坑被结构性消除——动作插槽全页唯一）；历史双分支守卫随模板退场。
    const cardActionBlocks = s
      .split('<template #actions>')
      .slice(1)
      .filter((b) => b.includes('viewClusterDetail'))
    expect(cardActionBlocks.length).toBe(1)
    for (const block of cardActionBlocks) {
      expect(block).toContain('更多 ▾')
      expect(block).toContain('onCardMenuClick($event, cluster)')
      expect(block).toContain('备份下载')
      expect(block).toContain('导出 Excel')
    }
  })
})
