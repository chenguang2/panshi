// B2a 静态资源表单/ZIP 弹窗共用源码守卫（docs/refactoring/shared-core-plan-2026-11-21.md 3.1）
// 两入口（集群统一管理「静态资源」Tab / 左侧「静态资源」页）必须引用共享 StaticResourceFormModal +
// ZipContentsModal，不得再出现内联表单 / 内联 ZIP 表格（违反即回到「两套表单两套校验」的分叉）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function panel(): string {
  return readFileSync(resolve(process.cwd(), 'src/views/clusters/ClusterStaticResources.vue'), 'utf-8')
}
function page(): string {
  return readFileSync(resolve(process.cwd(), 'src/views/StaticResourceList.vue'), 'utf-8')
}

describe('静态资源表单共用守卫（B2a）', () => {
  it('面板 Tab：引用共享表单（单元素集群清单 + 锁定集群 + 新增态预选）', () => {
    const s = panel()
    expect(s).toContain('<StaticResourceFormModal')
    expect(s).toContain(':clusters="formClusters"')
    expect(s).toContain(':default-cluster-id="props.cluster.id"')
    expect(s).toContain('lock-cluster')
    expect(s).toContain("import StaticResourceFormModal from '@/components/StaticResourceFormModal.vue'")
    // 面板只有一个集群 → 单元素清单（组件内 ClusterSelect 编辑/锁定态禁用）
    expect(s).toContain('{ id: props.cluster.id, name: props.cluster.name, display_name: props.cluster.display_name }')
  })

  it('静态资源页：引用共享表单（全量集群、不锁集群）', () => {
    const s = page()
    expect(s).toContain('<StaticResourceFormModal')
    expect(s).toContain(':clusters="clusters"')
    expect(s).not.toContain('lock-cluster')
    expect(s).toContain("import StaticResourceFormModal from '@/components/StaticResourceFormModal.vue'")
    // 页头/空态创建入口仍叫 openAddModal（uxReviewM 守卫 + 既有交互锚点）
    expect(s).toContain('openAddModal')
  })

  it.each([
    ['面板', panel],
    ['页面', page],
  ])('%s：ZIP 内容弹窗改用共享 ZipContentsModal，内容拉取不再各写一份', (_label, read) => {
    const s = read()
    expect(s).toContain('<ZipContentsModal')
    expect(s).toContain("import ZipContentsModal from '@/components/ZipContentsModal.vue'")
    // 拉取请求只在组件内（消费方不应再拼 zip-contents 路径）
    expect(s).not.toContain('/zip-contents')
  })

  it('面板不再包含内联表单块与内联 ZIP 表格（a-form / a-form-item / modal-overlay / Teleport / zip-table）', () => {
    const s = panel()
    for (const marker of [
      '<a-form',
      'a-form-item',
      'class="modal-overlay"',
      '<Teleport',
      'zip-table',
      'route-validation-item',
    ]) {
      expect(s, `面板不应再出现 ${marker}`).not.toContain(marker)
    }
  })

  it('页面不再包含内联表单/内联 ZIP 弹窗（#srFormModal / #zipContentsModal / zip-table / 三条件重复清单）', () => {
    const s = page()
    for (const marker of [
      'id="srFormModal"',
      'id="zipContentsModal"',
      'class="zip-table"',
      'route-validation-item',
      '路由路径必须以 /* 结尾',
    ]) {
      expect(s, `页面不应再出现 ${marker}`).not.toContain(marker)
    }
  })

  it('提交/校验逻辑只在共享组件内：两处均无自写提交函数与表单数据模型', () => {
    const p = panel()
    const g = page()
    expect(p).not.toContain('handleStaticResourceSubmit')
    expect(p).not.toContain('staticResourceFormData')
    expect(g).not.toContain('handleSubmit')
    expect(g).not.toContain('formData')
    expect(g).not.toContain('availableRoutes')
    // 两处都只做「开关 + 刷新」接线
    for (const s of [p, g]) {
      expect(s).toContain('@saved=')
      expect(s).toContain('@close=')
    }
  })

  it('资格判定单点：三条勾叉与下拉后缀同源（utils/staticResourceRoute 的 staticResourceRouteChecks）', () => {
    const utils = readFileSync(resolve(process.cwd(), 'src/utils/staticResourceRoute.ts'), 'utf-8')
    expect(utils).toContain('export function staticResourceRouteChecks')
    // eligibility 由 checks 派生（不再另写一套三条件）
    expect(utils).toMatch(/staticResourceRouteEligibility[\s\S]{0,200}staticResourceRouteChecks\(route\)/)
    const comp = readFileSync(resolve(process.cwd(), 'src/components/StaticResourceFormModal.vue'), 'utf-8')
    expect(comp).toContain('staticResourceRouteChecks')
    expect(comp).toContain('routeEligibilitySuffix')
    // 组件内不得重复手写三条件
    expect(comp).not.toContain("endsWith('/*')")
  })
})
