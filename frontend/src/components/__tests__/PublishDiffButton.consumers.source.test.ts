import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// 源码守卫（publish-diff-preview spec: 四入口一致接入）：上游/路由的独立页与
// 统一管理 Tab 共四个入口，发布状态列必须经共享 PublishDiffButton 提供预览入口，
// 禁止逐页内联复制按钮（同 ClusterSelect.consumers 守卫范式）。
//
// 列宽防裁切（发布状态列宽方案 A，2026-11-13 用户确认）：partial 态标签
// 「⚠ v15 · 发布未完全生效」约 170px + ▾ 按钮 23px，定宽 140/160 会把按钮裁没；
// 四入口统一 width: 200 + 状态单元格 status-cell-flex（nowrap 防标签与按钮分离）。

const ROOT = resolve(__dirname, '../../..')

const ENTRY_FILES = [
  'src/views/UpstreamList.vue',
  'src/views/RouteList.vue',
  'src/views/clusters/ClusterUpstreams.vue',
  'src/views/clusters/ClusterRoutes.vue',
  'src/views/PluginConfigList.vue',
  'src/views/GlobalRuleList.vue',
  'src/views/PluginMetadataList.vue',
  'src/views/clusters/ClusterPluginConfigs.vue',
  'src/views/clusters/ClusterGlobalRules.vue',
  'src/components/PluginMetadata.vue',
  'src/views/StreamProxyList.vue',
  'src/views/DnsUdpProxyList.vue',
]

// 卡片形态入口：按钮在卡片组件内、经 emit 上抛业务（页面挂弹窗）
const CARD_FILES = ['src/components/SslCertCard.vue']

// SSL 服务器证书页：按钮在 SslCertCard 内（见 CARD_FILES），页面只挂弹窗并监听卡片上抛
const SSL_PAGE = 'src/views/ServerCertList.vue'

const WIDTH_FILES = [
  'src/composables/useClusterUpstreams.ts',
  'src/composables/useClusterRoutes.ts',
  'src/views/RouteList.vue',
]

function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf-8')
}

/** 取 publish_status 列定义块（key 起始 300 字符内） */
function columnBlock(src: string): string {
  const idx = src.indexOf("key: 'publish_status'")
  expect(idx).toBeGreaterThan(-1)
  return src.slice(idx, idx + 300)
}

describe('PublishDiffButton consumers', () => {
  it.each(ENTRY_FILES)('%s 接入 PublishDiffButton + PublishPreviewModal', (rel) => {
    const src = read(rel)
    expect(src).toContain('<PublishDiffButton')
    expect(src).toContain('<PublishPreviewModal')
    // 「去发布」必须回接页面既有发布流程，不得在入口内联发布编排
    expect(src).toMatch(/@publish="/)
  })

  it.each(ENTRY_FILES)('%s 发布状态单元格用 status-cell-flex 防裁切', (rel) => {
    expect(read(rel)).toContain('status-cell-flex')
  })

  it.each(CARD_FILES)('%s 卡片接入 PublishDiffButton（emit preview-diff 上抛）', (rel) => {
    const src = read(rel)
    expect(src).toContain('<PublishDiffButton')
    expect(src).toContain("emit('preview-diff'")
    expect(src).toContain('status-cell-flex')
  })

  it(`${SSL_PAGE} 挂预览弹窗并监听卡片上抛`, () => {
    const src = read(SSL_PAGE)
    expect(src).toContain('<PublishPreviewModal')
    expect(src).toContain('@preview-diff=')
    expect(src).toContain('resource-type="\'ssl\'"')
  })

  it.each(WIDTH_FILES)('%s 发布状态列宽为 200（partial 态放得下按钮）', (rel) => {
    const block = columnBlock(read(rel))
    expect(block).toContain('width: 200')
    expect(block).not.toMatch(/width: 1[0-9]0/)
  })
})
