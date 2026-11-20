// ux-review-2026-10-04 H1/H4 源码守卫：
// H1 统一管理统计条在卡片宽度下截断末项（截图实证「静态资源」只剩「静」字）
// H4 「节点 0/0」实为 healthy/total，无图例则语义不可解
// 2026-10-04 集群卡片组件化（档位 C）：统计条与 title 提示随卡片解剖收敛至
// components/ClusterCard.vue（两页共用），守卫对象同步迁移、意图不变。
// 注：vitest(jsdom) 下 import.meta.url 为 http 协议，文件定位用 process.cwd()（vitest 从 frontend/ 运行）
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function src(...parts: string): string {
  return readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf-8')
}

describe('集群卡片统计条（ux-review H1/H4）', () => {
  it('H1: 统计条容器允许换行，不再截断末项（守卫对象已迁移至 ClusterCard）', () => {
    // 21.11：统计区解剖化（stat-grid 固定 7 列网格，grid 天然换行容器——卡片网格断点由外层 card-grid 承担）
    const m = src('components', 'ClusterCard.vue').match(/\.stat-grid\s*\{[^}]*\}/)
    expect(m, 'ClusterCard.vue 需定义 .stat-grid').toBeTruthy()
    expect(m![0], '统计区容器需为网格布局（grid）').toMatch(/grid/)
  })

  it('H4: 节点统计带健康/总数图例提示（ClusterCard 为两页唯一渲染点）', () => {
    expect(src('components', 'ClusterCard.vue')).toContain('title="健康节点 / 节点总数"')
  })

  it('H4 接线：两页均经 ClusterCard 渲染卡片（统计条守卫的可达性前提）', () => {
    for (const f of ['ClusterList.vue', 'CentralList.vue']) {
      expect(src('views', f), f).toMatch(/import ClusterCard from '@\/components\/ClusterCard\.vue'/)
    }
  })
})
