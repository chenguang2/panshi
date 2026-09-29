import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 源码守卫测试：这些视图的执行中定时器 / SSE 连接此前在离页时不清理（缺陷 L1/L2/L9）。
// 行为级挂载测试难以覆盖"切页时机"，故直接断言源码中 onUnmounted 含对应清理调用，
// 防止未来重构把清理逻辑删掉（范式：RelayGateways.vue 的 onUnmounted → stopElapsedTimer + cancel）。

const viewsDir = join(dirname(fileURLToPath(import.meta.url)), '..')

function sourceOf(...segments: string[]): string {
  return readFileSync(join(viewsDir, ...segments), 'utf-8')
}

/** 取源码中 onUnmounted( 回调起始处往后的代码片段（每个视图仅一个 onUnmounted） */
function onUnmountedBlock(src: string): string {
  const idx = src.indexOf('onUnmounted(')
  expect(idx, '文件中应存在 onUnmounted(').toBeGreaterThan(-1)
  return src.slice(idx, idx + 500)
}

describe('视图生命周期清理守卫（源码守卫）', () => {
  it('NodeList.vue: onUnmounted 清理执行耗时定时器（stopElapsedTimer）', () => {
    const block = onUnmountedBlock(sourceOf('NodeList.vue'))
    expect(block).toContain('stopElapsedTimer()')
  })

  it('NodeList.vue: loadClusters 失败不再静默空 catch（提示集群列表加载失败）', () => {
    const src = sourceOf('NodeList.vue')
    const fnStart = src.indexOf('async function loadClusters()')
    expect(fnStart).toBeGreaterThan(-1)
    const fnEnd = src.indexOf('\n}', fnStart)
    const fnBody = src.slice(fnStart, fnEnd)
    expect(fnBody).toContain("message.warning('集群列表加载失败')")
  })

  it('clusters/ClusterNodes.vue: onUnmounted 清理安装进度定时器（clearInstallTimer）', () => {
    const block = onUnmountedBlock(sourceOf('clusters', 'ClusterNodes.vue'))
    expect(block).toContain('clearInstallTimer()')
  })

  it('DatabaseManagement.vue: onUnmounted 中止迁移 SSE（migrationController.abort）', () => {
    const block = onUnmountedBlock(sourceOf('DatabaseManagement.vue'))
    expect(block).toContain('migrationController.value?.abort()')
  })
})
