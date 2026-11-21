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

// ── 节点 Tab 表单共用守卫（B2b-1）：与 B1 三个 Tab 同口径 ──
describe('节点 Tab 表单共用守卫（B2b-1）', () => {
  it('引用共享 NodeFormModal，带单元素集群清单 + lock-cluster', () => {
    const s = src('ClusterNodes.vue')
    expect(s).toContain('<NodeFormModal')
    expect(s).toContain(':clusters="formClusters"')
    expect(s).toContain(':default-cluster-id="props.cluster.id"')
    expect(s).toContain('lock-cluster')
    expect(s).toContain("import NodeFormModal from '@/components/NodeFormModal.vue'")
    expect(s).toContain('{ id: props.cluster.id, name: props.cluster.name, display_name: props.cluster.display_name }')
  })

  it('单条表单模板不得回流：无 a-form / a-form-item / nodeForm 模型 / handleNodeSubmit / validateIP', () => {
    const s = src('ClusterNodes.vue')
    expect(s).not.toContain('<a-form')
    expect(s).not.toContain('a-form-item')
    expect(s).not.toMatch(/\bnodeForm\b/)
    expect(s).not.toContain('handleNodeSubmit')
    expect(s).not.toContain('validateIP')
    // 批量导入块保留（B2b-2 再处理）：既有 parse/importNodes 链路仍在
    expect(s).toContain('handleImportSubmit')
    expect(s).toContain('parseTextToRows')
  })

  it('保存/关闭只做列表刷新，提交逻辑不在宿主重写', () => {
    const s = src('ClusterNodes.vue')
    expect(s).toContain('@saved="onNodeFormSaved"')
    expect(s).toContain('@close="closeNodeForm"')
    // 单条提交的 POST/PUT 只剩在共享组件内（面板里没有 /nodes` 或 /nodes/${id} 的创建/更新调用）
    expect(s).not.toContain('api.post(`/clusters/${clusterId}/nodes`')
    expect(s).not.toContain('api.put(`/clusters/')
  })
})
