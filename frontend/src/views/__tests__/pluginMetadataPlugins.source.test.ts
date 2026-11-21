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
  'components/PluginMetadata.vue',
  // B2c：创建入口收敛进共享弹窗后，弹窗成为第三个消费方（同一份清单、同一条过滤实现）
  'components/PluginMetadataCreateModal.vue',
]

describe('插件元数据可用插件单源守卫（features.yaml 清单，写死开关退役）', () => {
  it('各添加入口经 featuresStore.metadataPlugins 清单过滤', () => {
    for (const f of ENTRY_FILES) {
      expect(src(f), `${f} 必须消费 featuresStore.metadataPlugins`).toMatch(/featuresStore\.metadataPlugins/)
      expect(src(f), `${f} 必须有 features 清单兜底加载`).toMatch(/featuresStore\.load\(\)/)
    }
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
