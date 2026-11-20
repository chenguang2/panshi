// 集群编辑保存 → 列表刷新 链路守卫（2026-11-20 用户缺陷跟踪）：
// 用户曾报「编辑集群为禁用后状态徽标/chips 不刷新、须 F5」；当场复测为改版过渡态
// 旧包假象（硬刷新后正常、连续 10 轮翻转实测全即时刷新）。此守卫把真实链路钉在
// 源码层，防止后续改版把「保存后重载列表」这环静默弄丢后以同症状回归：
//   ClusterFormModal 保存成功 emit('saved') → 页面 @saved 处理器必须调 loadClusters()。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf-8')
const modal = read('src/components/ClusterFormModal.vue')

describe('集群编辑保存后列表刷新链路', () => {
  it('ClusterFormModal：PUT 成功后 emit saved（close 前后不限，但必须在 api.put 之后）', () => {
    expect(modal).toContain("emit('saved')")
    const putAt = modal.indexOf('api.put(`/clusters/${props.editingCluster.id}`')
    const savedAt = modal.indexOf("emit('saved')")
    expect(putAt).toBeGreaterThan(-1)
    expect(savedAt).toBeGreaterThan(putAt)
  })

  it('ClusterList（集群管理）：@saved 处理器必须重载列表', () => {
    const s = read('src/views/ClusterList.vue')
    expect(s).toMatch(/@saved="onClusterFormSaved"/)
    expect(s).toMatch(/function onClusterFormSaved\([^)]*\)[\s\S]{0,120}loadClusters\(\)/)
  })

  it('CentralList（统一管理）：@saved 处理器必须重载列表', () => {
    const s = read('src/views/CentralList.vue')
    expect(s).toMatch(/@saved="onClusterSaved"/)
    expect(s).toMatch(/const onClusterSaved = \(\)[\s\S]{0,120}loadClusters\(\)/)
  })
})
