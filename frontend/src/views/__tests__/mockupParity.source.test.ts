// 设计稿还原度守卫（mockup-parity-standard）：
// 视觉对齐关键锚点全部钉在源码层，防止后续改版静默回潮到「列配置靠左」时代的解剖。
// 视觉判定本身走同数据注入截图对照（specs/mockup-parity-verification），此处只钉结构性锚点。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf-8')
const page = (f: string) => readFileSync(resolve(process.cwd(), 'src/views', f), 'utf-8')

describe('mockup-parity：三页表格卡挂 l5-card 作用域', () => {
  it.each([
    ['NodeList.vue', '.node-table'],
    ['UpstreamList.vue', '.upstream-table'],
    ['RouteList.vue', '.route-table'],
  ])('%s 表格容器 = table-container l5-card', (f) => {
    expect(page(f)).toContain('class="table-container l5-card"')
  })
})

describe('mockup-parity：L5 解剖段关键规则（style.css 单点）', () => {
  const scope = css.slice(css.indexOf('设计稿还原度对齐'))
  it('表头去大写、卡同底、9px 12px', () => {
    expect(scope).toMatch(/\.table-container\.l5-card \.ant-table-thead > tr > th \{[^}]*text-transform: none/)
    expect(scope).toMatch(/\.table-container\.l5-card \.ant-table-thead > tr > th \{[^}]*background: var\(--bg\)/)
    // !important 必要：antdv size="middle" 的 4 类选择器压过本段 3 类（r4-E1 实测内距从未生效）
    expect(scope).toMatch(/\.table-container\.l5-card \.ant-table-thead > tr > th \{[^}]*padding: 9px 12px !important/)
  })
  it('去单元格竖线（grid-table 覆盖），悬停 accent 4%', () => {
    expect(scope).toMatch(/\.table-container\.l5-card \.grid-table \.ant-table-cell \{[^}]*border-right: none/)
    expect(scope).toMatch(
      /\.table-container\.l5-card \.ant-table-tbody > tr:hover > td \{[^}]*oklch\(56% 0\.16 210 \/ 4%\)/,
    )
  })
  it('行内动作 hover accent 三件套 + 圆角 4px', () => {
    expect(scope).toMatch(/\.table-container\.l5-card \.action-cell \.ant-btn:hover,[^}]*\{[^}]*var\(--accent-bg\)/)
    expect(scope).toMatch(
      /\.table-container\.l5-card \.node-actions-wrap \.btn \{[^}]*border-radius: var\(--radius-sm\)/,
    )
  })
  it('分页条（ListPager）：28×28 mono 页码 + current 实心 accent + 卡内底部 border-top', () => {
    expect(css).toMatch(/\.l5-pager \{[^}]*border-top: 1px solid var\(--border\)/)
    expect(css).toMatch(/\.l5-pager \.p-btn \{[^}]*min-width: 28px[^}]*font-family: var\(--font-mono\)/)
    // 设计 .p-btn.active = 实心 accent + 白字（r4-⑤；原实现 10% 淡底 + accent 字）
    expect(css).toMatch(/\.l5-pager \.p-btn\.active,[\s\S]{0,120}background: var\(--accent\)/)
  })
})

describe('mockup-parity：页面接线锚点', () => {
  it('节点页：状态查询波形图标（StrokeIcon pulse）+ 操作列 v-sep', () => {
    const s = page('NodeList.vue')
    expect(s).toContain('class="v-sep"')
    expect(s).toContain('<StrokeIcon v-else-if="btnKey === \'status\'" name="pulse" />')
  })
  it('r2：行内/批量动作图标 = StrokeIcon 设计线稿（antd 圈形图标退场）', () => {
    const s = page('NodeList.vue')
    for (const name of ['play', 'pause', 'rotate', 'pulse', 'upload', 'sliders']) {
      expect(s.match(new RegExp(`name="${name}"`, 'g'))?.length ?? 0).toBeGreaterThanOrEqual(1)
    }
    expect(s).not.toContain('PlayCircleOutlined')
    expect(s).not.toContain('PauseCircleOutlined')
    // toolbar 刷新保留 ReloadOutlined（与设计刷新图标同形）
    expect(page('NodeList.vue')).toBeTruthy()
  })
  it('r2：组头行 checkbox 隐藏（选择列 display:none + colSpan +1）', () => {
    expect(css).toMatch(
      /\.table-container\.l5-card \.ant-table-tbody > tr\.l5-group-row \.ant-table-selection-column \{[^}]*display: none/,
    )
    expect(page('NodeList.vue')).toMatch(/colSpan: visibleNodeColumns\.value\.length \+ 1/)
  })
  it('r2：表头分隔线短线形态（right 3px / top 30% / height 40%）', () => {
    expect(css).toMatch(
      /\.table-container\.l5-card \.grid-table \.col-resize-handle::after \{[^}]*right: 3px[^}]*top: 30%[^}]*height: 40%/,
    )
  })
  it('r4：antd 内置分页整体退场（display:contents 重排已删；三页改外置分页条）', () => {
    expect(css).not.toMatch(/\.table-container\.l5-card \.ant-pagination/)
    for (const f of ['NodeList.vue', 'UpstreamList.vue', 'RouteList.vue']) {
      const src = page(f)
      expect(src, f).toContain(':pagination="false"')
      expect(src, f).toContain('<ListPager')
    }
  })
  it('r2：布局壳（header 1px 中性灰底线 + content 24px）', () => {
    const layout = readFileSync(resolve(process.cwd(), 'src/views/DefaultLayout.vue'), 'utf-8')
    expect(layout).toMatch(/border-bottom: 1px solid var\(--border\)/)
    expect(layout).toMatch(/padding: 24px;/)
    expect(layout).not.toContain('border-bottom: 2px solid var(--accent)')
  })
  it('节点页：批量条 l5-batchbar（has-sel + 清除选择），批量导入在页头（先于「添加节点」）', () => {
    const s = page('NodeList.vue')
    expect(s).toContain('class="l5-batchbar" :class="{ \'has-sel\': selectedNodeKeys.length > 0 }"')
    expect(s).toContain('清除选择')
    const importPos = s.indexOf('批量导入')
    // page-header-actions-standard：加号前缀退场，改由 StrokeIcon 的 plus 承担
    const addPos = s.indexOf('<StrokeIcon name="plus" :size="13" /> 添加节点')
    expect(importPos).toBeGreaterThan(-1)
    expect(addPos).toBeGreaterThan(importPos)
    expect(s).not.toContain('+ 添加节点')
  })
  it('三页：列配置触发器带 ▾（CaretDownOutlined）', () => {
    for (const f of ['NodeList.vue', 'UpstreamList.vue', 'RouteList.vue']) {
      const s = page(f)
      expect(s, f).toMatch(/列配置\s*<CaretDownOutlined/)
    }
  })
  it('节点页：IP 格 600 字重（text-mono c-strong）', () => {
    expect(page('NodeList.vue')).toMatch(/column\.key === 'ip'[\s\S]{0,120}text-mono c-strong/)
  })
})

describe('mockup-parity r3：细看轮锚点', () => {
  it('r3-1/r4-③ 组头行背景 = --bg（与表头 th 同色，设计 tr.l5-group td）', () => {
    expect(css).toMatch(/\.table-container \.ant-table-tbody > tr\.l5-group-row > td,[^}]*background: var\(--bg\)/)
  })
  it('r3-2 菜单语言：主文案 13px/600、悬停不变色、内距 7px 10px', () => {
    expect(css).toMatch(/\.ant-dropdown-menu-item \{[^}]*font-size: 13px/)
    expect(css).toMatch(/\.ant-dropdown-menu-item \{[^}]*padding: 7px 10px/)
    const hover = css.slice(css.indexOf('.ant-dropdown-menu-item:hover'))
    expect(hover.slice(0, hover.indexOf('}') + 1)).not.toContain('color:')
    // 两行式主文案在 src/styles/theme.css（action-menu-explanations 单点）
    const theme = readFileSync(resolve(process.cwd(), 'src/styles/theme.css'), 'utf-8')
    expect(theme).toMatch(/\.menu-item-stack span \{[^}]*font-size: 13px/)
    expect(theme).toMatch(/\.menu-item-stack small \{[^}]*font-weight: 400/)
  })
  it('r3-3/r4-⑤ 三页分页条量词（「共 N 个节点/个上游/条路由」）', () => {
    const units: Record<string, string> = {
      'NodeList.vue': '个节点',
      'UpstreamList.vue': '个上游',
      'RouteList.vue': '条路由',
    }
    for (const [f, unit] of Object.entries(units)) {
      expect(page(f), f).toContain(`unit="${unit}"`)
    }
  })
  it('r3-4 列配置提示全文（右缘调宽 + 整格调序）', () => {
    for (const f of ['NodeList.vue', 'UpstreamList.vue', 'RouteList.vue']) {
      expect(page(f)).toContain('拖动表头右缘可调整列宽，拖动表头整格可调整列序')
    }
  })
  it('r3-5 状态格两行解剖（status-cell/s-row/exec-time；node-status-cell 零残留）', () => {
    const s = page('NodeList.vue')
    expect(s).toMatch(/class="status-cell"/)
    expect(s).toMatch(/class="s-row"/)
    expect(s).toContain('class="exec-time"')
    expect(s).not.toContain('node-status-cell')
    expect(s).not.toContain('status-exec-time')
    // r5-③ 已撤销 r3-5 的 0 5px 收紧（状态列回 147px 后收紧前提消失，内距回设计值 0 8px）
    expect(css).not.toMatch(/\.table-container\.l5-card \.status-cell \.badge-status \{[^}]*padding: 0 5px/)
  })
})

