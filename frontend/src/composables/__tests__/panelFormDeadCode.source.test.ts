// B1.5 源码守卫：面板 composable 不得再持有「表单态 / 提交 / 表单校验」公共逻辑。
//
// 背景：B1（docs/refactoring/shared-core-plan-2026-11-21.md 3.1）已把统一管理面板的上游/路由/插件组
// 表单换成共享组件（UpstreamFormModal / RouteFormModal / PluginEntityFormModal），原 composable 里
// 的 modal 状态、dirty 快照、target 校验与 submit 因此成为死代码，已由 B1.5 删除。
//
// 两套表单两套校验是本批次要消除的根因：把表单态加回这三个 composable 就会重新分叉。
// 新增表单能力请落共享组件（components/*FormModal.vue）。面板侧的「引用共享组件」断言已在
// views/clusters/__tests__/ClusterTabSharedForms.source.test.ts 覆盖，本文件只钉 composable 的导出面。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function src(file: string): string {
  return readFileSync(resolve(process.cwd(), 'src/composables', file), 'utf-8')
}

/** 单词边界匹配：`upstreamForm` 不会误伤 `upstreamFormRef` 之外的其它标识符 */
function hasSymbol(source: string, symbol: string): boolean {
  return new RegExp(`\\b${symbol}\\b`).test(source)
}

describe('面板 composable 表单死代码守卫（B1.5）', () => {
  it.each([
    [
      'useClusterUpstreams.ts',
      [
        'upstreamModalVisible',
        'upstreamModalActiveTab',
        'upstreamForm',
        'upstreamFormRef',
        'targetValidation',
        'formErrors',
        'handleUpstreamSubmit',
        'showAddUpstreamModal',
        'editUpstream',
        'editUpstreamByRecord',
        'copyUpstreamByRecord',
        'closeUpstreamModal',
        'isUpstreamFormDirty',
        'validateTargets',
        'validateHost',
        'addUpstreamTarget',
        'removeUpstreamTarget',
      ],
    ],
    [
      'useClusterRoutes.ts',
      [
        'routeModalVisible',
        'routeModalActiveTab',
        'routeForm',
        'routeFormRef',
        'handleRouteSubmit',
        'showAddRouteModal',
        'editRoute',
        'editRouteByRecord',
        'copyRoute',
        'copyRouteByRecord',
        'availablePlugins',
        'loadAvailablePlugins',
        'ALL_METHODS',
        'viewPluginConfigDetail',
      ],
    ],
    [
      'useClusterPluginEntity.ts',
      ['modalVisible', 'activeTab', 'formMode', 'formData', 'showAdd', 'editItem', 'handleSubmit', 'publishGuide'],
    ],
    [
      'useClusterPluginConfigs.ts',
      [
        'pluginConfigModalVisible',
        'pluginConfigActiveTab',
        'pluginConfigFormMode',
        'pluginConfigFormData',
        'showAddPluginConfig',
        'editPluginConfig',
        'handlePluginConfigSubmit',
      ],
    ],
  ])('%s 不再持有表单态/提交逻辑（表单在共享组件内）', (file, symbols) => {
    const source = src(file)
    for (const symbol of symbols) {
      expect(hasSymbol(source, symbol), `${file} 不应再出现表单符号 ${symbol}`).toBe(false)
    }
  })

  it('useClusterGlobalRules.ts 只做薄封装（无表单态）', () => {
    const source = src('useClusterGlobalRules.ts')
    for (const symbol of ['formData', 'handleSubmit', 'modalVisible', 'publishGuide']) {
      expect(hasSymbol(source, symbol), `useClusterGlobalRules.ts 不应再出现表单符号 ${symbol}`).toBe(false)
    }
  })
})
