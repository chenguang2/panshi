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

  it('全局规则 Tab：引用共享 PluginEntityFormModal（global_rule）+ 预选并锁定当前集群', () => {
    // 2026-11-21 用户实测：面板「添加全局规则」集群默认未选中 → 补 defaultClusterId + lockCluster
    const s = src('ClusterGlobalRules.vue')
    expect(s).toContain('<PluginEntityFormModal')
    expect(s).toContain('resource-type="global_rule"')
    expect(s).toContain(':clusters="[props.cluster]"')
    expect(s).toContain(':default-cluster-id="props.cluster.id"')
    expect(s).toContain('lock-cluster')
  })

  it('插件组 Tab：引用共享 PluginEntityFormModal（plugin_config + 发布引导）', () => {
    const s = src('ClusterPluginConfigs.vue')
    expect(s).toContain('<PluginEntityFormModal')
    expect(s).toContain('resource-type="plugin_config"')
    expect(s).toContain('with-publish-guide')
    expect(s).toContain(':clusters="formClusters"')
    expect(s).toContain(':default-cluster-id="props.cluster.id"')
    expect(s).toContain('lock-cluster')
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
    // B2b-2 已把批量导入迁至共享组件（原「批量块保留」断言在此反转）
    expect(s).not.toContain('handleImportSubmit')
    expect(s).not.toContain('parseTextToRows')
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

// ── 节点批量导入共用守卫（B2b-2）：两侧超集合并进 NodeBatchImportModal ──
const BATCH_IMPORT_LEAK_MARKERS = [
  'parseIpList',
  'parseNodeCsv',
  'buildNodeCsvTemplate',
  'validateNodeImportRow',
  'nodeImportRows',
  'nodes/batch',
]

describe('节点批量导入共用守卫（B2b-2）', () => {
  const COMPONENT_PATH = resolve(process.cwd(), 'src/components/NodeBatchImportModal.vue')

  it('面板 ClusterNodes 引用共享弹窗，集群由上下文锁定', () => {
    const s = src('ClusterNodes.vue')
    expect(s).toContain('<NodeBatchImportModal')
    expect(s).toContain(':cluster-id="props.cluster.id"')
    expect(s).toContain('lock-cluster')
    expect(s).toContain('@saved="onBatchImportSaved"')
    expect(s).toContain("import NodeBatchImportModal from '@/components/NodeBatchImportModal.vue'")
  })

  it('页面 NodeList 引用共享弹窗，集群清单注入弹窗内选择', () => {
    const page = readFileSync(resolve(process.cwd(), 'src/views/NodeList.vue'), 'utf-8')
    expect(page).toContain('<NodeBatchImportModal')
    expect(page).toContain(':clusters="clusters"')
    expect(page).toContain('@saved="refreshList"')
    expect(page).toContain("import NodeBatchImportModal from '@/components/NodeBatchImportModal.vue'")
    // 页头入口仍在（mockup-parity r5：批量导入先于添加节点）
    expect(page).toContain('openBatchImport')
  })

  it.each([
    ['ClusterNodes.vue', () => src('ClusterNodes.vue')],
    ['NodeList.vue', () => readFileSync(resolve(process.cwd(), 'src/views/NodeList.vue'), 'utf-8')],
  ])('%s 不再自持批量导入逻辑（解析/校验/模板/提交零回流）', (file, read) => {
    const s = read()
    for (const marker of BATCH_IMPORT_LEAK_MARKERS) {
      expect(s, `${file} 不应再出现 ${marker}`).not.toContain(marker)
    }
    expect(s).not.toContain('handleImportSubmit')
    expect(s).not.toContain('parseTextToRows')
    expect(s).not.toContain('submitNodeBatchImport')
  })

  it('共享组件承担解析/校验/提交单点，预览列覆盖两侧并集', () => {
    const component = readFileSync(COMPONENT_PATH, 'utf-8')
    expect(component).toContain("from '@/utils/nodeImport'")
    expect(component).toContain('validateNodeImportRow')
    expect(component).toContain('requestNodeBatchCreate')
    // 载荷构造只在 composable 单点，组件不得直写 POST
    expect(component).not.toContain('api.post(')
    for (const head of ['IP', '服务端口', '管理端口', 'Edge 路径', 'Nginx 安装目录', '状态', '原因']) {
      expect(component, `预览表应含列 ${head}`).toContain(`<th>${head}</th>`)
    }
    // 默认值可编辑（面板能力保留）
    for (const cls of [
      'batch-import-default-service-port',
      'batch-import-default-management-port',
      'batch-import-default-edge-path',
      'batch-import-default-openresty-path',
    ]) {
      expect(component).toContain(cls)
    }
  })
})
