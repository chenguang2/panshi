import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { fileURLToPath } from 'node:url'

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8')
}

/**
 * cluster-ux-close-loop B1 源码守卫：两页删除集群编排必须收敛到共享实现
 * deleteClusterWithConfirm（useClusterUtils.ts 单一实现），页面不得内联编排
 * （历史 P0：ClusterList 降级分支 onOk 仅 loadClusters() 假成功）。
 */
describe('删除集群编排收敛源码守卫（cluster-ux-close-loop B1）', () => {
  const clusterList = read('../ClusterList.vue')
  const centralList = read('../CentralList.vue')
  const utils = read('../../composables/useClusterUtils.ts')

  it('useClusterUtils 导出 deleteClusterWithConfirm 且含 static_resources 中文标签', () => {
    expect(utils).toContain('export async function deleteClusterWithConfirm')
    expect(utils).toContain("static_resources: '静态资源'")
  })

  it('ClusterList 删除入口委托共享编排，不再内联名称确认/进度执行', () => {
    expect(clusterList).toContain('deleteClusterWithConfirm(')
    // 内联编排痕迹必须清除（名称确认/进度执行已收敛进共享函数）
    expect(clusterList).not.toContain('showNameConfirm')
    expect(clusterList).not.toContain('executeDeleteWithProgress(')
    // P0 假成功形态：降级分支 onOk 仅刷新列表
    expect(clusterList).not.toContain('onOk: async () => loadClusters()')
  })

  it('CentralList 删除入口委托共享编排，不再内联名称确认/进度执行', () => {
    expect(centralList).toContain('deleteClusterWithConfirm(')
    expect(centralList).not.toContain('showNameConfirm')
    // CentralList 仅在子资源（路由）删除时引用 showDeleteConfirm/executeDeleteWithProgress，
    // 但集群删除本身必须走共享编排：不得再出现集群专属的内联名称确认弹窗标题
    expect(centralList).not.toContain('请输入集群名称确认删除')
  })
})
