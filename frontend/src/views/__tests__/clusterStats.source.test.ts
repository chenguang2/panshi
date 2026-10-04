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
    const m = src('components', 'ClusterCard.vue').match(/\.cl-card-stats\s*\{[^}]*\}/)
    expect(m, 'ClusterCard.vue 需定义 .cl-card-stats').toBeTruthy()
    expect(m![0], '统计条容器需支持窄屏换行（auto-fit 网格或 flex-wrap）').toMatch(/auto-fit|flex-wrap/)
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
