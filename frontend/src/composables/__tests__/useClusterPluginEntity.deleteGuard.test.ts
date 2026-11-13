import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'

const mockApiGet = vi.fn()
const mockApiDelete = vi.fn()
const mockApiPost = vi.fn()
const mockApiPut = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: (...args: any[]) => mockApiPost(...args),
    put: (...args: any[]) => mockApiPut(...args),
    delete: (...args: any[]) => mockApiDelete(...args),
  },
}))

// 共享删除确认（AppModal→antd Modal）走真实渲染（同 useClusterUtils.test.ts 模式），断言 .ant-modal

import { useClusterPluginEntity, type PluginEntityDeps, type VersionModalState } from '../useClusterPluginEntity'
import type { Cluster } from '@/types'

function makeVersionModal(): VersionModalState {
  return {
    type: ref('plugin_config'),
    visible: ref(false),
    resourceId: ref(null),
    clusterId: ref(null),
    resourceName: ref(''),
    edgeUuid: ref(''),
  }
}

function makeDeps(): PluginEntityDeps {
  return {
    clusters: ref<Cluster[]>([]),
    versionModal: makeVersionModal(),
    availablePlugins: ref([]),
    loadAvailablePlugins: vi.fn().mockResolvedValue(undefined),
    openPublishModal: vi.fn().mockResolvedValue([]),
  }
}

function makeCluster(): Cluster {
  return {
    id: 1,
    name: 'c1',
    status: 1,
    node_count: 0,
    healthy_node_count: 0,
    upstream_count: 0,
    route_count: 0,
    plugin_config_count: 0,
    global_rule_count: 0,
    static_resource_count: 0,
    plugin_metadata_count: 0,
    nodes: [
      { id: 11, cluster_id: 1, ip: '10.0.0.1', service_port: 80, management_port: 9180, status: 1 },
      { id: 12, cluster_id: 1, ip: '10.0.0.2', service_port: 80, management_port: 9180, status: 1 },
    ],
    plugin_configs: [
      {
        id: 5,
        name: 'referenced-pg',
        cluster_id: 1,
        plugins: { cors: {} },
        edge_uuid: 'pg-uuid-5',
        current_version: 2,
        pending_publish: false,
        last_publish_status: null,
        updated_at: null,
      } as any,
    ],
  }
}