describe('mockup-parity r4（parity-audit-nodes-r4 逐项批准后的锚点）', () => {
  it('r4-① 统计胶囊字重 600 + -0.42px（设计嵌在 h1 内继承，组件化后须显式声明）', () => {
    expect(css).toMatch(/\.ph-lite \{[^}]*font-weight: 600/)
    expect(css).toMatch(/\.ph-lite \{[^}]*letter-spacing: -0\.42px/)
  })
  it('r4-② 行内动作解剖 = 设计 .ops/.op-btn（gap 2px、按钮 0 6px+3px+24 高、更多触发器 26px 无框）', () => {
    expect(css).toMatch(/\.table-container\.l5-card \.node-actions-wrap \{[^}]*gap: 2px/)
    expect(css).toMatch(/\.table-container\.l5-card \.node-actions-wrap \.btn-sm \{[^}]*padding: 0 6px/)
    // r5-① 起触发器解剖为合并规则（节点 .node-actions-wrap + 路由/上游 .action-cell 共用一条：
    // 全局 `.ant-btn:not(...):not(...)` 的 !important 特异性更高，页内 scoped 规则覆盖不掉）
    expect(css).toMatch(
      /\.table-container\.l5-card \.node-actions-wrap \.action-trigger-btn,\s*\.table-container\.l5-card \.action-cell \.action-trigger-btn \{[^}]*width: 26px/,
    )
  })
  it('r4-② 行内状态钮文案「状态」、菜单/列配置仍「状态查询」（shortTitle 与 title 分离）', () => {
    const nodes = readFileSync(resolve(process.cwd(), 'src/composables/useClusterNodes.ts'), 'utf-8')
    expect(nodes).toMatch(/\{ key: 'status', title: '状态查询', shortTitle: '状态' \}/)
    expect(page('NodeList.vue')).toContain('getActionButtonText(btnKey)')
  })
  it('r4-E2 节点页列宽 = 设计缩放后实测值（合计 + 选择列 40 ≈ 卡宽 1310）', () => {
    const s = page('NodeList.vue')
    for (const w of [48, 149, 82, 377, 147, 87, 298]) {
      expect(s, String(w)).toContain(`width: ${w}`)
    }
  })
})

describe('mockup-parity r5（parity-audit-nodes-r5 逐项批准后的锚点）', () => {
  it('r5-① 三页更多触发器 = StrokeIcon dots（无边框 26×24 锚点），antd MoreOutlined 与 ⋯ 文本两套退场', () => {
    for (const f of ['NodeList.vue', 'UpstreamList.vue', 'RouteList.vue']) {
      const s = page(f)
      expect(s, f).toContain('<StrokeIcon name="dots"')
      expect(s, f).not.toContain('MoreOutlined')
      expect(s, f).not.toContain('>⋯<')
    }
    expect(page('NodeList.vue')).toContain('import StrokeIcon')
    // 图标本体 = 设计三圆横排（r=1.7，cx 5/12/19，cy 12，实心）
    const icon = readFileSync(resolve(process.cwd(), 'src/components/StrokeIcon.vue'), 'utf-8')
    expect(icon).toContain('<circle cx="5" cy="12" r="1.7" />')
    expect(icon).toContain('<circle cx="19" cy="12" r="1.7" />')
    expect(icon).toContain("FILLED_ICONS = new Set<string>(['dots'])")
  })
  it('r5-① 触发器无边框白底（style.css 压掉 antd text 按钮的 1px 边与白底）', () => {
    const triggerRule = css.match(
      /\.table-container\.l5-card \.node-actions-wrap \.action-trigger-btn,[\s\S]*?\{[^}]*\}/,
    )
    expect(triggerRule, '需存在触发器合并规则').toBeTruthy()
    expect(triggerRule![0]).toContain('border: 1px solid transparent !important')
    expect(triggerRule![0]).toContain('background: transparent !important')
    expect(triggerRule![0]).toContain('.action-cell .action-trigger-btn')
  })
  it('r5-② 三页动作菜单挂 l5-action-menu（215 固定宽 + 条目行高 1.4 的作用域）', () => {
    for (const f of ['NodeList.vue', 'UpstreamList.vue', 'RouteList.vue']) {
      expect(page(f), f).toContain('<a-menu class="l5-action-menu">')
    }
    expect(css).toMatch(/\.ant-dropdown-menu\.l5-action-menu \{[^}]*width: 215px/)
    expect(css).toMatch(/\.ant-dropdown-menu\.l5-action-menu \.ant-dropdown-menu-item \{[^}]*line-height: 1\.4/)
  })
  it('r5-② 危险操作独占一栏：删除项 danger + 常驻解释，前后分隔线（三页）', () => {
    // 节点页：菜单由配置驱动 —— danger/desc 元数据在 useClusterNodes，模板按分组渲染
    const nodesCfg = readFileSync(resolve(process.cwd(), 'src/composables/useClusterNodes.ts'), 'utf-8')
    expect(nodesCfg).toMatch(
      /key: 'delete',[\s\S]*?danger: true,[\s\S]*?desc: '删平台配置，可同步删 Edge 已发布配置（弹窗可选）'/,
    )
    const nodePage = page('NodeList.vue')
    expect(nodePage).toContain('menuSafeActions')
    expect(nodePage).toContain('menuDangerActions')
    expect(nodePage).toMatch(/<a-menu-item[\s\S]{0,200}danger/)
    // 路由/上游（B3）：条目定义留在页面内、三栏由 utils/resourceActionMenu 单一构建，
    // 危险项的 danger 标记与常驻解释由条目元数据驱动（模板不再硬编码 danger 属性）
    for (const f of ['RouteList.vue', 'UpstreamList.vue']) {
      const s = page(f)
      expect(s, f).toContain('buildResourceActionMenu({')
      expect(s, f).toMatch(/danger: \[\{[\s\S]{0,300}?danger: true\s*\}\]/)
      expect(s, f).toContain("desc: '删平台配置，可同步删 Edge 已发布配置（弹窗可选）'")
      expect(s, f).toContain("desc: '历史版本查看与回滚'")
      expect(s, f).toMatch(/<a-menu-item[\s\S]{0,400}:danger="item\.danger"/)
      // 解释行常驻：有 desc 的条目渲染 menu-item-stack（主行 + small 解释）
      expect(s, f).toMatch(
        /<div v-if="item\.desc" class="menu-item-stack">[\s\S]*?<small>\{\{ item\.desc \}\}<\/small>/,
      )
    }
  })
  it('r5-② 三栏顺序：CRUD（复制/编辑）→ 危险（删除）→ 动作（版本管理）+ 栏间分隔线（页面两处）', () => {
    for (const f of ['RouteList.vue', 'UpstreamList.vue']) {
      const s = page(f)
      // 条目定义按栏顺序书写（构建器只做过滤/禁用，不重排）
      const crudAt = s.indexOf('crud: [')
      const dangerAt = s.indexOf('danger: [')
      const actionsAt = s.indexOf('actions: [')
      expect(crudAt, f).toBeGreaterThan(-1)
      expect(dangerAt, f).toBeGreaterThan(crudAt)
      expect(actionsAt, f).toBeGreaterThan(dangerAt)
      // CRUD 栏内「复制」在「编辑」之前；删除归危险栏、版本管理归动作栏
      const crudBlock = s.slice(crudAt, dangerAt)
      expect(crudBlock, f).toContain('复制')
      expect(crudBlock.indexOf('复制'), f).toBeLessThan(crudBlock.indexOf('编辑'))
      expect(s.slice(dangerAt, actionsAt), f).toContain('删除')
      expect(s.slice(actionsAt), f).toContain('版本管理')
      // 分隔线：模板只声明一条「栏间分隔线」，由遍历序号决定位置（首栏不画、空栏由构建器剔除）
      const menu = s.match(/<a-menu class="l5-action-menu">[\s\S]*?<\/a-menu>/)
      expect(menu, f).toBeTruthy()
      const dividers = [...menu![0].matchAll(/<a-menu-divider v-if="gi > 0" \/>/g)]
      expect(dividers, f).toHaveLength(1)
      // 两栏有解释项（删除/版本管理）：菜单内含 menu-item-stack 解释行
      expect(menu![0], f).toContain('class="menu-item-stack"')
    }
  })
  it('r5-② 分隔线形态单点 = 1px 边线 + 4px 6px 边距（非底色块）', () => {
    expect(css).toMatch(
      /\.ant-dropdown-menu \.ant-dropdown-menu-item-divider \{[^}]*border-top: 1px solid var\(--border\) !important;[^}]*margin: 4px 6px !important/,
    )
  })
  it('r5-③ 已禁用 = 空心虚线胶囊（badge-disabled，无圆点 + title 语义）', () => {
    const badge = readFileSync(resolve(process.cwd(), 'src/components/BadgeStatus.vue'), 'utf-8')
    expect(badge).toMatch(/\.badge-disabled \{[^}]*background: transparent/)
    expect(badge).toMatch(/\.badge-disabled \{[^}]*border: 1px dashed/)
    expect(badge).toMatch(/v-if="status !== 'disabled'"/)
    expect(badge).toContain("status: 'online' | 'offline' | 'warning' | 'info' | 'neutral' | 'disabled'")
    // 消费点：节点独立页行内 + 节点详情 2 处（统一管理最大化面板状态格已改为
    // 两枚原生 .ps-tag 胶囊 —— 见 parity-max-status-pills 段的断言反转）
    const rowConsumers: Array<[string, number]> = [['NodeList.vue', 2]]
    for (const [f, count] of rowConsumers) {
      const s = page(f)
      expect(s, f).toContain('status="disabled"')
      expect((s.match(/status="disabled"/g) || []).length, f).toBe(count)
      expect(s, f).not.toContain('text="已禁用" status="neutral"')
    }
    // 最大化面板 Tab 状态格：BadgeStatus 退场，改 central.html 的两枚 .ps-tag
    const tab = page('clusters/ClusterNodes.vue')
    expect(tab).not.toContain('status="disabled"')
    expect(tab).not.toContain('BadgeStatus')
    expect(tab).toMatch(/class="ps-tag ps-unpub"[\s\S]{0,120}>已禁用</)
    expect(tab).toMatch(/class="ps-tag ps-pub" title="管理开关：已启用">已启用</)
    expect(tab).toMatch(/class="ps-tag ps-pub"[\s\S]{0,80}>在线</)
    expect(tab).toMatch(/class="ps-tag ps-partial"[\s\S]{0,80}>离线</)
  })
  it('r5-④ 逐元素微差锚点：序号 mono 12px、路径值 muted、行内按钮 400、表头行盒 19px、页头 1.5 行高/2px 上距', () => {
    expect(css).toMatch(/\.table-container\.l5-card \.c-idx \{[^}]*font-family: var\(--font-mono\)/)
    expect(css).toMatch(/\.table-container\.l5-card \.c-idx \{[^}]*font-size: 12px/)
    expect(page('NodeList.vue')).toMatch(/\.path-line \.path-v \{[^}]*color: var\(--muted\)/)
    expect(css).toMatch(/\.table-container\.l5-card \.node-actions-wrap \.btn-sm \{[^}]*font-weight: 400/)
    expect(css).toMatch(/\.table-container\.l5-card \.ant-table-thead \.ant-table-selection \{[^}]*height: 19px/)
    const header = readFileSync(resolve(process.cwd(), 'src/components/PageHeader.vue'), 'utf-8')
    expect(header).toMatch(/\.page-header-info h1 \{[\s\S]*?line-height: 1\.5;/)
    expect(header).toMatch(/\.page-header-info p \{[\s\S]*?margin: 2px 0 0;/)
  })
  it('r5-④ 分组批量折叠：三页工具条挂 #mode-extra 按钮，composable 提供 expandAll/collapseAll', () => {
    for (const f of ['NodeList.vue', 'UpstreamList.vue', 'RouteList.vue']) {
      expect(page(f), f).toContain('template #mode-extra')
      expect(page(f), f).toContain('data-test="toolbar-fold-all"')
      expect(page(f), f).toContain('toggleFoldAll')
    }
    const comp = readFileSync(resolve(process.cwd(), 'src/composables/useListClusterGrouping.ts'), 'utf-8')
    expect(comp).toContain('pageHasFolded')
    expect(comp).toMatch(/function expandAll\(\): void/)
    expect(comp).toMatch(/function collapseAll\(\): void/)
    expect(comp).toMatch(/function toggleFoldAll\(\): void/)
  })
})

