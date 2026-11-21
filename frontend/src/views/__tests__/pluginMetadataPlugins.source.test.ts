// plugin-metadata-plugins-config 源码守卫（范式同 clusterNodesFullFetch.source.test.ts）：
// 插件元数据可选插件的唯一事实源 = features.yaml 顶层 plugin_metadata_plugins（经
// features store 解析），旧 Python 写死开关已全链路退役——两入口源码与类型声明不得
// 再出现该字段（连注释都不留字面量，防止未来会话回退为写死开关造成双机制静默失效）。
// vitest(jsdom) 下 import.meta.url 为 http 协议，文件定位用 process.cwd()（vitest 从 frontend/ 运行）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function src(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf-8')
}

const ENTRY_FILES = [
  'views/PluginMetadataList.vue',
  // B2c：创建入口收敛进共享弹窗后，弹窗成为第二个消费方（同一份清单、同一条过滤实现）
  'components/PluginMetadataCreateModal.vue',
  // 统一管理面板（旧 components/PluginMetadata.vue，已随 scoped 单实现批次删除）曾按用户裁决 2026-11-21
  // 移除「可用插件」分类树；面板现直接渲染本文件同款页面组件（scoped 形态），可选插件只在创建弹窗内呈现。
]

describe('插件元数据可用插件单源守卫（features.yaml 清单，写死开关退役）', () => {
  it('各添加入口经 featuresStore.metadataPlugins 清单过滤', () => {
    for (const f of ENTRY_FILES) {
      expect(src(f), `${f} 必须消费 featuresStore.metadataPlugins`).toMatch(/featuresStore\.metadataPlugins/)
      expect(src(f), `${f} 必须有 features 清单兜底加载`).toMatch(/featuresStore\.load\(\)/)
    }
  })

  it('统一管理面板不再自行拉取/过滤可选插件（清单单源，防止第二份实现回流）', () => {
    // A 推广第 3 个卡片类资源（2026-11-22）：面板插件元数据 Tab 直接渲染 PluginMetadataList 的
    // scoped 形态，旧面板组件 components/PluginMetadata.vue 已删除 → 本守卫改为钉住「它不得回流」。
    expect(() => src('components/PluginMetadata.vue')).toThrow()
    const central = src('views/CentralList.vue')
    expect(central).not.toMatch(/components\/PluginMetadata\.vue/)
  })

  it('两入口源码与类型声明不再出现写死开关字段', () => {
    const files = [...ENTRY_FILES, 'types/index.ts']
    for (const f of files) {
      expect(src(f), `${f} 不应再出现已退役的写死开关字段（唯一事实源 = features.yaml 清单）`).not.toMatch(
        /enable_metadata/,
      )
    }
  })
})