describe('useClusterPluginEntity — 删除前置引用检查 deps 包装（决策 B，集群子页）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('被引用：阻断提示无任何删除入口（操作仅「我知道了」），DELETE 未被调用', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters/1/plugin_configs/5/references')
        return Promise.resolve({
          data: {
            name: 'referenced-pg',
            referenced_by: [
              { route_id: 100, route_name: 'route-a' },
              { route_id: 101, route_name: 'route-b' },
            ],
          },
        })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })

    const cluster = makeCluster()
    makeDeps().clusters.value = [cluster]
    const entity = useClusterPluginEntity(
      {
        apiEndpoint: 'plugin_configs',
        displayName: '插件组',
        clusterProp: 'plugin_configs',
        versionType: 'plugin_config',
      },
      makeDeps(),
    )

    await entity.deleteItem(cluster, cluster.plugin_configs![0] as any)

    // 共享删除确认（AppModal/.ant-modal）未出现，阻断提示出现
    expect(document.body.querySelector('.ant-modal')).toBeNull()
    const overlay = Array.from(document.body.querySelectorAll('.modal-overlay')).find((el) =>
      (el.textContent || '').includes('仍被 2 条路由引用'),
    )
    expect(overlay).toBeTruthy()
    expect(overlay!.textContent).toContain('route-a')
    expect(overlay!.textContent).toContain('route-b')

    // 无任何删除入口：操作仅「我知道了」（× 关闭钮除外）
    const actionButtons = Array.from(overlay!.querySelectorAll('button'))
      .filter((b) => !b.className.includes('modal-close'))
      .map((b) => b.textContent || '')
    expect(actionButtons).toEqual(['我知道了'])

    // 点击「我知道了」仅关闭提示：不触发任何删除请求
    const okBtn = Array.from(overlay!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('我知道了'),
    ) as HTMLButtonElement
    okBtn!.click()
    // 穿过 executeDeleteWithProgress 原本会在 DELETE 前等待的 400ms 节流
    await new Promise((r) => setTimeout(r, 500))
    await vi.waitFor(() => expect(document.body.querySelector('.modal-overlay')).toBeNull())
    expect(mockApiDelete).not.toHaveBeenCalled()
  })

  it('无引用：走既有共享删除确认流程不变（行为与接入前一致）', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/clusters/1/plugin_configs/5/references')
        return Promise.resolve({ data: { name: 'referenced-pg', referenced_by: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })

    const cluster = makeCluster()
    const deps = makeDeps()
    deps.clusters.value = [cluster]
    const entity = useClusterPluginEntity(
      {
        apiEndpoint: 'plugin_configs',
        displayName: '插件组',
        clusterProp: 'plugin_configs',
        versionType: 'plugin_config',
      },
      deps,
    )

    await entity.deleteItem(cluster, cluster.plugin_configs![0] as any)

    expect(document.body.querySelectorAll('.modal-overlay').length).toBe(0)
    const modal = document.body.querySelector('.ant-modal')
    expect(modal).not.toBeNull()
    expect(modal!.textContent).toContain('确定要删除插件组 "referenced-pg" 吗？')
    expect(mockApiDelete).not.toHaveBeenCalled()
  })

  it('引用查询失败：兜底走既有共享确认（后端 PLG-07 守卫仍是最终防线）', async () => {
    mockApiGet.mockRejectedValue(new Error('boom'))

    const cluster = makeCluster()
    const deps = makeDeps()
    deps.clusters.value = [cluster]
    const entity = useClusterPluginEntity(
      {
        apiEndpoint: 'plugin_configs',
        displayName: '插件组',
        clusterProp: 'plugin_configs',
        versionType: 'plugin_config',
      },
      deps,
    )

    await entity.deleteItem(cluster, cluster.plugin_configs![0] as any)

    expect(document.body.querySelector('.ant-modal')).not.toBeNull()
    expect(mockApiDelete).not.toHaveBeenCalled()
  })

  it('全局规则链路不接引用检查：直接弹共享确认，不请求 references 端点', async () => {
    const cluster = makeCluster()
    ;(cluster as any).global_rules = [{ id: 7, name: 'gr-1', cluster_id: 1, plugins: {} }] as any
    const deps = makeDeps()
    deps.clusters.value = [cluster]
    const entity = useClusterPluginEntity(
      { apiEndpoint: 'global_rules', displayName: '全局规则', clusterProp: 'global_rules', versionType: 'global_rule' },
      deps,
    )

    await entity.deleteItem(cluster, (cluster as any).global_rules[0])

    expect(mockApiGet).not.toHaveBeenCalled()
    const modal = document.body.querySelector('.ant-modal')
    expect(modal).not.toBeNull()
    expect(modal!.textContent).toContain('确定要删除全局规则 "gr-1" 吗？')
  })
})