describe('mockup-parity r6（parity-audit-nodes-r6：字体族 / 列宽自适应 / 提示行图标）', () => {
  it('r6-① antd 令牌字体族统一为 var(--font-body)（表格内容不再走 antd 默认栈）', () => {
    const app = readFileSync(resolve(process.cwd(), 'src/App.vue'), 'utf-8')
    expect(app).toMatch(/fontFamily: 'var\(--font-body\)'/)
  })
  it('r6-② 三页表格不再用 scroll.x="max-content"（否则表格宽度恒等于列宽总和、窄窗必溢）', () => {
    // r7-⑤ 起 scroll.x 绑 minTableWidth（各列内容下限之和），不再硬编码设计最小总宽
    for (const f of ['NodeList.vue', 'UpstreamList.vue', 'RouteList.vue']) {
      const s = page(f)
      expect(s, f).not.toContain("x: 'max-content'")
      expect(s, f).toContain(':scroll="{ x: minTableWidth }"')
    }
  })
  it('r6-② 三页列宽走 useFitColumnWidths（设计宽 × 可用宽等比缩放 + 拖拽覆盖 + 弹性列吸收）', () => {
    const flexKeys: Record<string, string> = {
      'NodeList.vue': 'edge_path',
      'UpstreamList.vue': 'targets',
      'RouteList.vue': 'uri',
    }
    for (const [f, flexKey] of Object.entries(flexKeys)) {
      const s = page(f)
      expect(s, f).toContain('useFitColumnWidths(')
      expect(s, f).toContain('toDesignWidths(columns)')
      expect(s, f).toContain(`flexKey: '${flexKey}'`)
      expect(s, f).toContain('fittedColumnWidths')
      // 卡片持有 ref 供 ResizeObserver 观察
      expect(s, f).toContain('ref="cardRef"')
    }
    // 节点页内容不可压列兜底（r7-B4 起在多行对象里：操作列按钮组 / 状态列两枚胶囊）
    const nodes = page('NodeList.vue')
    expect(nodes).toContain('minWidths: () => ({')
    expect(nodes).toContain('actions: 268')
    expect(nodes).toContain('status: 140')
  })
  it('r6-③ 列配置提示行 = 图标 + 文字（三页统一 .pop-hint-line）', () => {
    for (const f of ['NodeList.vue', 'UpstreamList.vue', 'RouteList.vue']) {
      const s = page(f)
      expect(s, f).toContain('class="pop-hint-line"')
      expect(s, f).toContain('<StrokeIcon name="resizeH"')
      expect(s, f).toContain('拖动表头右缘可调整列宽，拖动表头整格可调整列序')
    }
    expect(css).toMatch(/\.pop-hint-line \{[^}]*display: flex/)
    expect(css).toMatch(/\.pop-hint-line \{[^}]*gap: 7px/)
    const icon = readFileSync(resolve(process.cwd(), 'src/components/StrokeIcon.vue'), 'utf-8')
    expect(icon).toContain('<polyline points="6 8 2 12 6 16" />')
  })
})

describe('mockup-parity r7（parity-audit-upstreams-r7：目标健康列 / 发布区 / 工具条宽度 / 列宽下限）', () => {
  it('r7-① 上游「目标节点与健康」= 设计 .tg-list 解剖（点 + 权重条 + 「权重 · 占比%」+ 汇总行）', () => {
    const s = page('UpstreamList.vue')
    expect(s).toContain('<div class="tg-list"')
    expect(s).toContain(':class="targetDotFor(record).cls"')
    expect(s).toContain('class="tg-bar"')
    expect(s).toContain('class="tg-w"')
    expect(s).toContain('class="tg-sum"')
    expect(s).toContain('全部健康')
    expect(s).toContain('项待验证')
    // 旧的两字段退化容器已退场
    expect(s).not.toContain('class="target-list"')
  })
  it('r7-① 目标健康派生走 utils/upstreamTargets（方案 A：发布态近似，平台无目标级健康）', () => {
    const s = page('UpstreamList.vue')
    expect(s).toContain("from '@/utils/upstreamTargets'")
    for (const fn of ['areTargetsVerified', 'summarizeTargetHealth', 'targetDot', 'targetWeightPercents']) {
      expect(s, fn).toContain(fn)
    }
  })
  it('r7-② 发布按钮 = 设计 .op-pub（上游 + 路由两页），且 style.css 有该单点', () => {
    for (const f of ['UpstreamList.vue', 'RouteList.vue']) {
      expect(page(f), f).toContain('class="op-pub"')
      expect(page(f), f).not.toMatch(/<a-button size="small"[^>]*>发布<\/a-button>/)
    }
    expect(css).toContain('.op-pub {')
    expect(css).toMatch(/\.op-pub \{[^}]*background: var\(--accent-bg\)/)
    expect(css).toMatch(/\.op-pub \{[^}]*font-size: 12px/)
    expect(css).toMatch(/\.op-pub \{[^}]*font-weight: 500/)
  })
  it('r7-③ 发布状态徽标 = 设计 .ps-tag（mono、无边框、四态淡底）', () => {
    const s = readFileSync(resolve(process.cwd(), 'src/components/PublishStatusTag.vue'), 'utf-8')
    const tagStart = s.indexOf('.ps-tag {')
    const tagBlock = s.slice(tagStart, s.indexOf('}', tagStart))
    expect(tagBlock).toContain('font-family: var(--font-mono)')
    // 无边框（`border-radius` 合法，仅禁 border/border-* 声明）
    expect(tagBlock).not.toMatch(/\bborder(-(top|right|bottom|left))?:/)
    for (const [cls, token] of [
      ['.ps-published', 'var(--success)'],
      ['.ps-pending', 'var(--warning)'],
      ['.ps-partial', 'var(--danger)'],
      ['.ps-unpublished', 'var(--muted)'],
    ]) {
      const block = s.slice(s.indexOf(`${cls} {`), s.indexOf('}', s.indexOf(`${cls} {`)))
      expect(block, cls).toContain(token)
      expect(block, `${cls} 不应再带 1px 边框`).not.toContain('border:')
    }
  })
  it('r7-③ 差异预览按钮 = 文字胶囊「差异」（批 7 用户裁决 C：下箭头曾被误读为收起）', () => {
    const s = readFileSync(resolve(process.cwd(), 'src/components/PublishDiffButton.vue'), 'utf-8')
    // 胶囊形态：文本「差异」+ 无箭头图形
    expect(s).toContain('差异')
    expect(s).not.toContain('<polyline points="6 9 12 15 18 9" />')
    expect(s).not.toContain('<svg')
    const block = s.slice(s.indexOf('.diff-preview-btn {'))
    expect(block).toContain('height: 20px')
    expect(block).toContain('padding: 0 9px')
    expect(block).toContain('border-radius: 999px')
    expect(block).toContain('oklch(56% 0.16 210 / 30%)')
    expect(block).toContain('color: var(--accent)')
  })
  it('r7-④ 上游工具条宽度对齐节点页（分组 104 / 集群 120 / 算法 120，搜索 150）', () => {
    const s = page('UpstreamList.vue')
    expect(s).toContain('style="width: 104px"')
    expect(s).toContain('style="width: 120px"')
    expect(s).toMatch(/<ClusterSelect[\s\S]{0,160}style="width: 120px"/)
    // 节点页同口径（分组 104 / 集群 120）
    const nodes = page('NodeList.vue')
    expect(nodes).toContain('style="width: 104px"')
    expect(nodes).toMatch(/<ClusterSelect[\s\S]{0,160}style="width: 120px"/)
  })
  it('r7-⑤ 三页 scroll.x 绑 minTableWidth（下限之和），不再硬编码设计最小总宽', () => {
    for (const f of ['NodeList.vue', 'UpstreamList.vue', 'RouteList.vue']) {
      const s = page(f)
      expect(s, f).toContain(':scroll="{ x: minTableWidth }"')
      expect(s, f).toContain('minTableWidth } = useFitColumnWidths(')
      expect(s, f).toContain('minWidths: () => ({')
    }
  })
})

