// 源码守卫：面板 composable 表单死代码不得回流（B1.5 起点 → A 推广清理收口）。
//
// 背景：B1（docs/refactoring/shared-core-plan-2026-11-21.md 3.1）把统一管理面板的上游/路由/插件组
// 表单换成共享组件（UpstreamFormModal / RouteFormModal / PluginEntityFormModal），原 composable 的
// modal 状态、dirty 快照、target 校验与 submit 成为死代码，B1.5 先删表单态。
//
// 2026-11-22（A 推广清理）：七个 Tab 全部改为直接渲染对应独立页组件的 scoped 形态后，面板专用的
// 四个薄封装工厂整体失去生产消费方，文件已删除（本批）。本守卫改为钉「不回流」：
//   · useClusterUpstreams.ts / useClusterRoutes.ts / useClusterPluginConfigs.ts / useClusterGlobalRules.ts
//     必须不存在（否则有人会重新引入第二份面板列表/发布实现）；
//   · 仍保留的共享工厂 useClusterPluginEntity.ts 不得重新长出表单态。
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const COMPOSABLES = resolve(process.cwd(), 'src/composables')

function src(file: string): string {
  return readFileSync(resolve(COMPOSABLES, file), 'utf-8')
}

/** 单词边界匹配：`upstreamForm` 不会误伤 `upstreamFormRef` 之外的其它标识符 */
function hasSymbol(source: string, symbol: string): boolean {
  return new RegExp(`\\b${symbol}\\b`).test(source)
}

describe('面板 composable 死代码守卫（B1.5 → A 推广清理）', () => {
  it.each(['useClusterUpstreams.ts', 'useClusterRoutes.ts', 'useClusterPluginConfigs.ts', 'useClusterGlobalRules.ts'])(
    '%s 已随面板 scoped 化删除（禁回流第二份面板列表/发布实现）',
    (file) => {
      expect(existsSync(resolve(COMPOSABLES, file)), `${file} 不应存在`).toBe(false)
    },
  )

  it('useClusterPluginEntity.ts 不再持有表单态/提交逻辑（表单在共享组件内）', () => {
    const source = src('useClusterPluginEntity.ts')
    for (const symbol of [
      'modalVisible',
      'activeTab',
      'formMode',
      'formData',
      'showAdd',
      'editItem',
      'handleSubmit',
      'publishGuide',
    ]) {
      expect(hasSymbol(source, symbol), `useClusterPluginEntity.ts 不应再出现表单符号 ${symbol}`).toBe(false)
    }
  })
})
