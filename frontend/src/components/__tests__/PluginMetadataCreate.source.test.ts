// B2c 源码守卫：插件元数据创建弹窗是唯一创建入口。
// ① 旧面板组件（components/PluginMetadata.vue）已随 scoped 单实现批次删除，不得回流；
// ② 唯一宿主 PluginMetadataList 必须引用共享创建弹窗，不得内联创建弹窗/直接调创建 API；
// ③ 可选插件过滤共用 utils/pluginMetadataCatalog 单点实现（不得再复制一套）。
// 2026-11-22（AGENTS #93 / shared-core-plan A 推广第 3 个卡片类资源）：面板插件元数据 Tab
// 直接渲染 PluginMetadataList 的 scoped 形态，原「面板 + 独立页」两处消费收敛为「页面组件一处」。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function src(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf-8')
}

/** 面板专属组件（已删除；断言反转 #217：由「不得含分类树」改为「不得回流」） */
const PANEL = 'components/PluginMetadata.vue'
const PAGE = 'views/PluginMetadataList.vue'
const MODAL = 'components/PluginMetadataCreateModal.vue'

describe('插件元数据创建入口单源（B2c）', () => {
  it('旧面板组件不得回流（唯一宿主 = views/PluginMetadataList.vue，含其 scoped 形态）', () => {
    expect(() => src(PANEL), '面板专属组件已删除').toThrow()
    const central = src('views/CentralList.vue')
    expect(central).not.toMatch(/components\/PluginMetadata\.vue/)
  })

  it('唯一宿主工具条提供「添加插件元数据」主按钮（页面页头 + 面板 scoped 紧凑钮）', () => {
    const s = src(PAGE)
    expect(s).toMatch(/添加插件元数据/)
    expect(s).toMatch(/openCreateModal/)
    // 面板形态的入口 = 工具条左侧紧凑钮（#90 页头动作区的 scoped 替代）
    expect(s).toContain('data-test="scope-add-plugin-metadata"')
  })

  it('唯一宿主引用共享创建弹窗，且不再内联创建逻辑', () => {
    const s = src(PAGE)
    expect(s, `${PAGE} 必须引用共享创建弹窗`).toMatch(/PluginMetadataCreateModal/)
    expect(s, `${PAGE} 不得保留旧内联创建实现`).not.toMatch(/handleCreateDirect/)
    // 页面不得再直接调创建 API（提交已收进弹窗）
    expect(s).not.toMatch(/addClusterPluginMetadata/)
    // 页面内联创建弹窗已删（表单字段随共享组件）
    expect(s).not.toMatch(/create-info-box/)
    // 旧面板的分类树结构类名不得在唯一宿主回流
    for (const cls of ['available-panel', 'plugin-tree', 'tree-item', 'tree-connector', 'category-header']) {
      expect(s, `${cls} 不应出现`).not.toContain(cls)
    }
  })

  it('提交端点只在共享弹窗内出现（页面不直调创建 API）', () => {
    expect(src(MODAL)).toMatch(/addClusterPluginMetadata/)
    expect(src(PAGE)).not.toMatch(/addClusterPluginMetadata/)
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