describe('mockup-parity r9（filter-architecture 方案甲：状态 chips / 方法下拉 / 页头瘦身 / 计数权威）', () => {
  it('r9-① 四层/DNS/路由/上游/节点五页状态筛选统一为 .f-chip.chip-status（+ .f-count 计数）', () => {
    for (const f of [
      'NodeList.vue',
      'RouteList.vue',
      'UpstreamList.vue',
      'StreamProxyList.vue',
      'DnsUdpProxyList.vue',
    ]) {
      const s = page(f)
      expect(s, f).toContain('chip-status')
      expect(s, f).toContain('class="f-count"')
      // 旧形态退场（匹配模板里的 class 用法，注释里提到历史类名不算）
      expect(s, f).not.toMatch(/class="sp-status-tab/)
    }
    expect(css).toContain('.f-chip.chip-status')
    expect(css).toContain('.f-chip.chip-status .f-count')
  })

  it('r9-② 路由/上游/节点的「全部状态」下拉已下线（状态只能通过 chips 筛选）', () => {
    for (const f of ['NodeList.vue', 'RouteList.vue']) {
      // 「全部状态」作为下拉选项文本退场（注释里的说明文字不算）
      expect(page(f), f).not.toMatch(/>\s*全部状态\s*</)
    }
    // 上游此前完全没有状态筛选，现在有 chips 行
    expect(page('UpstreamList.vue')).toContain('data-test="status-chip-row"')
  })

  it('r9-③ 方法只有「全部方法」下拉一个入口：方法 chips 行已删除', () => {
    const s = page('RouteList.vue')
    expect(s).toContain('全部方法')
    expect(s).not.toContain('methodFilters')
    expect(s).not.toContain('data-test="method-chip-row"')
  })

  it('r9-④ 页头只留总数徽标：状态分布不再出现在页头（避免与 chips 重复 + 500 抽样失真）', () => {
    for (const f of ['NodeList.vue', 'RouteList.vue', 'UpstreamList.vue']) {
      const s = page(f)
      // headerStatItems 只构造一个 label 项
      const start = s.indexOf('const headerStatItems')
      expect(start, f).toBeGreaterThan(-1)
      const block = s.slice(start, s.indexOf('\n', s.indexOf('])', start)))
      expect(block.match(/label:/g)?.length ?? 0, `${f} 页头徽标应只有 1 项`).toBe(1)
    }
  })

  it('r9-⑤ 计数走权威聚合端点（禁用 page_size=500 抽样）', () => {
    expect(page('RouteList.vue')).toContain("'/routes/status-counts'")
    expect(page('UpstreamList.vue')).toContain('getUpstreamStatusCounts')
    for (const f of ['NodeList.vue', 'RouteList.vue', 'UpstreamList.vue']) {
      expect(page(f), f).not.toContain('loadRouteStats')
      expect(page(f), f).not.toContain('loadUpstreamStats')
    }
  })

  it('r9-⑥ 工具条不压缩契约：子元素 shrink:0、spacer 独占余量、gap 6、不再 nowrap 硬锁', () => {
    expect(css).toMatch(/\.l5-toolbar > \* \{[^}]*flex-shrink: 0/)
    expect(css).toMatch(/\.l5-toolbar \{[\s\S]*?gap: 6px/)
    for (const f of ['NodeList.vue', 'UpstreamList.vue', 'RouteList.vue']) {
      const s = page(f)
      expect(s, f).not.toContain('class="nowrap"')
      expect(s, f).toContain(':width="150"') // 搜索框：外层 200px 曾把工具条挤爆
    }
  })

  it('r9-⑦ 节点「已禁用」chip 标注跨维度语义（管理开关，与运行态可重叠）', () => {
    const s = page('NodeList.vue')
    expect(s).toContain('管理开关维度（status=0）：与运行态可重叠')
  })
})

describe('mockup-parity r10（filter-architecture G 批：状态行位置 / 工具栏计数下线 / 页头补充维度）', () => {
  it('r10-① 节点页卡片内顺序 = 工具条 → 状态行 → 批量条 → 表格（筛选面连续、三页同构）', () => {
    const s = page('NodeList.vue')
    const iToolbar = s.indexOf('</TableToolbar>')
    const iChips = s.indexOf('data-test="status-chip-row"')
    const iBatch = s.indexOf('class="l5-batchbar"')
    const iTable = s.indexOf('<a-table')
    expect(iToolbar).toBeGreaterThan(-1)
    expect(iChips).toBeGreaterThan(iToolbar)
    expect(iBatch).toBeGreaterThan(iChips)
    expect(iTable).toBeGreaterThan(iBatch)
  })

  it('r10-② 三页工具栏不再显示计数（showCount=false；总数只留 chips「全部 N」+ 分页条）', () => {
    for (const f of ['NodeList.vue', 'UpstreamList.vue', 'RouteList.vue']) {
      expect(page(f), f).toContain(':show-count="false"')
    }
  })

  it('r10-③ 页头徽标 = 补充维度（节点/上游「N 集群」、路由「N 上游」），不再重复总数', () => {
    expect(page('NodeList.vue')).toContain("label: '集群'")
    expect(page('UpstreamList.vue')).toContain("label: '集群'")
    expect(page('RouteList.vue')).toContain("label: '上游'")
    // 计数端点提供补充维度
    expect(page('RouteList.vue')).toContain('upstream_count')
    expect(page('UpstreamList.vue')).toContain('cluster_count')
  })
})

describe('mockup-parity r11（筛选行与状态行之间的分隔线）', () => {
  it('r11-① .l5-toolbar 自带下边线（三页统一；此前仅节点页经 .node-filter-bar 有）', () => {
    const toolbar = css.slice(css.indexOf('.l5-toolbar {'), css.indexOf('}', css.indexOf('.l5-toolbar {')))
    expect(toolbar).toContain('border-bottom: 1px solid var(--border)')
  })
  it('r11-② 节点页不再在页面级重复声明该线（单点在 style.css）', () => {
    expect(page('NodeList.vue')).toMatch(/\.node-filter-bar \{[^}]*\}/)
    const block = page('NodeList.vue').slice(page('NodeList.vue').indexOf('.node-filter-bar {'))
    const body = block.slice(0, block.indexOf('}'))
    expect(body).not.toContain('border-bottom')
  })
  it('r11-③ 三页状态行仍在工具条之后（分隔线的对象存在）', () => {
    for (const f of ['NodeList.vue', 'RouteList.vue', 'UpstreamList.vue']) {
      expect(page(f), f).toContain('data-test="status-chip-row"')
    }
  })
})

describe('mockup-parity r12（平铺视图集群标识 / 优先级 mono）', () => {
  it('r12-① 三页「集群」列定义在 columns 里，且仅平铺可见、不进列配置弹窗', () => {
    for (const f of ['NodeList.vue', 'UpstreamList.vue', 'RouteList.vue']) {
      const s = page(f)
      expect(s, f).toContain("key: 'cluster'")
      // 分组态过滤：isVisible 里按 viewMode 判定
      expect(s, f).toMatch(/if \(k === 'cluster'\) return viewMode\.value === 'flat'/)
      // 列配置弹窗不含集群列
      expect(s, f).toMatch(/key === 'cluster'\) continue|!== 'cluster'/)
    }
  })

  it('r12-② 集群单元格 = 色点 + 集群名，色相走 utils/clusterHue（cluster_id % 8）', () => {
    for (const f of ['NodeList.vue', 'UpstreamList.vue', 'RouteList.vue']) {
      const s = page(f)
      expect(s, f).toContain('class="cl-cell"')
      expect(s, f).toContain(':class="clusterHueClass(record.cluster_id)"')
      expect(s, f).toContain("from '@/utils/clusterHue'")
    }
    expect(css).toContain('.cl-dot')
    expect(css).toContain('.cluster-c1')
    expect(css).toContain('.cluster-c8')
  })

  it('r12-③ 分组态不参与集群列缩放（designWidths 在分组态剔除 cluster）', () => {
    for (const f of ['NodeList.vue', 'UpstreamList.vue', 'RouteList.vue']) {
      expect(page(f), f).toContain('const { cluster: _cluster, ...rest } = base')
    }
  })

  it('r12-④ 路由优先级为 mono 文本而非 chip（度量值不做胶囊）', () => {
    const s = page('RouteList.vue')
    expect(s).toContain('class="prio-txt"')
    expect(s).not.toContain('<span class="prio"')
    expect(css).toContain('.prio-txt')
  })
})

