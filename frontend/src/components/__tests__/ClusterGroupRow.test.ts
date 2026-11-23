import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ClusterGroupRow from '../ClusterGroupRow.vue'
import type { GroupHeaderRow } from '@/composables/useListClusterGrouping'

function row(overrides: Partial<GroupHeaderRow> = {}): GroupHeaderRow {
  return {
    __groupHeader: true,
    key: '__group__:3',
    groupKey: '3',
    label: '生产集群',
    chips: [{ label: '7 节点' }, { label: '6 运行中', tone: 'ok' }, { label: '1 未检测', tone: 'warn' }],
    folded: false,
    ...overrides,
  }
}

describe('ClusterGroupRow.vue', () => {
  it('渲染集群名与全部统计芯片文案', () => {
    const wrapper = mount(ClusterGroupRow, { props: { row: row() } })
    expect(wrapper.find('.g-name').text()).toBe('生产集群')
    const chips = wrapper.findAll('.g-chip')
    expect(chips).toHaveLength(3)
    expect(chips.map((c) => c.text())).toEqual(['7 节点', '6 运行中', '1 未检测'])
  })

  it('芯片 tone 落到对应类名（首个数量芯片无色调）', () => {
    const wrapper = mount(ClusterGroupRow, { props: { row: row() } })
    const chips = wrapper.findAll('.g-chip')
    expect(chips[0].classes()).toEqual(['g-chip'])
    expect(chips[1].classes()).toContain('ok')
    expect(chips[2].classes()).toContain('warn')
  })

  it('展开态：箭头不折叠（.g-chev 无 folded，aria-expanded=true）', () => {
    const wrapper = mount(ClusterGroupRow, { props: { row: row() } })
    const chev = wrapper.find('.g-chev')
    expect(chev.classes()).not.toContain('folded')
    expect(chev.attributes('aria-expanded')).toBe('true')
  })

  it('折叠态：.g-chev 带 folded、aria-expanded=false', () => {
    const wrapper = mount(ClusterGroupRow, { props: { row: row({ folded: true }) } })
    const chev = wrapper.find('.g-chev')
    expect(chev.classes()).toContain('folded')
    expect(chev.attributes('aria-expanded')).toBe('false')
  })

  it('点击箭头 emit toggle', async () => {
    const wrapper = mount(ClusterGroupRow, { props: { row: row() } })
    await wrapper.find('.g-chev').trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)
  })

  it('点击行内容（非箭头区）也 emit toggle，且不重复触发', async () => {
    const wrapper = mount(ClusterGroupRow, { props: { row: row() } })
    await wrapper.find('.g-name').trigger('click')
    expect(wrapper.emitted('toggle')).toHaveLength(1)
  })

  it('渲染 data-test 定位点与 accent 左条容器', () => {
    const wrapper = mount(ClusterGroupRow, { props: { row: row() } })
    expect(wrapper.find('[data-test="cluster-group-row"]').exists()).toBe(true)
    expect(wrapper.find('.l5-group-inner').exists()).toBe(true)
  })

  it('无芯片时不渲染统计容器', () => {
    const wrapper = mount(ClusterGroupRow, { props: { row: row({ chips: [] }) } })
    expect(wrapper.find('.g-meta').exists()).toBe(false)
  })
})

// ── 组头统计芯片提显解剖（group-chip-prominence 2026-11-23 方案 C）源码守卫 ──
// chips 单点 = style.css 的 .g-chip 段（唯一消费方 ClusterGroupRow.vue）；设计基准
// = proposal-c/theme.css 的 .g-chip 段。两侧必须同值（约定 #82：设计页是活的验收基准）。
// jsdom 不加载外部 CSS，样式值只能走源码扫描断言；回退到弱化样式（11px/400/无边框）即红。

const STYLE_CSS = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf-8')
const THEME_CSS = readFileSync(resolve(process.cwd(), '../docs/ui/Live-Artifact-5/proposal-c/theme.css'), 'utf-8')

/** 取 .g-chip 段（自 `.g-chip {` 起至 `.g-chip.warn { … }` 止），只校验该段避免误伤他处 */
function chipSegment(css: string): string {
  const start = css.indexOf('.g-chip {')
  expect(start, '找不到 .g-chip 段').toBeGreaterThanOrEqual(0)
  const warnIdx = css.indexOf('.g-chip.warn', start)
  expect(warnIdx, '找不到 .g-chip.warn 规则').toBeGreaterThan(start)
  return css.slice(start, css.indexOf('}', warnIdx) + 1)
}

describe.each([
  ['style.css（实现单点）', chipSegment(STYLE_CSS)],
  ['theme.css（设计基准）', chipSegment(THEME_CSS)],
])('组头统计芯片方案 C 解剖同值（%s）', (_label, segment) => {
  it('全部芯片 12px / 600 / mono，数量档前景色 + 22% 边框 + 12% 底', () => {
    expect(segment).toContain('font-size: 12px')
    expect(segment).toContain('font-weight: 600')
    expect(segment).toContain('var(--font-mono)')
    expect(segment).toContain('border: 1px solid oklch(50% 0.018 240 / 22%)')
    expect(segment).toContain('background: oklch(50% 0.018 240 / 12%)')
    expect(segment).toContain('color: var(--fg)')
  })

  it('ok 档：前景 50% / 底 20% / 边 35%', () => {
    expect(segment).toContain('background: oklch(55% 0.15 145 / 20%)')
    expect(segment).toContain('border-color: oklch(55% 0.15 145 / 35%)')
    expect(segment).toContain('color: oklch(50% 0.15 145)')
  })

  it('warn 档：前景琥珀 57%/70 / 底 20% / 边 35%', () => {
    expect(segment).toContain('background: oklch(65% 0.15 85 / 20%)')
    expect(segment).toContain('border-color: oklch(65% 0.15 85 / 35%)')
    expect(segment).toContain('color: oklch(57% 0.13 70)')
  })

  it('bad 档：前景 50% / 底 16% / 边 35%', () => {
    expect(segment).toContain('background: oklch(55% 0.18 28 / 16%)')
    expect(segment).toContain('border-color: oklch(55% 0.18 28 / 35%)')
    expect(segment).toContain('color: oklch(50% 0.18 28)')
  })

  it('无弱化样式残留（11px / muted 数量档）', () => {
    expect(segment).not.toContain('font-size: 11px')
    expect(segment).not.toContain('color: var(--muted)')
    expect(segment).not.toContain('var(--success-bg)')
    expect(segment).not.toContain('var(--danger-bg)')
  })
})
