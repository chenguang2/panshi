import { expect, it } from 'vitest'
import type { Mock } from 'vitest'
import type { VueWrapper } from '@vue/test-utils'

/**
 * 「分组筛选三件套」共享测试工厂（审计 docs/refactoring/test-case-audit-2026-10-01.md §3.3）：
 * 多个列表页测试文件曾逐字复制以下三个用例，差异仅在被测组件、列表端点、期望分组名
 * 与 group_name 参数断言方式，故收敛为参数化工厂。在宿主文件的 describe 内调用，
 * 用例注册进该 describe（沿用原用例名，失败信息可直接定位）。
 */
export interface GroupFilterSuiteOptions {
  /** 挂载被测列表页（宿主 beforeEach 的 mock 数据已就绪），内部完成异步刷新 */
  mountPage: () => Promise<VueWrapper>
  /** 分组下拉应包含的分组名（逐项 toContain） */
  expectedGroups: string[]
  /** api.get mock 与列表主数据端点；两者齐备时生成「始终携带 group_name 参数」用例 */
  apiGet?: Mock
  listUrl?: string
  /** group_name 断言方式：'defined' = 每次调用都带该参数；'sentinel' = 首次调用传 '__all__' */
  groupParamAssert?: 'defined' | 'sentinel'
  /** 分组下拉「全部」选项文案（缺省「全部分组」；插件组主列表为「全部集群分组」，plugin-group-ux-close-loop M2） */
  allLabel?: string
}

export function itGroupFilterSuite(opts: GroupFilterSuiteOptions): void {
  const { mountPage, expectedGroups, apiGet, listUrl, groupParamAssert, allLabel = '全部分组' } = opts

  it('renders group filter select before cluster filter', async () => {
    const wrapper = await mountPage()
    const selects = wrapper.findAll('select')
    // 集群筛选以下拉默认选项「全部集群」精确判定（分组下拉的「全部集群分组」含该子串，子串匹配会撞车）
    const isClusterFilter = (s: { findAll: (sel: string) => { text: () => string }[] }) =>
      s.findAll('option').some((o) => o.text() === '全部集群')
    const groupIdx = selects.findIndex((s) => s.text().includes(allLabel))
    const clusterIdx = selects.findIndex(isClusterFilter)
    expect(groupIdx).toBeGreaterThanOrEqual(0)
    expect(clusterIdx).toBeGreaterThanOrEqual(0)
    expect(groupIdx).toBeLessThan(clusterIdx)
  })

  it('populates group filter options from cluster group_names', async () => {
    const wrapper = await mountPage()
    const groupSelect = wrapper.findAll('select').find((s) => s.text().includes(allLabel))
    expect(groupSelect).toBeDefined()
    const optionTexts = groupSelect!.findAll('option').map((o) => o.text())
    for (const group of expectedGroups) {
      expect(optionTexts).toContain(group)
    }
  })

  if (apiGet && listUrl && groupParamAssert) {
    it('always passes group_name in API request', async () => {
      await mountPage()
      const calls = apiGet.mock.calls.filter((c: unknown[]) => c[0] === listUrl)
      expect(calls.length).toBeGreaterThan(0)
      if (groupParamAssert === 'sentinel') {
        const params = (calls[0][1] as { params?: { group_name?: string } } | undefined)?.params
        expect(params).toBeDefined()
        expect(params!.group_name).toBe('__all__')
      } else {
        for (const call of calls) {
          const params = (call[1] as { params?: { group_name?: string } } | undefined)?.params
          expect(params?.group_name).toBeDefined()
        }
      }
    })
  }
}
