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
  it('节点页：批量条 l5-batchbar（has-sel + 清除选择），批量导入在页头（先于「+ 添加节点」）', () => {
    const s = page('NodeList.vue')
    expect(s).toContain('class="l5-batchbar" :class="{ \'has-sel\': selectedNodeKeys.length > 0 }"')
    expect(s).toContain('清除选择')
    const importPos = s.indexOf('批量导入')
    const addPos = s.indexOf('+ 添加节点')
    expect(importPos).toBeGreaterThan(-1)
    expect(addPos).toBeGreaterThan(importPos)
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
    // 路由/上游：手写菜单在删除项前插入分隔线
    for (const f of ['RouteList.vue', 'UpstreamList.vue']) {
      expect(page(f), f).toMatch(/<a-menu-divider \/>\s*<a-menu-item danger/)
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
    // 三处消费点：节点行内、节点详情、统一管理 Tab
    for (const [f, count] of [
      ['NodeList.vue', 2],
      ['clusters/ClusterNodes.vue', 1],
    ]) {
      const s = page(f)
      expect(s, f).toContain('status="disabled"')
      expect((s.match(/status="disabled"/g) || []).length, f).toBe(count)
      expect(s, f).not.toContain('text="已禁用" status="neutral"')
    }
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
  it('r7-③ 差异预览按钮 = 设计 .diff-btn（20×20 圆形 + accent 30% 描边 + chevron SVG）', () => {
    const s = readFileSync(resolve(process.cwd(), 'src/components/PublishDiffButton.vue'), 'utf-8')
    expect(s).toContain('<polyline points="6 9 12 15 18 9" />')
    expect(s).not.toContain('<span class="tri">▾</span>')
    const block = s.slice(s.indexOf('.diff-preview-btn {'))
    expect(block).toContain('width: 20px')
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
    const createIdx = s.indexOf('新建四层代理</button>')
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
