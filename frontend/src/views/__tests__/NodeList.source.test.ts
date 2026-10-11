// 节点表单状态控件守卫：下拉框 + 后果说明
// 背景（2026-10-04 用户反馈）：原「启用/停用」勾选框有歧义且不明显——勾选态与文案的关系不清，
// 且停用的后果（不进中继网关流量白名单）不可见，areatest 空 map 事件即此盲区所致。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function src(): string {
  return readFileSync(resolve(process.cwd(), 'src/views/NodeList.vue'), 'utf-8')
}

describe('节点表单状态控件', () => {
  it('状态为下拉框（启用/禁用），不再是勾选框', () => {
    const s = src()
    expect(s).toMatch(/<select class="form-input" v-model="formData\.statusCheck">/)
    expect(s).toContain(':value="true">启用<')
    expect(s).toContain(':value="false">禁用<')
    expect(s).not.toMatch(/type="checkbox" v-model="formData\.statusCheck"/)
  })
  it('状态控件附带后果说明（禁用不入网关流量白名单）', () => {
    expect(src()).toContain('禁用的节点不进入中继网关流量白名单（不承载业务流量），但仍可执行节点任务与状态查询')
  })
  it('表格状态列可见节点禁用态（已禁用徽章，与 nginx 运行态并存）', () => {
    const s = src()
    const block = s.match(/column\.key === 'status'[\s\S]{0,600}?<\/template>/)
    expect(block, '需存在 status 列模板').toBeTruthy()
    expect(block![0]).toMatch(/record\.status === 0[\s\S]{0,200}已禁用/)
  })
})

// ── node-management-ux-batch1 源码守卫（1.3 / 2.4 / 2.6 / 2.7 / 3.1 / 3.2）────────

describe('batch1：删除流程统一（1.3）', () => {
  it('行删除走 showNodeDeleteConfirm + executeDeleteWithProgress 共享链路，handleDelete 不再用页内 showConfirm', () => {
    const s = src()
    expect(s).toContain('showNodeDeleteConfirm')
    expect(s).toContain('executeDeleteWithProgress')
    // 页内 confirm 仍保留给启动/停止/reload 等动作确认，但不得再被删除流程使用
    const fn = s.match(/function handleDelete[\s\S]*?\n}/)
    expect(fn, '需存在 handleDelete 函数').toBeTruthy()
    expect(fn![0]).not.toContain('showConfirm')
    // 固定语义：删除数据库必选、Edge 不联动删除（D2）
    expect(fn![0]).toMatch(/deleteDb:\s*true/)
    expect(fn![0]).toMatch(/deleteEdge:\s*false/)
  })
})

describe('batch1：死代码清理（2.4）', () => {
  it('操作日志残留 UI（.operation-log / opLogVisible）零残留', () => {
    const s = src()
    expect(s).not.toContain('operation-log')
    expect(s).not.toContain('opLogVisible')
    expect(s).not.toContain('opLogs')
  })
  it('API 错误提示统一走 getApiErrorMessage，无手写 detail 解析（2.2）', () => {
    const s = src()
    expect(s).toContain('getApiErrorMessage')
    expect(s).not.toMatch(/error\.response\?\.data\?\.detail/)
  })
})

describe('batch1：命令页签与命令预览（2.6）', () => {
  it('命令零开发机硬编码：/home/qcg 绝对路径、jboss@ 账号、id_rsa 密钥', () => {
    const s = src()
    expect(s).not.toContain('/home/qcg')
    expect(s).not.toContain('jboss@')
    expect(s).not.toContain('id_rsa')
  })
  it('本地回退命令用相对 -i inventory，ssh 预览为最小通用形态（D3）', () => {
    const s = src()
    expect(s).toContain('-i inventory')
    expect(s).toMatch(/ssh -p \$\{/)
  })
})

describe('batch1：操作图标与筛选栏（2.7）', () => {
  it('emoji 操作图标换 AntDV 图标组件（🔍/▶/⏹/⟳/⋯）', () => {
    const s = src()
    for (const emoji of ['🔍', '▶', '⏹', '⟳', '⋯']) {
      expect(s).not.toContain(emoji)
    }
    for (const icon of [
      'SearchOutlined',
      'PlayCircleOutlined',
      'PauseCircleOutlined',
      'ReloadOutlined',
      'MoreOutlined',
    ]) {
      expect(s).toContain(icon)
    }
  })
  it('筛选栏允许换行（nowrap→wrap）', () => {
    const s = src()
    const block = s.match(/\.node-filter-bar \{[\s\S]*?\}/)
    expect(block, '需存在 .node-filter-bar 样式块').toBeTruthy()
    expect(block![0]).toContain('flex-wrap: wrap')
  })
})

describe('batch1：SSE 结构化事件展示过滤（3.1 / design D4，仅消费侧）', () => {
  it('全部 onLine 消费点经 appendStreamLine 过滤，裸行直推只存在于过滤助手内部', () => {
    const s = src()
    expect(s).toContain('isStructuredSseEvent')
    const onLineCount = (s.match(/onLine:/g) || []).length
    expect(onLineCount, 'NodeList 应有多处 onLine 消费点').toBeGreaterThanOrEqual(4)
    const filteredCount = (s.match(/appendStreamLine\(/g) || []).length
    expect(filteredCount, '每个 onLine 消费点都应走 appendStreamLine').toBeGreaterThanOrEqual(onLineCount)
    // 裸推入写法只允许 1 处（appendStreamLine 助手内部的过滤点本身）
    const rawPushes = s.match(/execLogs\.value = \[\.\.\.execLogs\.value,\s*line\]/g) || []
    expect(rawPushes.length, '裸行直推只允许 appendStreamLine 内部 1 处').toBe(1)
  })
})

describe('batch1：结果抽屉动作类摘要（3.2 / design D5）', () => {
  it('抽屉显式传 mode：安装流 install、动作流 action，模板经 execDrawerMode', () => {
    const s = src()
    expect(s).toContain(':mode="execDrawerMode"')
    expect(s).toMatch(/execDrawerMode\.value = 'install'/)
    expect(s).toMatch(/execDrawerMode\.value = 'action'/)
  })
})