describe('mockup-parity r13（平铺集群列排序 = 服务端排序，参考优先级实现）', () => {
  it('r13-① 三页「集群」列 sorter: true，且仅平铺可排（分组态 sortable() 关闭）', () => {
    for (const f of ['NodeList.vue', 'UpstreamList.vue', 'RouteList.vue']) {
      const s = page(f)
      expect(s, f).toMatch(/key: 'cluster'[^\n]*sorter: true/)
      expect(s, f).toContain('@change="handleTableChange"')
    }
    // 路由：集群进 SORTABLE_COLUMNS（分组态被 sortable() 置 false）
    expect(page('RouteList.vue')).toContain(
      "const SORTABLE_COLUMNS = ['name', 'uri', 'priority', 'created_at', 'cluster']",
    )
  })

  it('r13-② 三页排序键只在平铺视图下发（分组视图按组内固定序）', () => {
    for (const f of ['NodeList.vue', 'UpstreamList.vue', 'RouteList.vue']) {
      const s = page(f)
      expect(s, f).toMatch(/viewMode\.value === 'flat'/)
      expect(s, f).toMatch(/sort_by|sortBy/)
    }
    // 节点页：API 封装透传 sort_by/sort_order
    const api = readFileSync(resolve(process.cwd(), 'src/api/nodes.ts'), 'utf-8')
    expect(api).toContain('sort_by: params.sortBy')
    expect(api).toContain('sort_order')
  })
})

describe('mockup-parity r14（卡片页解剖单点：共享类 + 分组组合式）', () => {
  it('r14-① 四层代理卡片走设计解剖（l5-panel / lp-head / lp-body / lp-foot / lp-strip）', () => {
    const s = page('StreamProxyList.vue')
    for (const cls of ['l5-panel', 'lp-head', 'lp-body', 'lp-foot', 'lp-strip', 'lp-hero', 'lp-proto', 'lp-notice'])
      expect(s, `缺少 ${cls}`).toContain(cls)
    // 旧自造卡头/详情行不得回潮
    expect(s).not.toContain('sp-card-topbar')
    expect(s).not.toContain('sp-detail-row')
  })

  it('r14-② 集群分组走共享组合式与共享 band 组件（禁页面内自造分组带）', () => {
    const s = page('StreamProxyList.vue')
    expect(s).toContain("from '@/composables/useCardClusterGrouping'")
    expect(s).toContain('<ClusterBand')
    // 双模式类挂在网格上（.l5-card 承载 mode-group/mode-flat 的 CSS 互斥）
    expect(s).toContain('l5-card')
    expect(s).toMatch(/mode-\$\{cardMode\}/)
  })

  it('r14-③ 动作收进 ⋯ 菜单：危险项独立 + 常驻解释（AGENTS #81）', () => {
    const s = page('StreamProxyList.vue')
    expect(s).toContain('class="l5-menu"')
    expect(s).toContain('class="mi danger"')
    expect(s).toContain('删平台配置，可同步删 Edge 监听规则')
    // 多语句模板 handler 必须提成函数（#25：prettier 重排会破坏编译）
    expect(s).not.toMatch(/@click="\s*closeCardMenu\(\)/)
  })
})

describe('mockup-parity r15（卡片页与列表页同构：工具条 / 状态行 / 批量条 / 集群带 / 菜单）', () => {
  it('r15-① 卡片页接共享 TableToolbar + 独立 .l5-chiprow 状态行（禁自造头部行）', () => {
    const s = page('StreamProxyList.vue')
    expect(s).toContain('<TableToolbar')
    expect(s).toContain('class="l5-chiprow"')
    expect(s).toContain('class="chiprow-label"')
    expect(s).toContain(':show-count="false"')
    // 自造工具条行与底部固定批量条已退场
    expect(s).not.toContain('class="sp-header-actions"')
    expect(s).not.toContain('class="sp-batch-bar"')
  })

  it('r15-② 批量条 = .l5-batchbar 随流（状态行下、网格之前）', () => {
    const s = page('StreamProxyList.vue')
    expect(s).toContain('class="l5-batchbar batchbar-dynamic"')
    expect(s).toMatch(/has-sel/)
    // 位置：批量条在 card-grid 之前
    const barIdx = s.indexOf('l5-batchbar')
    const gridIdx = s.indexOf('class="sp-grid card-grid l5-card"')
    expect(gridIdx).toBeGreaterThan(barIdx)
  })

  it('r15-③ 集群带与表格组头同构：数量灰胶囊 / gap 10 / 内距 8-12-16 / 左条取集群色相（r16 反转原 accent 断言）', () => {
    // r16-1：卡片页无「集群列」，band 左条是集群身份唯一线索 → 恒取 --cc（回落 accent）
    expect(css).toMatch(/\.l5-band::before[^}]*background:\s*var\(--cc,\s*var\(--accent\)\)/)
    expect(css).toMatch(/\.l5-band\s*\{[^}]*gap:\s*10px/)
    expect(css).toMatch(/\.l5-band\s*\{[^}]*padding:\s*8px 12px 8px 16px/)
    expect(css).toMatch(/\.l5-band \.b-count\s*\{[^}]*border-radius:\s*999px/)
  })

  it('r15-④ 批量态为勾选框让位 33px；卡内弹层不被裁剪；菜单可向上翻转', () => {
    expect(css).toMatch(/\.l5-card\.batch \.lp-head[\s\S]{0,120}padding-left:\s*33px/)
    expect(css).toMatch(/\.l5-panel\.std-card\s*\{[^}]*overflow:\s*visible/)
    expect(css).toContain('.l5-menu.flip-up')
    expect(page('StreamProxyList.vue')).toContain("'flip-up': menuFlipUp")
  })

  it('r15-⑤ 页头按钮序：批量管理在「新建」左侧', () => {
    const s = page('StreamProxyList.vue')
    const batchIdx =
      s.indexOf('批量管理</button>') === -1
        ? s.indexOf("batchMode ? '退出批量管理' : '批量管理'")
        : s.indexOf('批量管理</button>')
    const createIdx = s.indexOf('新建四层代理')
    expect(batchIdx).toBeGreaterThan(-1)
    expect(createIdx).toBeGreaterThan(-1)
    expect(batchIdx).toBeLessThan(createIdx)
  })
})

describe('mockup-parity r16（集群色编码 / band hover / 批量条按钮集）', () => {
  it('r16-① 集群带左条 = 集群色相 `--cc`（回落 accent），不是恒 accent', () => {
    expect(css).toMatch(/\.l5-band::before[^}]*var\(--cc,\s*var\(--accent\)\)/)
  })

  it('r16-②/r17-② 集群带 hover = 该集群淡色（方案 B），禁 --surface（会变纯白）', () => {
    const m = css.match(/\.l5-band\[role='button'\]:hover\s*\{([^}]*)\}/)
    expect(m).toBeTruthy()
    // r17-2：hover 底与左条同源（--cc-bg），回落 accent 4%
    expect(m![1]).toContain('var(--cc-bg')
    expect(m![1]).not.toContain('var(--surface)')
  })

  it('r16-③ 批量条 SHALL NOT 含「批量发布」（功能不存在）', () => {
    const s = page('StreamProxyList.vue')
    expect(s).not.toContain('批量发布')
    expect(s).not.toContain('batchPublish')
    expect(s).toContain('批量删除')
  })
})

