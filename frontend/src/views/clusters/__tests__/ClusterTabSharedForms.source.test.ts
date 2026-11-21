// B1 表单共用源码守卫（docs/refactoring/shared-core-plan-2026-11-21.md 3.1）
// 最大化面板的三个 Tab（上游 / 路由 / 插件组）表单必须引用共享表单组件，
// 不得再出现面板自写的内联表单块（a-form / a-form-item / modal-overlay / Teleport 表单）。
// 违反即回到「两套表单两套校验」的分叉状态，这是本批次要消除的根因。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function src(file: string): string {
  return readFileSync(resolve(process.cwd(), 'src/views/clusters', file), 'utf-8')
}

const INLINE_FORM_MARKERS = ['<a-form', 'a-form-item', 'class="modal-overlay"', '<Teleport']

describe('面板 Tab 表单共用守卫（B1）', () => {
  it('上游 Tab：引用共享 UpstreamFormModal，且传单元素集群清单', () => {
    const s = src('ClusterUpstreams.vue')
    expect(s).toContain('<UpstreamFormModal')
    expect(s).toContain(':clusters="formClusters"')
    expect(s).toContain("import UpstreamFormModal from '@/components/UpstreamFormModal.vue'")
    // 面板只有一个集群 → 单元素清单（组件内 ClusterSelect 编辑态禁用，add 态仅一个可选项）
    expect(s).toContain('{ id: props.cluster.id, name: props.cluster.name, display_name: props.cluster.display_name }')
  })

  it('路由 Tab：引用共享 RouteFormModal，带 defaultClusterId 单集群上下文', () => {
    const s = src('ClusterRoutes.vue')
    expect(s).toContain('<RouteFormModal')
    expect(s).toContain(':clusters="formClusters"')
    expect(s).toContain(':default-cluster-id="props.cluster.id"')
    expect(s).toContain("import RouteFormModal from '@/components/RouteFormModal.vue'")
  })

  it('插件组 Tab：引用共享 PluginEntityFormModal（plugin_config + 发布引导）', () => {
    const s = src('ClusterPluginConfigs.vue')
    expect(s).toContain('<PluginEntityFormModal')
    expect(s).toContain('resource-type="plugin_config"')
    expect(s).toContain('with-publish-guide')
    expect(s).toContain(':clusters="formClusters"')
    expect(s).toContain("import PluginEntityFormModal from '@/components/PluginEntityFormModal.vue'")
  })

  it.each(['ClusterUpstreams.vue', 'ClusterRoutes.vue', 'ClusterPluginConfigs.vue'])(
    '%s 不再包含内联表单块（a-form / a-form-item / modal-overlay / Teleport）',
    (file) => {
      const s = src(file)
      for (const marker of INLINE_FORM_MARKERS) {
        expect(s, `${file} 不应再出现 ${marker}`).not.toContain(marker)
      }
    },
  )

  it('三个 Tab 只做「关闭 + 刷新 + 发布引导」，提交逻辑留在共享组件内', () => {
    // 面板不再有自写提交函数（handleXxxSubmit / 提交时拼 payload 的 api.post/api.put 调用）
    const upstreams = src('ClusterUpstreams.vue')
    const routes = src('ClusterRoutes.vue')
    const pluginConfigs = src('ClusterPluginConfigs.vue')
    expect(upstreams).not.toContain('handleUpstreamSubmit')
    expect(upstreams).not.toContain('/upstreams`, submitData')
    expect(routes).not.toContain('handleRouteSubmit')
    expect(pluginConfigs).not.toContain('handlePluginConfigSubmit')
    // 三处都有 saved / publish-requested 接线
    for (const s of [upstreams, routes, pluginConfigs]) {
      expect(s).toContain('@saved=')
      expect(s).toContain('@publish-requested=')
    }
  })
})
