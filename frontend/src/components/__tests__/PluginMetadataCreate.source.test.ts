// B2c 源码守卫：插件元数据创建弹窗是唯一创建入口。
// ① 面板可用插件分类树已按用户裁决移除（面板形态与独立页一致，只留已配置列表）；
// ② 面板与独立页必须引用共享创建弹窗，不得各自内联创建弹窗/直接调创建 API；
// ③ 可选插件过滤共用 utils/pluginMetadataCatalog 单点实现（不得再复制一套）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function src(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf-8')
}

const PANEL = 'components/PluginMetadata.vue'
const PAGE = 'views/PluginMetadataList.vue'
const MODAL = 'components/PluginMetadataCreateModal.vue'

describe('插件元数据创建入口单源（B2c）', () => {
  it('面板只留「已配置插件」单列：可用插件分类树（面板/分类头/树内卡片）已按用户裁决移除', () => {
    const s = src(PANEL)
    expect(s).not.toMatch(/add-btn/)
    expect(s).not.toMatch(/addPlugin/)
    // 树结构类名不得回流（形态与独立页 /plugin-metadata 一致）
    for (const cls of ['available-panel', 'plugin-tree', 'tree-item', 'tree-connector', 'category-header']) {
      expect(s, `${cls} 不应再出现在面板`).not.toContain(cls)
    }
    expect(s).not.toMatch(/plugin-card/)
    // 可选插件数据不再由面板拉取/过滤（创建弹窗自持）
    expect(s).not.toMatch(/filterMetadataPlugins/)
    expect(s).not.toMatch(/metadataPlugins/)
  })

  it('面板工具条提供「添加插件元数据」主按钮（打开共享弹窗）', () => {
    const s = src(PANEL)
    expect(s).toMatch(/class="node-actions"/)
    expect(s).toMatch(/添加插件元数据/)
    expect(s).toMatch(/createVisible = true/)
  })

  it('面板与独立页都引用共享创建弹窗，且不再各自内联创建逻辑', () => {
    for (const f of [PANEL, PAGE]) {
      const s = src(f)
      expect(s, `${f} 必须引用共享创建弹窗`).toMatch(/PluginMetadataCreateModal/)
      expect(s, `${f} 不得保留旧内联创建实现`).not.toMatch(/handleCreateDirect/)
    }
    // 独立页不得再直接调创建 API（提交已收进弹窗）
    expect(src(PAGE)).not.toMatch(/addClusterPluginMetadata/)
    // 页面内联创建弹窗已删（表单字段随共享组件）
    expect(src(PAGE)).not.toMatch(/create-info-box/)
  })

  it('提交端点只在共享弹窗内出现（页面/面板不直调创建 API）', () => {
    expect(src(MODAL)).toMatch(/addClusterPluginMetadata/)
    expect(src(PANEL)).not.toMatch(/addClusterPluginMetadata/)
  })

  it('插件下拉必须填满表单列（antd .ant-select 默认 inline-block/width:auto，空值时塌成窄框）', () => {
    const s = src(MODAL)
    expect(s).toMatch(/\.plugin-name-select \{\n\s+width: 100%;/)
  })

  it('可选插件过滤共用 utils/pluginMetadataCatalog（单一实现）', () => {
    // 面板已无可用插件清单（用户裁决移除分类树）：只剩独立页 + 共享创建弹窗两个消费方
    for (const f of [PAGE, MODAL]) {
      expect(src(f), `${f} 必须走共享过滤函数`).toMatch(/filterMetadataPlugins/)
    }
    const util = src('utils/pluginMetadataCatalog.ts')
    expect(util).toMatch(/export function filterMetadataPlugins/)
    expect(util).toMatch(/export function toMetadataPlugins/)
  })
})

describe('插件元数据创建弹窗 · 插件下拉占位', () => {
  it('声明 placeholder「请选择插件」，且初值用 null（空串会被 antd 渲染成空白）', () => {
    const s = src(MODAL)
    expect(s).toContain('placeholder="请选择插件"')
    expect(s).toMatch(/plugin_name:\s*null/)
    expect(s).not.toMatch(/plugin_name:\s*''/)
  })
})
