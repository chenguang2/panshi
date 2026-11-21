// 统一管理（CentralList）节点表单状态守卫：与节点管理（NodeList）措辞/提示统一
// 统一规则（2026-10-04 用户确认）：节点维度 = 启用/禁用 + 同一条白名单后果提示；集群维度不动。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function src(): string {
  return readFileSync(resolve(process.cwd(), 'src/views/CentralList.vue'), 'utf-8')
}

describe('统一管理·节点单条表单（B2b-1 反转）', () => {
  it('面板不再内联节点表单：nodeFormRef / validateIP / handleNodeSubmit 绑定零残留', () => {
    const s = src()
    expect(s).not.toContain('nodeFormRef')
    expect(s).not.toContain('validateIP')
    expect(s).not.toContain('handleNodeSubmit')
    expect(s).not.toContain('<a-form')
  })
  it('状态选项「启用/禁用」+ 白名单后果提示迁至共享 NodeFormModal（唯一实现）', () => {
    const s = readFileSync(resolve(process.cwd(), 'src/components/NodeFormModal.vue'), 'utf-8')
    expect(s).toContain('<a-select-option :value="1">启用</a-select-option>')
    expect(s).toContain('<a-select-option :value="0">禁用</a-select-option>')
    expect(s).toContain('禁用的节点不进入中继网关流量白名单（不承载业务流量），但仍可执行节点任务与状态查询')
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

// ── 最大化面板切换动效（方案 A，2026-11-21）────────────────────────────────
// 红线：动效层绝不能带 :key（会让 7 个 Tab 子组件整体重挂载，丢滚动/选中态并重复拉取）；
// 动效只许动 opacity/transform；reduced-motion 必须降级为纯淡入；切换只用方向类，不影响布局。
describe('统一管理·最大化面板切换动效（方案 A）', () => {
  const s = () => src()

  /**
   * Tab 分支区（`.max-swap` 起点 → 紧随其后的第一个 `<ClusterFormModal`）。
   * 旧实现用 `<!-- Node Form Modal -->` 作结束标记，但该注释在模板中已不存在（indexOf 返回 -1 →
   * slice 到文件末尾），断言会被脚本段与其它合法 v-else-if 污染；改用真实存在的锚点。
   */
  function tabBody(): string {
    const text = s()
    const start = text.indexOf('class="max-swap"')
    expect(start, '缺少 .max-swap 包裹层').toBeGreaterThan(-1)
    const end = text.indexOf('<ClusterFormModal', start)
    expect(end, 'Tab 分支区未正确收口').toBeGreaterThan(start)
    return text.slice(start, end)
  }

  /** 动效段（.max-swap 规则起点 → .dtabs 之前的全部 CSS） */
  function animSection() {
    const text = src()
    const start = text.indexOf('.max-swap {')
    expect(start, '缺少切换动效段（.max-swap 规则）').toBeGreaterThan(-1)
    const end = text.indexOf('.dtabs {', start)
    expect(end, '动效段未正确收口').toBeGreaterThan(start)
    return text.slice(start, end)
  }

  it('动效包裹层 .max-swap 不带 :key（Tab 子组件不得整体重挂载）', () => {
    const text = s()
    const tagStart = text.indexOf('class="max-swap"')
    expect(tagStart, '缺少 .max-swap 包裹层').toBeGreaterThan(-1)
    const tagStartAt = text.lastIndexOf('<', tagStart)
    const tagEnd = text.indexOf('>', tagStart)
    const tag = text.slice(tagStartAt, tagEnd)
    expect(tag).toContain('ref="swapEl"')
    expect(tag).toContain(':class="swapClass"')
    expect(tag, '.max-swap 禁止 :key（会重挂载 Tab 子组件）').not.toContain(':key')
    // 七个 Tab 分支原样搬入包裹层（结构未丢）；七个 Tab 全部 = 对应独立页组件的 scoped 形态
    for (const comp of [
      'UpstreamList',
      'RouteList',
      'PluginConfigList',
      'GlobalRuleList',
      'StaticResourceList',
      'PluginMetadataList',
      'NodeList',
    ]) {
      expect(tabBody(), `缺少 <${comp}>`).toContain(`<${comp}`)
    }
    // 旧面板专属组件（components/PluginMetadata.vue / views/clusters/ClusterStaticResources.vue）不得回流
    expect(text).not.toContain('components/PluginMetadata.vue')
    expect(text).not.toMatch(/<PluginMetadata\s/)
    expect(text).not.toContain('views/clusters/ClusterStaticResources.vue')
    expect(text).not.toMatch(/<ClusterStaticResources\s/)
  })

  it('Tab 分支一律显式 v-if（不得裸 v-else，也不得混入 v-else-if 串联）', () => {
    // 2026-11-22（面板插件组 Tab 实测）：上游/路由/插件组/全局规则已改为独立 `v-if` 容器，
    // 节点 Tab 若仍写裸 `v-else`，它会挂到 globalPlugins 的 `v-else-if` 上 →
    // 除 globalRules/globalPlugins/staticResources 外的每个 Tab 下方都叠渲染一块节点表格。
    // 2026-11-22（插件元数据批）：七 Tab 全部收敛为独立 `v-if`，正文不得再出现任何 v-else / v-else-if 分支。
    const body = tabBody()
    expect(body, 'Tab 分支禁止裸 v-else（须写 activeTab 显式条件）').not.toMatch(/<div\s+v-else\s+class="tab-content"/)
    expect(body, 'Tab 分支禁止 v-else-if 串联（条件须各自独立成 v-if）').not.toContain('v-else-if')
    // 七个 Tab 分支均带显式条件
    for (const key of [
      'upstreams',
      'routes',
      'pluginConfigs',
      'globalRules',
      'staticResources',
      'globalPlugins',
      'nodes',
    ]) {
      expect(body, `缺少 activeTab === '${key}' 的显式 v-if 分支`).toContain(
        `v-if="maximizedCluster.activeTab === '${key}'"`,
      )
    }
    // 插件元数据 Tab = PluginMetadataList 的 scoped 形态（面板不传 nodes/cluster-name 等旧 props）
    expect(body).toContain('<PluginMetadataList :scoped-cluster-id="maximizedCluster.id" @refresh="loadClusters" />')
    expect(body).not.toContain(':nodes="maximizedCluster.nodes"')
    // 静态资源 Tab = StaticResourceList 的 scoped 形态（2026-11-22 A 推广最后一块；
    // 旧面板 props cluster/clusters/open-publish-modal/load-routes 随之退场）
    expect(body).toContain('<StaticResourceList :scoped-cluster-id="maximizedCluster.id" @refresh="loadClusters" />')
    expect(body).not.toContain(':load-routes="loadRoutes"')
    expect(body).not.toContain(':open-publish-modal="openPublishModal"')
  })

  it('三个关键帧齐备：方向滑入两条 + 切 Tab 淡入', () => {
    const a = animSection()
    expect(a).toContain('@keyframes maxInNext')
    expect(a).toContain('@keyframes maxInPrev')
    expect(a).toContain('@keyframes maxTabFade')
    expect(a).toContain('@keyframes maxIdent')
    // 200ms 同缓动、切 Tab 140ms；方向类按 dir-next / dir-prev 区分
    expect(a).toMatch(/\.max-swap\.fx-cluster\.dir-next \{[\s\S]*?animation: maxInNext 200ms/)
    expect(a).toMatch(/\.max-swap\.fx-cluster\.dir-prev \{[\s\S]*?animation: maxInPrev 200ms/)
    expect(a).toMatch(/\.max-swap\.fx-tab \{[\s\S]*?animation: maxTabFade 140ms/)
  })

  it('reduced-motion 降级为纯淡入（关闭位移与身份区动画）', () => {
    const a = animSection()
    const start = a.indexOf('@media (prefers-reduced-motion: reduce)')
    expect(start, '缺少 prefers-reduced-motion 块').toBeGreaterThan(-1)
    const block = a.slice(start)
    expect(block).toContain('maxReducedFade 90ms')
    expect(block).toContain('.max-ident')
    expect(block).toContain('animation: none !important')
    expect(block).toContain('.mini-item')
  })

  it('动效只动 opacity/transform，不含布局属性动画', () => {
    const a = animSection()
    for (const prop of ['height:', 'margin:', 'top:', 'left:']) {
      expect(a.includes(prop), `动效段不得出现布局属性 ${prop}`).toBe(false)
    }
  })

  it('切 Tab 仅在 activeTab 真变化时播放（开同页签不重播）', () => {
    const text = s()
    expect(text).toMatch(/const changed = cluster\.activeTab !== key[\s\S]*?if \(changed\) void playSwap\('tab'\)/)
    // 集群切换方向按 mini-bar 下标判定（末→首回落 prev，不循环）
    expect(text).toMatch(/return to > from \? 'next' : 'prev'/)
    expect(text).toContain('void swapEl.value.offsetWidth')
  })
})
