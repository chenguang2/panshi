// ux-review-2026-10-04 L 批次源码守卫（编号对齐报告 L 表）
// 实修：L1（登录标点/聚焦）、L2（列头排版）、L5（描述两行收敛）、L6（高频操作提频）、L7（卡片按钮主次）、L10（备份空态引导）、L11（明文密码说明）
// 勘误不修：L4（Tools.vue 工具按钮已有 a-tooltip 悬浮标签，OCR 看不到悬浮态）、
// L9（实况「TTL: 15s」技术记法四页一致，OCR 所见逗号形不存在）、L12（迁移已有风险文案 + 清空确认门）
// 暂缓：L3（指标自定义时间范围）、L8（概览环比）——功能级工作，待拍板后实施
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function src(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf-8')
}

describe('L1 登录页标点与聚焦', () => {
  it('忘记密码使用全角问号', () => {
    expect(src('views', 'Login.vue')).toContain('忘记密码？')
    expect(src('views', 'Login.vue')).not.toContain('忘记密码?')
  })
  it('用户名输入框自动聚焦（保留 id 选择器）', () => {
    const m = src('views', 'Login.vue').match(/<a-input[^>]*id="username"[^>]*>/)
    expect(m, '需存在 #username 输入框').toBeTruthy()
    expect(m![0]).toContain('autofocus')
  })
})

describe('L2 节点页中英文排版规范', () => {
  it('零「Edge安装/OpenResty安装」拼接形态', () => {
    const s = src('views', 'NodeList.vue')
    expect(s).not.toMatch(/Edge安装|OpenResty安装|EDGE安装|OPENRESTY安装/)
    expect(s).toContain('Edge 安装路径')
    expect(s).toContain('OpenResty 安装路径')
  })
})

describe('L5 卡片描述两行收敛', () => {
  it.each(['PluginConfigList.vue', 'GlobalRuleList.vue'])('%s 描述区两行截断', (f) => {
    expect(src('views', f)).toMatch(/line-clamp/)
  })
})

describe('L6 高频操作提频露出', () => {
  it('用户管理：编辑直接露出，⋯ 保留其余', () => {
    const s = src('views', 'UserList.vue')
    expect(s).toMatch(/<a-button[^>]*@click="editUser\(record\)"[^>]*>编辑<\/a-button>/)
    expect(s).not.toMatch(/<a-menu-item[^>]*@click="editUser\(record\)"/)
  })
  it('节点任务：详情直接露出，⋯ 保留其余', () => {
    const s = src('views', 'NodeTaskCenter.vue')
    expect(s).toMatch(/<a-button[^>]*@click="openDetail\(record\)"[^>]*>详情<\/a-button>/)
    expect(s).not.toMatch(/<a-menu-item[^>]*@click="openDetail\(record\)"/)
  })
})

describe('L7 集群卡片按钮主次', () => {
  it('详情为次级强调按钮（btn-secondary），其余保持 ghost', () => {
    const s = src('views', 'ClusterList.vue')
    expect(s).toMatch(/<button class="btn btn-secondary btn-sm cl-action-btn" @click="viewCluster\(c\)">详情<\/button>/)
    expect(s).toMatch(/<button class="btn btn-ghost btn-sm cl-action-btn" @click="testCluster\(c\)">连接测试/)
  })
})

describe('L10 备份空态引导', () => {
  it('从未备份时提示开启自动调度', () => {
    expect(src('components', 'DbBackupCard.vue')).toContain('从未备份（建议在「策略与保留」中开启自动调度）')
  })
})

describe('L11 明文密码教育说明', () => {
  it('清单页说明明文为有意设计（含脱敏历史教训）', () => {
    const s = src('views', 'AnsibleInventory.vue')
    expect(s).toMatch(/明文/)
    expect(s).toMatch(/脱敏/)
  })
})
