// 集群卡片组件化统一（档位 C）源码守卫：
// ClusterList / CentralList 两页必须共用 components/ClusterCard.vue，
// 不再各自内联完整卡片模板（CentralList 历史上分组/未分组两份拷贝）。
// vitest(jsdom) 下 import.meta.url 为 http 协议，文件定位用 process.cwd()（vitest 从 frontend/ 运行）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

function src(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf-8')
}

describe('集群卡片组件化统一 · 组件存在性', () => {
  it('components/ClusterCard.vue 存在并承载卡片解剖（stats/name/节点 tag/路径徽章）', () => {
    const p = resolve(process.cwd(), 'src/components/ClusterCard.vue')
    expect(existsSync(p), 'ClusterCard.vue 必须存在').toBe(true)
    const s = readFileSync(p, 'utf-8')
    expect(s).toContain('cl-card-stats')
    expect(s).toContain('cl-card-name')
    expect(s).toContain('cl-card-nodes')
    expect(s).toContain('cl-route-badge')
    expect(s).toContain('title="健康节点 / 节点总数"')
    expect(s).toContain('集群标识: ')
    expect(s).toContain('集群名: ')
  })

  it('#id 尾注已删除：CentralList 不再渲染 cl-card-id，数字 ID 仅经主标题 tooltip 露出', () => {
    expect(src('views/CentralList.vue')).not.toMatch(/cl-card-id/)
    expect(src('components/ClusterCard.vue')).toMatch(/ID: \$\{props\.cluster\.id\}/)
  })
})

describe('集群卡片组件化统一 · 两页接入', () => {
  it('两页均 import 并使用 ClusterCard', () => {
    for (const f of ['ClusterList.vue', 'CentralList.vue']) {
      const s = src('views', f)
      expect(s, f).toMatch(/import ClusterCard from '@\/components\/ClusterCard\.vue'/)
      expect(s, f).toContain('<ClusterCard')
    }
  })

  it('两页均传入 route-badge（页面计算，组件不发请求）', () => {
    for (const f of ['ClusterList.vue', 'CentralList.vue']) {
      expect(src('views', f), f).toMatch(/:route-badge="routeBadge\(/)
    }
  })

  it('两页不再内联卡片解剖模板（stats/头部/节点区由组件渲染）', () => {
    for (const f of ['ClusterList.vue', 'CentralList.vue']) {
      const s = src('views', f)
      expect(s, `${f} 不应再内联 cl-card-stats`).not.toContain('cl-card-stats')
      expect(s, `${f} 不应再内联 cl-card-name`).not.toContain('cl-card-name')
      expect(s, `${f} 不应再内联 cl-card-header`).not.toContain('cl-card-header')
      expect(s, `${f} 不应再内联 cl-card-nodes`).not.toContain('cl-card-nodes')
      expect(s, `${f} 不应再内联卡片根 class="cl-card"`).not.toContain('class="cl-card"')
    }
  })

  it('CentralList 两份卡片拷贝已收敛：不再出现 .cl-card-name 主标题内联块', () => {
    const s = src('views', 'CentralList.vue')
    expect((s.match(/\.cl-card-name">\{\{ cluster\.display_name/g) || []).length).toBe(0)
    expect(s, 'cl-card-info 的 inline flex 布局须清除').not.toContain(
      'style="display: flex; align-items: center; gap: 8px"',
    )
  })
})
