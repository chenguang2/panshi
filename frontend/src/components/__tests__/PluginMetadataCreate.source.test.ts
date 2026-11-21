// B2c 源码守卫：插件元数据创建弹窗是唯一创建入口。
// ① 面板「可用插件」卡片上不得再有「添加」快捷入口（用户裁决：只留弹窗）；
// ② 面板与独立页必须引用共享创建弹窗，不得各自内联创建弹窗/直接调创建 API；
// ③ 三处可选插件过滤共用 utils/pluginMetadataCatalog 单点实现（不得再复制一套）。
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
  it('面板可用插件卡不得再有「添加」按钮 / addPlugin（卡片仅作信息展示）', () => {
    const s = src(PANEL)
    expect(s).not.toMatch(/add-btn/)
    expect(s).not.toMatch(/addPlugin/)
    // 信息展示保留：可用插件树与卡片仍在（否则空态/计数断言无从谈起）
    expect(s).toMatch(/available-panel/)
    expect(s).toMatch(/plugin-card/)
    expect(s).toMatch(/plugin-card-desc/)
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
    for (const f of [PANEL, PAGE, MODAL]) {
      expect(src(f), `${f} 必须走共享过滤函数`).toMatch(/filterMetadataPlugins/)
    }
    const util = src('utils/pluginMetadataCatalog.ts')
    expect(util).toMatch(/export function filterMetadataPlugins/)
    expect(util).toMatch(/export function toMetadataPlugins/)
  })
})
