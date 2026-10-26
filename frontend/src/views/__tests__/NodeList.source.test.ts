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
    // batch2 1.2/1.3 后状态列为 BadgeStatus 三态 + 并排配置态徽章（结构变长，放宽窗口到 1200）
    const block = s.match(/column\.key === 'status'[\s\S]{0,1200}?<\/template>/)
    expect(block, '需存在 status 列模板').toBeTruthy()
    expect(block![0]).toMatch(/record\.status === 0[\s\S]{0,200}已禁用/)
  })
})

describe('batch2 3.2 假排序守卫', () => {
  it('columns 零客户端 sorter（当前页 localeCompare 字符串序是错的；后端已全量数值 IP 排序）', () => {
    const s = src()
    expect(s).not.toMatch(/sorter:\s*\(/)
    expect(s).not.toContain('sorter: true')
    expect(s).not.toContain('localeCompare')
  })
})

describe('batch2 4.2 确认弹窗收敛守卫（batch3 1.3 起统一入口为 showDangerConfirm）', () => {
  it('confirmState/executeConfirm/手写确认模板零残留，动作确认统一 showDangerConfirm', () => {
    const s = src()
    expect(s, 'confirmState 应删除').not.toContain('confirmState')
    expect(s, 'executeConfirm 应删除').not.toContain('executeConfirm')
    expect(s, '页内 showConfirm 函数应删除（删除确认走共享 showNodeDeleteConfirm）').not.toContain(
      'function showConfirm',
    )
    expect(s, '动作确认应走共享 showDangerConfirm（batch3 1.3 上移后的统一入口）').toContain('showDangerConfirm')
    expect(s, '视图内不应再有本地危险红包装（okDanger 细节归 useOverlayModal）').not.toContain('okDanger')
  })

  it('启动/停止/reload 确认保留危险色语义与按钮文案；取消安装走共享工厂（batch3 1.2）', () => {
    const s = src()
    for (const text of ['确认启动', '确认停止', '确认重载']) {
      expect(s, `应保留文案 ${text}`).toContain(text)
    }
    // 取消安装确认已收敛到 createCancelNodeInstallHandler（文案在工厂内钉死）
    expect(s, '取消安装应走共享工厂').toContain('createCancelNodeInstallHandler')
    // 危险红语义由共享 showDangerConfirm 承载（useOverlayModal.test.ts 钉死 btn-danger）
    expect(s).toContain('showDangerConfirm')
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
  it('本地回退命令用相对 -i inventory；ssh 预览形态由共享 buildNodeInstallCommand 承载（D3；batch3 1.1 收敛）', () => {
    const s = src()
    expect(s).toContain('-i inventory')
    // ssh 最小通用形态（ssh -p ${port}）已收敛进 utils/nodeInstallCommand（该文件内钉死），
    // 视图级只守引用关系与无硬编码回潮。
    expect(s).toContain('buildNodeInstallCommand')
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
