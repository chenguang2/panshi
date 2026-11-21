// 节点表单状态控件守卫：下拉框 + 后果说明
// 背景（2026-10-04 用户反馈）：原「启用/停用」勾选框有歧义且不明显——勾选态与文案的关系不清，
// 且停用的后果（不进中继网关流量白名单）不可见，areatest 空 map 事件即此盲区所致。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function src(): string {
  return readFileSync(resolve(process.cwd(), 'src/views/NodeList.vue'), 'utf-8')
}

describe('节点表单状态控件（B2b-1：唯一实现在共享 NodeFormModal）', () => {
  it('表单状态为下拉框（启用/禁用），不再是勾选框', () => {
    const s = readFileSync(resolve(process.cwd(), 'src/components/NodeFormModal.vue'), 'utf-8')
    expect(s).toContain('<a-select-option :value="1">启用</a-select-option>')
    expect(s).toContain('<a-select-option :value="0">禁用</a-select-option>')
    expect(s).not.toMatch(/type="checkbox"/)
    // 页面不再自持表单模型（statusCheck 已退场）
    expect(src()).not.toContain('statusCheck')
  })
  it('状态控件附带后果说明（禁用不入网关流量白名单）', () => {
    const s = readFileSync(resolve(process.cwd(), 'src/components/NodeFormModal.vue'), 'utf-8')
    expect(s).toContain('禁用的节点不进入中继网关流量白名单（不承载业务流量），但仍可执行节点任务与状态查询')
  })
  it('表格状态列可见节点禁用态（已禁用徽章，与 nginx 运行态并存）', () => {
    const s = src()
    // B4a：状态列接入共享原语 NodeStatusCell（variant="page"）——「已禁用」徽章与原语运行态
    // 徽章并排，解剖单点在组件内（页面只管传 enabled/runtime/execText）
    const block = s.match(/column\.key === 'status'[\s\S]{0,600}?\/>/)
    expect(block, '需存在 status 列模板（共享原语）').toBeTruthy()
    expect(block![0]).toContain('variant="page"')
    expect(block![0]).toContain(':enabled="record.status !== 0"')
    expect(block![0]).toContain(':runtime="nodeCellRuntime(record)"')
    const cell = readFileSync(resolve(process.cwd(), 'src/components/resource-cells/NodeStatusCell.vue'), 'utf-8')
    expect(cell, '「已禁用」徽章（管理开关）须与运行态徽章并存').toMatch(/v-if="!enabled"[\s\S]{0,200}已禁用/)
    expect(cell).toContain('text="已停止"')
  })
})

describe('B2b-1：节点单条表单共用守卫', () => {
  it('页面引用共享 NodeFormModal，不再自写表单模板与校验错误状态', () => {
    const s = src()
    expect(s).toContain('<NodeFormModal')
    expect(s).toContain("import NodeFormModal from '@/components/NodeFormModal.vue'")
    expect(s).not.toContain('formErrors')
    expect(s).not.toContain('handleFormSubmit')
    expect(s).not.toContain('formData.')
    expect(s).not.toContain('formSubmitting')
  })
  it('提交逻辑不在页面重写：createNode/updateNode 调用已迁至组件', () => {
    const s = src()
    expect(s).not.toContain('createNode')
    expect(s).not.toContain('updateNode')
    expect(s).toContain('@saved="onFormSaved"')
    expect(s).toContain('@close="closeFormModal"')
  })
})

describe('batch2 3.2 假排序守卫', () => {
  it('columns 零客户端 sorter（当前页 localeCompare 字符串序是错的；后端已全量数值 IP 排序）', () => {
    const s = src()
    // 客户端比较函数一律禁止（antd 只有 sorter 为函数时才本地排序；服务端排序用 sorter: true + @change）
    expect(s).not.toMatch(/sorter:\s*\(/)
    expect(s).not.toContain('localeCompare')
    // 反转（filter-architecture 平铺集群列）：允许「集群」列 sorter: true（服务端 sort_by=cluster），
    // 其余列仍不得带 sorter
    const sorterLines = s.split('\n').filter((l) => l.includes('sorter: true'))
    expect(sorterLines).toHaveLength(1)
    expect(sorterLines[0]).toContain("key: 'cluster'")
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
  it('emoji 操作图标换组件图标（🔍/▶/⏹/⟳/⋯；mockup-parity r2 后动作为 StrokeIcon 设计线稿）', () => {
    const s = src()
    for (const emoji of ['🔍', '▶', '⏹', '⟳', '⋯']) {
      expect(s).not.toContain(emoji)
    }
    // 动作图标 = StrokeIcon（设计稿 stroke 线稿单点）；更多触发器的三圆横排 = StrokeIcon dots
    // （r5-①：antd MoreOutlined 是竖排三点、且带边框白底，已退场）；
    // toolbar 刷新图标在共享 TableToolbar（ReloadOutlined，与设计刷新同形）。
    expect(s).toContain('StrokeIcon')
    expect(s).toContain('<StrokeIcon name="dots" />')
    expect(s).not.toContain('MoreOutlined')
    // 搜索框已收敛到共享组件（ux-review 搜索一致性）：放大镜图标在 SearchInput 内，页面只引用组件
    expect(s).toContain('SearchInput')
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

// ── 节点批量删除（2026-11-21：批量条补入口，面板 Tab 与页面同一实现）────────────
describe('批量条：批量删除入口（节点）', () => {
  it('批量条含危险色「批量删除」（未选禁用、选中显示计数、与动作组用分隔线隔开）', () => {
    const s = src()
    const bar = s.match(/<div class="l5-batchbar"[\s\S]*?清除选择/)
    expect(bar, '需存在批量条').toBeTruthy()
    expect(bar![0]).toContain('data-test="batch-delete"')
    expect(bar![0]).toContain('handleBatchDelete')
    expect(bar![0]).toMatch(/批量删除<span v-if="selectedNodeKeys\.length">\(\{\{ selectedNodeKeys\.length \}\}\)/)
    expect(bar![0]).toContain(':disabled="!selectedNodeKeys.length"')
    expect(bar![0]).toContain('btn btn-danger btn-sm need-sel')
    // 危险动作与动作组之间保留分隔线（b-sep），且位于「清除选择」之前（删除类靠右）
    const sep = bar![0].lastIndexOf('<span class="b-sep"></span>')
    const del = bar![0].indexOf('data-test="batch-delete"')
    expect(sep).toBeGreaterThan(-1)
    expect(del).toBeGreaterThan(sep)
  })

  it('批量删除不内联请求：api/nodes 薄封装 + 共享分组执行核心 + 节点专用确认', () => {
    const s = src()
    expect(s, '视图不得内联 api.delete').not.toContain('api.delete(')
    expect(s).toContain('runClusterGroupedBatchDelete')
    expect(s).toContain('showNodeDeleteConfirm')
    const api = readFileSync(resolve(process.cwd(), 'src/api/nodes.ts'), 'utf-8')
    expect(api).toContain('export function deleteNodesBatch')
    expect(api).toMatch(/api\.delete\(`\/clusters\/\$\{clusterId\}\/nodes`/)
  })
})