describe('mockup-parity r17（平铺卡片按行取集群色相）', () => {
  it('r17-① 卡片色相按行计算（clusterHueClass(p.cluster_id)），不是分组伪组的统一 hueClass', () => {
    const s = page('StreamProxyList.vue')
    expect(s).toContain('clusterHueClass(p.cluster_id)')
    expect(s).not.toMatch(/class="sp-card[\s\S]{0,200}g\.hueClass/)
  })
})

describe('mockup-parity r18（让位规则收窄 / 卡体 chips 呈现）', () => {
  it('r18-① 列表型关键信息两态都显示：DNS 上游行不得用 group-only、不得裁剪', () => {
    const s = page('DnsUdpProxyList.vue')
    // 上游 IP 属关键信息 → 不得再挂 group-only（平铺隐藏）也不得 slice 裁剪
    expect(s).not.toMatch(/class="lp-row group-only"[\s\S]{0,200}上游/)
    expect(s).not.toMatch(/dnsUpstreams\(p\)\.slice\(/)
    expect(s).toContain('v-for="(u, i) in dnsUpstreams(p)"')
  })

  it('r18-②/r19 卡体 chips 不裁剪：四层代理目标完整呈现（禁 slice / 禁 compact 限高）', () => {
    // r19 用户裁定：目标 IP 可能多条且需逐条核对 → 完整显示、允许折行
    const s = page('StreamProxyList.vue')
    expect(s).toContain('v-for="(t, i) in p.targets ?? []"')
    expect(s).not.toContain('slice(0, 2)')
    expect(s).not.toContain('lp-chips compact')
    expect(s).not.toContain('tg-more')
    // 单行硬裁/限高变体已退场
    expect(css).not.toMatch(/\.lp-chips\.compact/)
    expect(css).not.toMatch(/\.lp-chips\.single-line/)
  })
})

describe('r22/r24 批量删除统一入口（契约统一 U2）', () => {
  const read = (rel: string) => readFileSync(resolve(process.cwd(), 'src/views', rel.replace(/^\.\.\//, '')), 'utf-8')

  it('六页批量删除统一走 useBatchDelete（禁页面内自造确认/请求/进度）', () => {
    for (const f of [
      '../StreamProxyList.vue',
      '../DnsUdpProxyList.vue',
      '../DnsQueryList.vue',
      '../PluginConfigList.vue',
      '../GlobalRuleList.vue',
      '../StaticResourceList.vue',
    ]) {
      const s = read(f)
      expect(s).toContain('useBatchDelete<any>(')
      // 旧实现痕迹：页面内 for 循环逐条删 / 手写 noNodeSelection
      expect(s).not.toMatch(/await api\.delete\(`\/clusters\/\$\{/)
      expect(s).not.toContain('noNodeSelection: true')
    }
  })

  it('统一入口负责：全局 ids 端点 + 节点并集（含集群名）+ 默认全选在线 + 子集后果', () => {
    const s = readFileSync(resolve(process.cwd(), 'src/composables/useBatchDelete.ts'), 'utf-8')
    expect(s).toContain('fetchBatchDeleteNodes')
    expect(s).toContain('clusterName,')
    expect(s).toContain('defaultSelectOnline: true')
    expect(s).toContain('subsetConsequence')
    expect(s).toContain('executeDeleteWithProgress({')
    expect(s).toContain('resourceKey:')
    // 契约统一后不再分段（后端全局 ids 端点）
    expect(s).not.toContain('requests:')
  })

  it('后端批量删除单一实现 + 逐条权限校验', () => {
    const s = readFileSync(resolve(process.cwd(), '../backend/app/services/batch_delete.py'), 'utf-8')
    expect(s).toContain('async def batch_delete(')
    expect(s).toContain('allowed_cluster_ids')
    expect(s).toContain('无权限操作该集群')
    expect(s).toContain('KINDS')
    // 三条全局端点都委托同一实现
    for (const f of [
      '../backend/app/api/v1/routes.py',
      '../backend/app/api/v1/plugin_configs.py',
      '../backend/app/api/v1/global_rules.py',
      '../backend/app/api/v1/static_resources.py',
    ]) {
      const src = readFileSync(resolve(process.cwd(), f), 'utf-8')
      expect(src).toContain('batch_delete.batch_delete(')
    }
  })
})

describe('mockup-parity · 静态资源卡片页推广（21.9b，2026-11-19）', () => {
  const s = page('StaticResourceList.vue')

  it('卡片走设计解剖 + 双模式 + 色相按行（r14/r17 同款）', () => {
    for (const cls of ['l5-panel', 'lp-strip', 'lp-head', 'lp-body', 'lp-foot', 'lp-check'])
      expect(s, `缺少 ${cls}`).toContain(cls)
    expect(s).toContain('<TableToolbar')
    expect(s).toContain("from '@/composables/useCardClusterGrouping'")
    expect(s).toContain('<ClusterBand')
    expect(s).toContain('l5-card')
    expect(s).toMatch(/mode-\$\{cardMode\}/)
    expect(s).toContain('clusterHueClass(sr.cluster_id)')
    // 旧自造卡头退场
    expect(s).not.toContain('sr-card-topbar')
    expect(s).not.toContain('sr-card-actions')
  })

  it('状态行 chips（分发五态）+ 批量条 + 页头按钮序（r15 同款）', () => {
    expect(s).toContain('class="l5-chiprow"')
    expect(s).toContain('class="chiprow-label"')
    expect(s).toContain('class="l5-batchbar batchbar-dynamic"')
    expect(s).toContain(':show-count="false"')
    expect(s).toContain('批量管理')
    // 「共 N 个静态资源」计数行退场（#86：总数只由 chips「全部 N」承担）
    expect(s).not.toContain('unfilteredTotal')
    expect(s).not.toContain('filterActive')
    // 批量条在 card-grid 之前
    const barIdx = s.indexOf('l5-batchbar')
    const gridIdx = s.indexOf('card-grid')
    expect(gridIdx).toBeGreaterThan(barIdx)
  })

  it('动作收进 ⋯ 菜单：危险项独立 + 常驻解释 + broken 态收敛（AGENTS #81）', () => {
    expect(s).toContain('class="l5-menu"')
    expect(s).toContain('class="mi danger"')
    expect(s).toContain('删平台配置，可同步删 Edge 已分发文件（弹窗可选）')
    expect(s).not.toMatch(/@click="\s*closeCardMenu\(\)/)
    // broken 态：只留禁用编辑 + 删除（菜单），发布禁用带指路 title
    expect(s).toContain("staticResourceState(sr) !== 'broken'")
    expect(s).toContain('关联路由不存在，请先重建路由')
  })

  it('批量删除契约：全局 ids 端点 + 逐条权限由后端兜底', () => {
    expect(s).toContain("endpoint: '/static_resources'")
    expect(s).toContain("idField: 'static_resource_ids'")
    expect(s).toContain("nameField: 'resource_name'")
    expect(s).toContain('subsetConsequence')
  })
})

describe('mockup-parity · 插件开关卡片页推广（21.9b2，2026-11-19）', () => {
  const s = page('PluginSwitches.vue')

  it('卡片走 l5-panel 解剖 + 工具条/chips（无集群维度：无 band、无分组|平铺，#87 ⑥）', () => {
    for (const cls of ['l5-panel', 'lp-head', 'lp-body', 'lp-foot', 'lp-swtext'])
      expect(s, `缺少 ${cls}`).toContain(cls)
    expect(s).toContain('<TableToolbar')
    expect(s).toContain(':show-mode="false"')
    expect(s).toContain('class="l5-chiprow"')
    // 无集群维度：无 ClusterBand / clusterHueClass / 分组|平铺
    expect(s).not.toContain('<ClusterBand')
    expect(s).not.toContain('clusterHueClass')
    // 旧外壳退场：状态条 / 分类 pills / 过滤条
    expect(s).not.toContain('switch-status-bar')
    expect(s).not.toContain('plugin-cat')
    expect(s).not.toContain('plugin-filter-bar')
  })

  it('r29 推论：目录级静态属性不出徽标（无 schema 完整/缺失 badge）；行内警示走共享 lp-notice', () => {
    expect(s).not.toContain('schema 完整')
    expect(s).not.toContain('badge-success')
    expect(s).toContain('class="lp-notice alert alert-warning"')
    // 参数定义 = lp-foot op-pub（折叠块入口）；全部启用/禁用留在工具条
    expect(s).toContain('参数定义')
    expect(s).toContain('data-test="enable-all"')
    expect(s).toContain('data-test="disable-all"')
  })
})

describe('mockup-parity · 重发失败节点六页接线（republish-failed-nodes）', () => {
  const REPUBLISH_PAGES = [
    'StreamProxyList.vue',
    'DnsUdpProxyList.vue',
    'DnsQueryList.vue',
    'PluginConfigList.vue',
    'GlobalRuleList.vue',
    'PluginMetadataList.vue',
    // 服务器证书页 2026-11-20 补接（SSL 升级为卡片页后同构；preview registry 'ssl' 既有）
    'ServerCertList.vue',
  ]

  it('六页均接共享 useRepublishFailedNodes（禁页面内自解析预览响应）', () => {
    for (const f of REPUBLISH_PAGES) {
      const s = page(f)
      expect(s, `${f} 缺 useRepublishFailedNodes`).toContain("from '@/composables/useRepublishFailedNodes'")
      // 页面只接线：不发预览请求（单一实现在 composable 内经 getPublishPreview 取数）
      expect(s, `${f} 页面内直连预览接口`).not.toContain('getPublishPreview')
      // 解析成功文案缓存 + 双动作按钮
      expect(s, `${f} 缺 republishNotices 缓存`).toContain('republishNotices')
      expect(s, `${f} 缺重发按钮`).toContain('重发失败节点')
      // ServerCertList 的「查看差异」ghost 动作在 SslCertCard 卡内单点（下方专段钉住）
      if (f !== 'ServerCertList.vue') expect(s, `${f} 缺查看差异次动作`).toContain('class="n-act ghost"')
      expect(s, `${f} 弹窗未接预选`).toContain(':preselected-node-ids="publishPreselected"')
    }
  })

  it('常规发布入口复位预选（防上一次重发残留泄漏到常规发布）', () => {
    for (const f of REPUBLISH_PAGES) {
      const s = page(f)
      // 重发入口设置、常规入口清空——至少一处「复位」存在
      expect(s, `${f} 缺预选复位`).toContain('publishPreselected.value = []')
    }
  })

  it('SslCertCard partial 提示条单点：server 专属 + 双动作（republish/查看差异）', () => {
    const s = readFileSync(resolve(process.cwd(), 'src/components/SslCertCard.vue'), 'utf-8')
    expect(s).toContain('partialNotice')
    expect(s).toContain("variant === 'server' && partialNotice")
    expect(s).toContain('重发失败节点')
    expect(s).toContain('class="n-act ghost"')
    expect(s).toContain("emit('republish', cert)")
  })

  it('静态资源页不迁移（D7：取持久化明细，语义更精确）；notice 双动作样式走 style.css 单点', () => {
    expect(page('StaticResourceList.vue')).not.toContain('useRepublishFailedNodes')
    const css = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf-8')
    expect(css).toContain('.lp-notice .n-act.ghost')
  })
})

describe('plugin-ref-filter · 插件引用服务端过滤（插件组/全局规则两页）', () => {
  it('常驻「插件」下拉接线：值 = 标识名、请求带 plugin=（#85⑤ 三要件）', () => {
    for (const f of ['PluginConfigList.vue', 'GlobalRuleList.vue']) {
      const s = page(f)
      expect(s, `${f} 缺常驻插件下拉`).toContain('class="l5-select plugin-filter"')
      expect(s, `${f} 请求未带 plugin 参数`).toContain('params.plugin = pluginFilter.value')
      expect(s, `${f} 下拉值语义非标识名`).toContain(':value="pl.name"')
      // D3：选项源含禁用插件（all=1，与 RouteList 有意不同构）
      expect(s, `${f} 选项源应带 all=1`).toContain('{ all: 1 }')
    }
  })

  it('批 7A 客户端过滤退场（禁回潮）', () => {
    for (const f of ['PluginConfigList.vue', 'GlobalRuleList.vue']) {
      const s = page(f)
      expect(s, `${f} matchPluginRef 客户端过滤回潮`).not.toContain('matchPluginRef')
      expect(s, `${f} pluginRefFilter 回潮`).not.toContain('pluginRefFilter')
    }
  })
})

describe('mockup-parity · CA 根证书/服务器证书卡片页推广（2026-11-20）', () => {
  it('两页接 TableToolbar + ClusterBand 分组|平铺（#87/#88 同构）', () => {
    for (const [f, unit] of [
      ['CaCertList.vue', '个 CA 根证书'],
      ['ServerCertList.vue', '个服务器证书'],
    ] as const) {
      const s = page(f)
      expect(s, `${f} 缺 TableToolbar`).toContain('<TableToolbar')
      expect(s, `${f} 缺 ClusterBand`).toContain('<ClusterBand')
      expect(s, `${f} 缺分组组合式`).toContain('useCardClusterGrouping')
      expect(s, `${f} 缺平铺 class`).toContain('`mode-${cardMode}`')
      expect(s, `${f} 计数单位`).toContain(unit)
      // 旧外壳退场
      expect(s, `${f} ssl-header-actions 回潮`).not.toContain('ssl-header-actions')
      expect(s, `${f} ssl-grid 回潮`).not.toContain('class="ssl-grid"')
    }
  })

  it('CA 页：无 chips 行（真实页面无状态档）；分发横幅 + 安装指引保留', () => {
    const s = page('CaCertList.vue')
    expect(s).not.toContain('l5-chiprow')
    expect(s).toContain('cert-banner-ok')
    expect(s).toContain('install-guide')
  })

  it('服务器证书页：发布状态 chips 单一形态（#85①）+ 警示横幅', () => {
    const s = page('ServerCertList.vue')
    expect(s).toContain('class="l5-chiprow"')
    expect(s).toContain('statusTabs')
    expect(s).toContain('publishStatusOf')
    expect(s, '状态归 chips 后工具条不再显示「共 N 个」').toContain(':show-count="false"')
    expect(s).toContain('cert-banner-warn')
  })

  it('SslCertCard 单点：l5-panel 解剖 + 真实文案提示条 + 脚部主操作/⋯ 菜单', () => {
    const s = readFileSync(resolve(process.cwd(), 'src/components/SslCertCard.vue'), 'utf-8')
    expect(s).toContain('l5-panel')
    expect(s).toContain('clusterHueClass')
    expect(s).not.toContain('ssl-card-topbar')
    // 真实文案（E4 / sniMismatch）
    expect(s).toContain('过期后所有已安装此证书的终端将重新显示「不安全」')
    expect(s).toContain('匹配名单与证书 SAN 不一致')
    // foot 主操作（变体分派）+ ⋯ 菜单主文案集合
    expect(s).toContain('>下载根证书</button>')
    expect(s).toContain('mi-main">查看</span>')
    expect(s).toContain('mi-main">删除</span>')
    expect(s).toContain('已发布证书在 Edge 上不受影响')
    // 发布/差异接线保留
    expect(s).toContain('<PublishStatusTag')
    expect(s).toContain('<PublishDiffButton')
  })
})

describe('mockup-parity · 概览与集群管理落地（dashboard-cluster-parity）', () => {
  it('ClusterCard 解剖单点：l5-panel + 色相 + stat-grid 双分支 + 页面 slot 动作区', () => {
    const s = readFileSync(resolve(process.cwd(), 'src/components/ClusterCard.vue'), 'utf-8')
    expect(s).toContain('l5-panel')
    expect(s).toContain('clusterHueClass')
    expect(s).toContain('stat-grid')
    expect(s).toContain('statClick')
    expect(s).toContain('lp-tag tech')
    // 旧解剖退场（两页内联守卫仍由 ClusterCard.source.test.ts 承担）
    expect(s).not.toContain('cl-card-topbar')
    // 离线警示（设计稿 lp-notice）
    expect(s).toContain('个节点离线')
  })

  it('集群管理页：TableToolbar + 状态 chips + ClusterBand（#85①/#87 同构）', () => {
    const s = page('ClusterList.vue')
    expect(s, '缺 TableToolbar').toContain('<TableToolbar')
    expect(s, '缺状态 chips 行').toContain('l5-chiprow')
    expect(s, '缺 ClusterBand').toContain('<ClusterBand')
    expect(s, '缺分组组合式').toContain('useCardClusterGrouping')
    expect(s, '缺平铺 class').toContain('`mode-${cardMode}`')
    // 旧外壳退场
    expect(s, 'cl-header-actions 回潮').not.toContain('cl-header-actions')
    expect(s, '旧状态下拉回潮').not.toContain('全部状态')
    // 顶部备份双入口 + 新建集群保留（功能面不动）
    expect(s).toContain('备份下载')
    expect(s).toContain('新建集群')
  })

  it('概览页：四段信息架构 + 更新于/刷新（无新建集群）', () => {
    const s = page('Dashboard.vue')
    expect(s, '缺大数统计').toContain('dash-stats')
    expect(s, '缺三列状态卡').toContain('dash-cards')
    expect(s, '缺快捷入口单卡').toContain('quick-card')
    expect(s, '缺更新于时间戳').toContain('updated-at')
    // 页头动作只有刷新（用户裁决）
    expect(s, '新建集群回潮').not.toContain('新建集群')
    // StatCard/TableCard 旧组件退场（单点组件不再被概览引用）
    expect(s).not.toContain("from '@/components/StatCard.vue'")
    expect(s).not.toContain("from '@/components/TableCard.vue'")
  })
})

// ── 统一管理页同构红线（central-management-parity，2026-11-20）：网格态 = 卡片页标准外壳，
//    两态模型（网格 ⇄ 最大化面板）；旧壳与不可达中间态死代码不回潮。 ──
describe('mockup-parity：统一管理卡片页同构（central-management-parity）', () => {
  it('网格态：单面板 + 工具条 + 状态 chips + 分组带 + 平铺段', () => {
    const s = page('CentralList.vue')
    expect(s, '缺单面板').toContain('class="l5-card cm-card-page"')
    expect(s, '缺 TableToolbar').toContain('<TableToolbar')
    expect(s, '缺状态 chips 行').toContain('data-test="status-chip-row"')
    expect(s, '缺分组组合式').toContain('useCardClusterGrouping')
    expect(s, '缺分组带').toContain('<ClusterBand')
    expect(s, '缺页头徽标').toContain('<PageStatBadges')
    // 工具条无总数计数（#86③：总数归 chips）
    expect(s, 'show-count 应为 false').toContain(':show-count="false"')
    // 旧状态下拉退场（#85①：状态筛选 = chips 单一形态）
    expect(s, '状态筛选旧下拉回潮').not.toMatch(/<select[^>]*v-model="statusFilter/)
  })

  it('旧壳与死代码不残留', () => {
    const s = page('CentralList.vue')
    expect(s, '旧工具条壳').not.toContain('cl-header-actions')
    expect(s, '旧分组头').not.toContain('group-head')
    expect(s, '集群名快捷小条').not.toContain('cluster-name-item')
    expect(s, '多展开中间态壳').not.toContain('expanded-area')
    expect(s, '旧展开卡壳').not.toContain('card-expanded')
    expect(s, '死代码 toggleExpand').not.toContain('function toggleExpand')
    expect(s, '共 N 个集群计数回潮').not.toContain('共 {{')
  })

  it('最大化面板：两态直渲染 + 色相 + 名称行 + 稳定锚点', () => {
    const s = page('CentralList.vue')
    expect(s, '缺两态直渲染').toContain('v-else-if="maximizedCluster"')
    expect(s, '缺面板容器').toContain('class="max-panel"')
    expect(s, '缺集群色相').toContain('clusterHueClass(maximizedCluster.id)')
    expect(s, '缺稳定锚点').toContain(':data-cluster-id="maximizedCluster.id"')
    expect(s, '缺名称行').toContain('class="max-name-row"')
    expect(s, '缺中继徽章镜像').toContain('maximizedRouteBadge')
    // mini-bar 原地切换保留当前 Tab（行为契约，central.html 状态二）
    expect(s, '缺紧凑切换条').toContain('switchMaximizedCluster')
    expect(s, '缺收起入口').toContain('restoreMaximize')
  })

  it('功能面保持：保存刷新链路 + 局部刷新运行态键 + 统计格直达 Tab', () => {
    const s = page('CentralList.vue')
    expect(s, '保存刷新链路').toContain('@saved="onClusterSaved"')
    expect(s, '局部刷新运行态键（#203）').toContain('CLUSTER_RUNTIME_KEYS')
    expect(s, '统计格直达 Tab').toContain('STAT_TAB_KEYS')
    expect(s, '节点全量拉取（#216）').toContain('fetchAllClusterNodes')
  })
})

// ── 统一管理 · 最大化面板 Tab 内容解剖（central-management-parity 批次 A 外观对齐）──
// 作用域必须落在 `.max-panel .dbody`：CentralList.vue 的 scoped `:deep(.dbody)` / `:deep(.node-table)`
// 段带 !important 且为 3 类选择器，单点在 style.css（4 类选择器压过），改动时同步核这两段。
describe('central-management-parity 批 A：最大化面板 Tab 解剖单点（style.css）', () => {
  const section = () => {
    const i = css.indexOf('统一管理 · 最大化面板 Tab 内容解剖')
    expect(i, '缺少 maximized-panel Tab 解剖段').toBeGreaterThan(-1)
    return css.slice(i)
  }

  it('工具条按钮 = 设计 .tool-btn（30 高 / 12px / 400 / 浅底描边；「添加 X」不再实心 accent）', () => {
    const s = section()
    expect(s).toContain('.max-panel .dbody .node-actions .ant-btn {')
    expect(s).toMatch(/\.max-panel \.dbody \.node-actions \.ant-btn \{[\s\S]*?height: 30px !important;/)
    expect(s).toMatch(/\.max-panel \.dbody \.node-actions \.ant-btn \{[\s\S]*?background: var\(--surface\) !important;/)
    // primary 显式回浅底（否则 CentralList 的 .ant-btn-primary 实心 accent 生效）
    expect(s).toContain('.max-panel .dbody .node-actions .ant-btn-primary {')
    expect(s).toMatch(
      /\.max-panel \.dbody \.node-actions \.ant-btn-primary \{[\s\S]*?background: var\(--surface\) !important;/,
    )
  })

  it('表头 = 设计 .l5-table thead th（--bg 灰底 / 去大写 / 9px 12px / 11px 600）', () => {
    const s = section()
    expect(s).toMatch(
      /\.max-panel \.dbody \.node-table \.ant-table-thead > tr > th \{[\s\S]*?background: var\(--bg\) !important;[\s\S]*?text-transform: none !important;[\s\S]*?padding: 9px 12px !important;/,
    )
    // 竖线：表头 ::before 关闭 + grid-table 竖线在面板内豁免
    expect(s).toContain('.max-panel .dbody .node-table .ant-table-thead > tr > th::before {')
    expect(s).toContain('.max-panel .dbody .node-table.grid-table .ant-table-cell {')
  })

  it('antd 列宽测量行复位为 0 高（否则表头下出现 21px 空白窄带）', () => {
    const s = section()
    // 特异性必须 ≥ 单元格内距规则（4 类），否则 padding 复位被压过
    expect(s).toMatch(
      /\.max-panel \.dbody \.node-table \.ant-table-tbody > tr\.ant-table-measure-row > td[\s\S]*?padding: 0 !important;/,
    )
    expect(s).toMatch(/\.max-panel \.dbody \.ant-table-measure-row \{[\s\S]*?height: 0 !important;/)
  })

  it('单元格与行内按钮尺寸 + 分页条独立成带（上边框 + 10px 内距）', () => {
    const s = section()
    // 设计 .l5-table tbody td 实测 10px 12px（表头保持 9px 12px）
    expect(s).toMatch(
      /\.max-panel \.dbody \.node-table \.ant-table-tbody > tr > td \{[\s\S]*?padding: 10px 12px !important;/,
    )
    expect(s).toMatch(/\.max-panel \.dbody \.node-table \.ant-table-tbody \.ant-btn \{[\s\S]*?height: 24px !important;/)
    // 行内动作容器 + ⋯ 锚点（parity 批 B：与列表页 .action-cell / .action-trigger-btn 同构）
    expect(s).toContain('.max-panel .dbody .node-table .action-cell {')
    expect(s).toMatch(
      /\.max-panel \.dbody \.node-table \.ant-table-tbody \.action-trigger-btn \{[\s\S]*?width: 26px !important;[\s\S]*?background: transparent !important;/,
    )
    expect(s).toContain('.max-panel .dbody .l5-pager {')
    // 用户 2026-11-21 反馈：分页条须与独立列表页同形态（上边框分隔 + 10px 16px 内距），
    // 且落在封闭容器内部——右缘内距与工具条对齐（卡片包表格，见下一 describe）
    expect(s).toMatch(
      /\.max-panel \.dbody \.l5-pager \{[\s\S]*?border-top: 1px solid var\(--border\);[\s\S]*?padding: 10px 16px;/,
    )
  })
})

// ── 统一管理 · 最大化面板 Tab 内容封闭容器（2026-11-21 用户裁决）──
// 7 个 Tab 的内容与左侧菜单对应模块同构：一张 1px 边框卡片包住「工具条 + 表格/卡片网格 + 分页条」。
// 硬约束：内层不加 box-shadow（面板本身是卡片，叠加会成双层阴影）。
// DOM 事实：Tab 根节点是切换动效包裹层 `.max-swap` 的子代，故选择器经 `.max-swap`；
// `.plugin-metadata` 变体是防未来重构漂移的兜底（当前被 CentralList 的 `.tab-content` 包裹）。
describe('最大化面板：Tab 内容封闭容器（tab-content card，2026-11-21）', () => {
  const block = () => {
    const m = css.match(
      /\.max-panel \.dbody \.max-swap > \.tab-content,\n\.max-panel \.dbody \.max-swap > \.plugin-metadata \{[\s\S]*?\n\}/,
    )
    expect(m, '缺少 Tab 内容封闭容器规则').not.toBeNull()
    return m![0]
  }

  it('两个 Tab 根节点都进封闭容器（.tab-content / .plugin-metadata）', () => {
    const b = block()
    expect(b).toContain('.max-panel .dbody .max-swap > .tab-content,')
    expect(b).toContain('.max-panel .dbody .max-swap > .plugin-metadata {')
    expect(b).toContain('background: var(--surface);')
    expect(b).toContain('border: 1px solid var(--border);')
    expect(b).toContain('border-radius: var(--radius-lg);')
    expect(b).toContain('overflow: hidden;')
  })

  it('内层容器不带阴影（双层阴影已排除）', () => {
    expect(block()).not.toContain('box-shadow')
  })

  it('工具条 = 带内距的下边线带（12px 16px，不再靠自己 margin 与表格拉开）', () => {
    const s = css.slice(css.indexOf('统一管理 · 最大化面板 Tab 内容解剖'))
    expect(s).toMatch(
      /\.max-panel \.dbody \.node-actions \{[\s\S]*?margin-bottom: 0;[\s\S]*?padding: 12px 16px;[\s\S]*?border-bottom: 1px solid var\(--border\);/,
    )
  })

  it('卡片 Tab 网格内距四向 16px（不再贴容器左右边框）', () => {
    for (const f of [
      'views/clusters/ClusterPluginConfigs.vue',
      'views/clusters/ClusterGlobalRules.vue',
      'views/clusters/ClusterStaticResources.vue',
    ]) {
      const src = readFileSync(resolve(process.cwd(), 'src', f), 'utf-8')
      expect(src, `${f} 网格内距`).toContain('gap: 16px; padding: 16px"')
      expect(src, `${f} 不得留 16px 0`).not.toContain('gap: 16px; padding: 16px 0"')
    }
    const pm = readFileSync(resolve(process.cwd(), 'src/components/PluginMetadata.vue'), 'utf-8')
    // B2c：面板顶部新增「添加插件元数据」工具条（通栏带），根节点内距下移到 .plugin-panels——
    // 否则工具条会被缩进 32px（根 16px + 工具条自身 16px 左内距）。
    expect(pm).toMatch(/\.plugin-metadata \{\n[\s\S]*?padding: 0;/)
    expect(pm).toMatch(/\.plugin-panels \{[\s\S]*?padding: 16px;/)
  })
})
