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

describe('统一管理·卡片动作双分支一致（central-management-ux-review-fixes）', () => {
  it('两个分组渲染分支（命名组/未分组）的卡片动作都带「更多 ▾」收纳菜单', () => {
    const s = src()
    // 历史坑：卡片模板在两个 v-for 分支各有一份，只改一处会让部分分组的卡片缺动作。
    // 卡片动作插槽的识别特征 = 含 viewClusterDetail（排除 PageHeader 的 #actions）。
    const cardActionBlocks = s
      .split('<template #actions>')
      .slice(1)
      .filter((b) => b.includes('viewClusterDetail'))
    expect(cardActionBlocks.length).toBe(2)
    for (const block of cardActionBlocks) {
      expect(block).toContain('更多 ▾')
      expect(block).toContain('onCardMenuClick($event, cluster)')
      expect(block).toContain('备份下载')
      expect(block).toContain('导出 Excel')
    }
  })
})
