import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import type { Cluster, StaticResource } from '@/types'
import type { VersionModalState } from '@/composables/useClusterPluginConfigs'

const mockApiPost = vi.fn()
vi.mock('@/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { items: [] } }),
    post: (...args: any[]) => mockApiPost(...args),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

function makeDeps() {
  const clusters = ref<Cluster[]>([])
  const versionModal: VersionModalState = {
    type: ref('static_resource'),
    visible: ref(false),
    resourceId: ref<number | null>(null),
    clusterId: ref<number | null>(null),
    resourceName: ref(''),
    edgeUuid: ref(''),
  }
  const openPublishModal = vi.fn().mockResolvedValue([1, 2])
  const loadRoutes = vi.fn().mockResolvedValue(undefined)
  return { clusters, versionModal, openPublishModal, loadRoutes }
}

const cluster = { id: 7, name: 'c7' } as Cluster
const sr = { id: 3, name: 'site.zip', cluster_id: 7 } as StaticResource

async function runPublish(results: unknown[]) {
  mockApiPost.mockResolvedValue({ data: { success: true, current_version: 4, results } })
  const { useClusterStaticResources } = await import('../useClusterStaticResources')
  const { publishStaticResource } = useClusterStaticResources(makeDeps())
  await publishStaticResource(cluster, sr)
  return document.body.textContent || ''
}

describe('静态资源发布 · 经中继 / 直连 路径标注', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('route=relay → 节点行尾标注（经中继）', async () => {
    const text = await runPublish([
      { node: '10.0.0.1:9180', status: 'success', route: 'relay', relay_via: 'http://10.10.1.1:8443' },
    ])
    expect(text).toContain('10.0.0.1:9180: success（经中继）')
  })

  it('route=direct → 节点行尾标注（直连）', async () => {
    const text = await runPublish([{ node: '10.0.0.2:9180', status: 'success', route: 'direct' }])
    expect(text).toContain('10.0.0.2:9180: success（直连）')
  })

  it('无 route 字段 → 不显示任何路径标注（向后兼容）', async () => {
    const text = await runPublish([{ node: '10.0.0.9:9180', status: 'success' }])
    expect(text).toContain('10.0.0.9:9180: success')
    expect(text).not.toContain('（经中继）')
    expect(text).not.toContain('（直连）')
  })

  it('失败节点同样带路径标注（error 前部保留）', async () => {
    const text = await runPublish([{ node: '10.0.0.5:9180', status: 'failed', error: 'timeout', route: 'relay' }])
    expect(text).toContain('10.0.0.5:9180: failed - timeout（经中继）')
  })
})