describe('useClusterPluginEntity — 发布确认弹窗参数（5.5，资源名 + 新版本号说明）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  function makePublishCluster(item: Record<string, unknown>): Cluster {
    const cluster = makeCluster()
    cluster.plugin_configs = [
      { id: 5, name: 'referenced-pg', cluster_id: 1, plugins: {}, edge_uuid: 'u5', ...item },
    ] as any
    return cluster
  }

  it('插件组发布：openPublishModal 收到「发布插件组: {名称}」+ 可选 currentVersion（已发布 v2 → 提示创建 v3）', async () => {
    const cluster = makePublishCluster({ current_version: 2, published_at: '2026-01-15T10:30:00Z' })
    const deps = makeDeps()
    deps.clusters.value = [cluster]
    const entity = useClusterPluginEntity(
      {
        apiEndpoint: 'plugin_configs',
        displayName: '插件组',
        clusterProp: 'plugin_configs',
        versionType: 'plugin_config',
        publishVersionHint: true,
      },
      deps,
    )

    await entity.publishItem(cluster, cluster.plugin_configs![0] as any)

    expect(deps.openPublishModal).toHaveBeenCalledWith('发布插件组: referenced-pg', 1, { currentVersion: 2 })
  })

  it('未发布插件组：传 currentVersion: null → 弹窗不显示版本说明行', async () => {
    const cluster = makePublishCluster({ current_version: null, published_at: null })
    const deps = makeDeps()
    deps.clusters.value = [cluster]
    const entity = useClusterPluginEntity(
      {
        apiEndpoint: 'plugin_configs',
        displayName: '插件组',
        clusterProp: 'plugin_configs',
        versionType: 'plugin_config',
        publishVersionHint: true,
      },
      deps,
    )

    await entity.publishItem(cluster, cluster.plugin_configs![0] as any)

    expect(deps.openPublishModal).toHaveBeenCalledWith('发布插件组: referenced-pg', 1, { currentVersion: null })
  })
})

describe('handleSubmit 保存后发布引导（publish-guide 批 1：插件组）', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    mockApiPost.mockResolvedValue({ data: { id: 9 } })
    mockApiGet.mockResolvedValue({ data: { items: [] } })
  })

  it('publishGuide=true：保存后不弹 toast、弹「保存成功」引导；立即发布 → openPublishModal（既有发布链路）', async () => {
    const cluster = makeCluster()
    const deps = makeDeps()
    deps.clusters.value = [cluster]
    const entity = useClusterPluginEntity(
      {
        apiEndpoint: 'plugin_configs',
        displayName: '插件组',
        clusterProp: 'plugin_configs',
        versionType: 'plugin_config',
        publishVersionHint: true,
        publishGuide: true,
      },
      deps,
    )

    await entity.showAdd(cluster)
    entity.formData.name = 'pg-guide'
    await entity.handleSubmit()

    // 单通道：引导弹窗挂 body（loadItems 刷新出「待发布」后再弹）
    const overlay = Array.from(document.body.querySelectorAll('.modal-overlay')).find((el) =>
      (el.textContent || '').includes('配置尚未发布，发布后才会推送到 Edge 节点生效。'),
    )
    expect(overlay).toBeTruthy()
    expect(deps.openPublishModal).not.toHaveBeenCalled()

    const okBtn = Array.from(overlay!.querySelectorAll('button')).find(
      (b) => b.textContent === '立即发布',
    ) as HTMLButtonElement
    okBtn!.click()
    await flushPromises()
    expect(deps.openPublishModal).toHaveBeenCalledTimes(1)
    expect(deps.openPublishModal).toHaveBeenCalledWith('发布插件组: pg-guide', 1, { currentVersion: null })
  })

  it('publishGuide 缺省：保存仍弹成功 toast、无引导弹窗（全局规则批 2 前的回归钉）', async () => {
    const { message } = await import('ant-design-vue')
    const successSpy = vi.spyOn(message, 'success').mockImplementation(() => '')
    try {
      const cluster = makeCluster()
      const deps = makeDeps()
      deps.clusters.value = [cluster]
      const entity = useClusterPluginEntity(
        {
          apiEndpoint: 'global_rules',
          displayName: '全局规则',
          clusterProp: 'global_rules',
          versionType: 'global_rule',
        },
        deps,
      )

      await entity.showAdd(cluster)
      entity.formData.name = 'gr-toast'
      await entity.handleSubmit()

      expect(successSpy).toHaveBeenCalledWith(expect.stringContaining('已保存'))
      expect(
        Array.from(document.body.querySelectorAll('.modal-overlay')).some((el) =>
          (el.textContent || '').includes('立即发布'),
        ),
      ).toBe(false)
    } finally {
      successSpy.mockRestore()
    }
  })
})
