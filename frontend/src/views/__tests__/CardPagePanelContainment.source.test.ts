// 卡片页面板包含守卫（2026-11-20 用户缺陷：集群管理「分组|平铺」工具条漂在面板外）：
// 卡片页「工具条 → 状态 chips 行 → 网格」必须同处一个 .l5-card 面板——对齐列表页
// table-container l5-card 解剖与设计页 clusters.html / ca-certs.html / server-certs.html
// （设计页基线：面板唯一，grid 自身无框、经 .l5-card > .card-grid 内距 16px 取呼吸感）。
// 同类缺陷三页同修（用户约定：确认一处缺陷须同轮修正全部受影响同级页）：
//   ClusterList（集群管理，用户报告）/ CaCertList（CA 根证书）/ ServerCertList（服务器证书）。
//   2026-11-20 追加：CentralList（统一管理，central-management-parity 网格态换壳）。
// 其余八个卡片页（插件开关/插件组/插件元数据/静态资源/四层/DNS-UDP/DNS 查询/全局规则）
// 工具条已在面板内、仅网格自带内框（box-in-box），是否拉平为独立决策项，勿在此并入。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const page = (f: string) => readFileSync(resolve(process.cwd(), 'src/views', f), 'utf-8')
const css = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf-8')

const CASES = [
  { f: 'ClusterList.vue', gridHook: 'cl-grid-wrap card-grid', hasChips: true },
  { f: 'CaCertList.vue', gridHook: 'ca-grid card-grid', hasChips: false },
  { f: 'ServerCertList.vue', gridHook: 'sc-grid card-grid', hasChips: true },
  { f: 'CentralList.vue', gridHook: 'cluster-grid card-grid', hasChips: true },
] as const

describe('卡片页工具条面板包含（r15 与列表页同构）', () => {
  it.each(CASES)('$f：工具条/状态行/网格同处一个 .l5-card 面板', ({ f, gridHook, hasChips }) => {
    const s = page(f)

    // 1) 面板开标签先于工具条（工具条在面板内，不再漂浮在面板外；容忍 v-if 等前置属性的多行/单行写法）
    const panelAt = s.search(/<div\s[^>]*class="l5-card/)
    const toolbarAt = s.indexOf('<TableToolbar')
    expect(panelAt, `${f} 缺 .l5-card 面板包裹工具条`).toBeGreaterThan(-1)
    expect(toolbarAt, `${f} 缺 TableToolbar`).toBeGreaterThan(-1)
    expect(panelAt, `${f} 工具条须在 .l5-card 面板内`).toBeLessThan(toolbarAt)

    // 2) 状态 chips 行也在面板内（有状态行的页）
    if (hasChips) {
      const chipAt = s.indexOf('l5-chiprow')
      expect(chipAt, `${f} 缺状态 chips 行`).toBeGreaterThan(-1)
      expect(panelAt, `${f} 状态行须在 .l5-card 面板内`).toBeLessThan(chipAt)
      expect(chipAt).toBeLessThan(s.indexOf(gridHook))
    }

    // 3) 网格在面板内且不自带面板（防 box-in-box / 双框回潮）
    const gridAt = s.indexOf(gridHook)
    expect(gridAt, `${f} 缺网格 ${gridHook}`).toBeGreaterThan(-1)
    expect(panelAt).toBeLessThan(gridAt)
    expect(s, `${f} 网格不得自带 l5-card（面板唯一）`).not.toMatch(/class="[^"]*\bcard-grid\b[^"]*l5-card/)
  })

  it('style.css：面板内网格内距 16px（设计页 .l5-card .card-grid 基线，直子代且非自框网格）', () => {
    expect(css).toMatch(/\.l5-card > \.card-grid:not\(\.l5-card\) \{[^}]*padding: 16px/)
  })
})
