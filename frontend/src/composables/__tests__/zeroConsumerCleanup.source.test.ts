// 源码守卫：零消费残留不得回流（2026-11-22 清理，用户已批准）。
//
// 本轮删除的三条零消费残留（docs/refactoring/open-items-2026-11-22.md「零消费候选」）：
//   ① composables/useClusterResource.ts 的分页资源通用 CRUD 工厂——面板七个 Tab 改为直接渲染独立页
//      组件（AGENTS #93）后它失去全部生产消费方；同文件的 useClusterListCore 仍是节点子表的共享骨架，
//      必须保留（AGENTS #24：不合并、不搬移）。
//   ② src/style.css 的 `.empty5 .e-actions .ant-btn*` 规则——动作区插槽渲染的是原生 `.btn`，零命中。
//   ③ src/api/nodes.ts 的节点批量删除薄封装——批量删除统一走 useClusterGroupedBatchDelete。
//
// 扫描口径：src 生产源码（排除 __tests__ 目录与 *.test.ts / *.spec.ts），断言旧符号零出现。
// 注意（AGENTS #93⑧）：注释里写到旧符号同样会被本守卫命中，生产源码的注释须用描述性措辞。
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

const SRC = resolve(process.cwd(), 'src')

/** 递归收集生产源码（排除测试目录/测试文件） */
function collectSourceFiles(dir = SRC): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue
      out.push(...collectSourceFiles(join(dir, entry.name)))
      continue
    }
    if (!/\.(ts|vue|css)$/.test(entry.name)) continue
    if (/\.(test|spec)\.ts$/.test(entry.name)) continue
    out.push(join(dir, entry.name))
  }
  return out
}

const SOURCE_FILES = collectSourceFiles()

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf-8')
}

/**
 * 单词边界 + 排除模块路径的匹配：`useClusterResource` 不会命中 `useClusterResourceCore`，
 * 也不会命中 `from './useClusterResource'` 这类模块路径（守卫只盯标识符引用/导出/注释）。
 */
function filesMentioning(symbol: string): string[] {
  const re = new RegExp(`(?<![/\\w$])${symbol}\\b`)
  return SOURCE_FILES.filter((file) => re.test(readFileSync(file, 'utf-8'))).map((file) => file.slice(SRC.length + 1))
}

describe('零消费残留守卫（2026-11-22 清理）', () => {
  it('分页资源通用 CRUD 工厂已删除，src 生产源码零出现', () => {
    expect(filesMentioning('useClusterResource'), '该工厂已删除，不得有消费方或注释回流').toEqual([])
  })

  it('useClusterListCore 仍由 composables/useClusterResource.ts 导出（防过度删除）', () => {
    const source = read('src/composables/useClusterResource.ts')
    expect(source).toContain('export function useClusterListCore')
    // 节点子表仍消费该骨架（唯一生产消费方）
    expect(read('src/composables/useClusterNodes.ts')).toContain(
      "import { useClusterListCore } from './useClusterResource'",
    )
    // 文件只剩共享骨架：不得再引入删除/发布十件套的核心模块（否则说明工厂被重建）
    expect(source).not.toContain("from './useClusterResourceCore'")
  })

  it('节点批量删除薄封装与其专属载荷类型已删除，src 生产源码零出现', () => {
    expect(filesMentioning('deleteNodesBatch')).toEqual([])
    expect(filesMentioning('NodeBatchDeletePayload')).toEqual([])
  })

  it('api/nodes.ts 其余节点接口保持完好（只删批量薄封装）', () => {
    const api = read('src/api/nodes.ts')
    for (const fn of [
      'export function listNodes',
      'export function createNode',
      'export function updateNode',
      'export function deleteNode',
      'export function startNode',
      'export function stopNode',
      'export function queryNodeStatus',
      'export function getClusterNodes',
    ]) {
      expect(api, `api/nodes.ts 仍应导出 ${fn}`).toContain(fn)
    }
  })

  it('style.css 不再有 .empty5 动作区的 antd 按钮规则，容器布局保留', () => {
    const css = read('src/style.css')
    // 行首匹配：`.max-panel .dbody .empty5 .e-actions .ant-btn` 是另一处规则，不在此断言范围内
    expect(css, '空态动作区的 antd 按钮规则已随零消费清理删除').not.toMatch(/(^|\n)\.empty5 \.e-actions \.ant-btn/)
    expect(css).toMatch(/\.empty5 \.e-actions \{\n {2}display: flex;\n {2}gap: 8px;\n\}/)
  })
})
