// B2a 静态资源表单/ZIP 弹窗共用源码守卫（docs/refactoring/shared-core-plan-2026-11-21.md 3.1）
// 2026-11-22（A 推广最后一块）：统一管理最大化面板的「静态资源」Tab 不再有面板专属组件，
// 面板直接渲染 StaticResourceList 的 scoped 形态 → 宿主只剩这一处，本守卫由「两入口」收敛为「唯一宿主」，
// 并钉住面板专属组件不得回流（唯一实现 = views/StaticResourceList.vue）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const PAGE = 'src/views/StaticResourceList.vue'

function page(): string {
  return readFileSync(resolve(process.cwd(), PAGE), 'utf-8')
}

describe('静态资源表单共用守卫（B2a，唯一宿主 = StaticResourceList.vue）', () => {
  it('唯一宿主：引用共享表单（集群清单参数化，scoped 传单元素清单 + 锁定）', () => {
    const s = page()
    expect(s).toContain('<StaticResourceFormModal')
    expect(s).toContain(':clusters="formClusterOptions"')
    expect(s).toContain("import StaticResourceFormModal from '@/components/StaticResourceFormModal.vue'")
    // scoped（面板 Tab）只有一个集群 → 单元素清单 + 锁定；页面形态不锁（集群全量可选）
    expect(s).toContain(':lock-cluster="isScoped"')
    expect(s).toContain(':default-cluster-id="isScoped ? scopedClusterId : null"')
    expect(s).toMatch(
      /const formClusterOptions = computed\(\(\) => \{[\s\S]*?return \[\{ id, name: c\?\.name \?\? '', display_name: c\?\.display_name \}\]/,
    )
    // 页头/空态创建入口仍叫 openAddModal（uxReviewM 守卫 + 既有交互锚点）
    expect(s).toContain('openAddModal')
  })

  it('ZIP 内容弹窗改用共享 ZipContentsModal，内容拉取不再自写一份', () => {
    const s = page()
    expect(s).toContain('<ZipContentsModal')
    expect(s).toContain("import ZipContentsModal from '@/components/ZipContentsModal.vue'")
    // 拉取请求只在组件内（消费方不应再拼 zip-contents 路径）
    expect(s).not.toContain('/zip-contents')
  })

  it('唯一宿主不含内联表单块与内联 ZIP 表格', () => {
    const s = page()
    for (const marker of [
      '<a-form',
      'a-form-item',
      'class="modal-overlay"',
      '<Teleport',
      'zip-table',
      'route-validation-item',
      'id="srFormModal"',
      'id="zipContentsModal"',
      '路由路径必须以 /* 结尾',
    ]) {
      expect(s, `StaticResourceList.vue 不应再出现 ${marker}`).not.toContain(marker)
    }
  })

  it('面板专属组件不得回流（唯一实现 = views/StaticResourceList.vue）', () => {
    expect(() =>
      readFileSync(resolve(process.cwd(), 'src/views/clusters/ClusterStaticResources.vue'), 'utf-8'),
    ).toThrow()
  })

  it('提交/校验逻辑只在共享组件内：宿主只做「开关 + 刷新」接线', () => {
    const s = page()
    expect(s).not.toContain('handleStaticResourceSubmit')
    expect(s).not.toContain('staticResourceFormData')
    expect(s).not.toContain('handleSubmit')
    expect(s).not.toContain('formData')
    expect(s).not.toContain('availableRoutes')
    expect(s).toContain('@saved=')
    expect(s).toContain('@close=')
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
