import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 源码守卫（publish-diff-preview spec: 四入口一致接入）：上游/路由的独立页与
// 统一管理 Tab 共四个入口，发布状态列必须经共享 PublishDiffButton 提供预览入口，
// 禁止逐页内联复制按钮（同 ClusterSelect.consumers 守卫范式）。

const ROOT = resolve(__dirname, '../../..')

const ENTRY_FILES = [
  'src/views/UpstreamList.vue',
  'src/views/RouteList.vue',
  'src/views/clusters/ClusterUpstreams.vue',
  'src/views/clusters/ClusterRoutes.vue',
]

describe('PublishDiffButton consumers', () => {
  it.each(ENTRY_FILES)('%s 接入 PublishDiffButton + PublishPreviewModal', (rel) => {
    const src = readFileSync(resolve(ROOT, rel), 'utf-8')
    expect(src).toContain('<PublishDiffButton')
    expect(src).toContain('<PublishPreviewModal')
    // 「去发布」必须回接页面既有发布流程，不得在入口内联发布编排
    expect(src).toMatch(/@publish="/)
  })
})
