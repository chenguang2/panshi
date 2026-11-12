// cluster-select-unification 源码守卫（范式同 clusterNodesFullFetch.source.test.ts）：
// 模板里写了 <ClusterSelect> 却漏 import 时，Vue 会把未解析组件渲染成无内边距的空自定义元素——
// 控件直接消失（并且 width 样式让它变成隐形占位把整行推右），而 vue-tsc -b 与组件单测都抓不到。
// 2026-11-11 实测事故：EdgeAutostart.vue 换装时漏 import，页面集群下拉整体不可见。
// vitest(jsdom) 下 import.meta.url 为 http 协议，文件定位用 process.cwd()（vitest 从 frontend/ 运行）。
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join, relative } from 'node:path'

const SRC = resolve(process.cwd(), 'src')

function vueFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue
      out.push(...vueFiles(full))
    } else if (entry.endsWith('.vue')) {
      out.push(full)
    }
  }
  return out
}

/** 模板区（去掉 <script> 段）里的 <ClusterSelect 标签 */
function usesInTemplate(source: string): boolean {
  const templateEnd = source.indexOf('<script')
  const template = templateEnd === -1 ? source : source.slice(0, templateEnd)
  return /<ClusterSelect\b/.test(template)
}

describe('ClusterSelect 消费方必须显式 import（源码守卫）', () => {
  it('每个模板使用 <ClusterSelect> 的 .vue 都 import 了该组件', () => {
    const offenders: string[] = []
    for (const file of vueFiles(SRC)) {
      const source = readFileSync(file, 'utf-8')
      if (!usesInTemplate(source)) continue
      const imported = /import\s+ClusterSelect\s+from\s+['"]@\/components\/ClusterSelect\.vue['"]/.test(source)
      if (!imported) offenders.push(relative(SRC, file))
    }
    expect(
      offenders,
      `以下文件模板使用了 ClusterSelect 但未 import（控件会静默消失）：${offenders.join(', ')}`,
    ).toEqual([])
  })
})
