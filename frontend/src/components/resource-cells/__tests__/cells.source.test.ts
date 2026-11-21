// B0 单元格原语源码守卫（shared-core-plan 3.2 层 1）：
// 这些组件是「面板 Tab ↔ 独立列表页」共用的纯展示原语，必须两边都能用，故：
//   ① 不得 import 任何 useCluster*（会把面板的 cluster 语义带进页面侧）——
//      方案 shared-core-plan 3.2「强制走 ResourceListState，组件内禁止 import useCluster*」；
//   ② 不得 import @/views/* 的具体页面（否则页面壳被拖进面板）；
//   ③ 不得出现 as any / @ts-ignore / @ts-expect-error（#5）；
//   ④ 适配层同样不得 import @/types 的业务类型（泛型接口，不钉资源形状）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const SRC = resolve(process.cwd(), 'src')
const CELLS_DIR = join(SRC, 'components', 'resource-cells')

const CELL_FILES = ['IndexCell.vue', 'NodeStatusCell.vue', 'RouteMethodsCell.vue', 'UpstreamTargetsCell.vue']

const read = (file: string): string => readFileSync(file, 'utf-8')

describe('resource-cells 源码守卫', () => {
  it('四个原语组件都存在', () => {
    for (const name of CELL_FILES) {
      expect(() => read(join(CELLS_DIR, name)), `${name} 缺失`).not.toThrow()
    }
  })

  it('不 import 任何 useCluster*（面板语义不得进入共享组件）', () => {
    const offenders = CELL_FILES.filter((name) => /useCluster/.test(read(join(CELLS_DIR, name))))
    expect(offenders, `以下组件引用了 useCluster*：${offenders.join(', ')}`).toEqual([])
  })

  it('不 import @/views/*（页面壳同样不得进入共享组件）', () => {
    const offenders = CELL_FILES.filter((name) => /from\s+['"]@\/views\//.test(read(join(CELLS_DIR, name))))
    expect(offenders, `以下组件引用了 @/views：${offenders.join(', ')}`).toEqual([])
  })

  it('无 as any / @ts-ignore / @ts-expect-error', () => {
    const offenders = CELL_FILES.filter((name) => {
      const source = read(join(CELLS_DIR, name))
      return /\bas any\b/.test(source) || /@ts-(ignore|expect-error)/.test(source)
    })
    expect(offenders, `以下组件含类型逃逸：${offenders.join(', ')}`).toEqual([])
  })

  it('全部使用 <script setup lang="ts"> + withDefaults', () => {
    const offenders = CELL_FILES.filter((name) => {
      const source = read(join(CELLS_DIR, name))
      return !/<script setup lang="ts">/.test(source) || !/withDefaults\(/.test(source)
    })
    expect(offenders, `以下组件未按约定声明：${offenders.join(', ')}`).toEqual([])
  })

  it('适配层不 import @/types 的业务类型（纯泛型）', () => {
    const source = read(join(SRC, 'composables', 'useResourceListState.ts'))
    expect(/from\s+['"]@\/types/.test(source)).toBe(false)
    expect(/from\s+['"]@\/views\//.test(source)).toBe(false)
    expect(/\bas any\b/.test(source)).toBe(false)
  })
})
