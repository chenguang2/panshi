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

const mockMessageError = vi.fn()
vi.mock('ant-design-vue', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    message: {
      error: (...args: unknown[]) => mockMessageError(...args),
      success: vi.fn(),
      warning: vi.fn(),
    },
  }
})

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

  it('route=relay → 节点行尾标注（经中继），状态出中文（2.2 resultStatusLabel）', async () => {
    const text = await runPublish([
      { node: '10.0.0.1:9180', status: 'success', route: 'relay', relay_via: 'http://10.10.1.1:8443' },
    ])
    expect(text).toContain('10.0.0.1:9180: 成功（经中继）')
  })

  it('route=direct → 节点行尾标注（直连）', async () => {
    const text = await runPublish([{ node: '10.0.0.2:9180', status: 'success', route: 'direct' }])
    expect(text).toContain('10.0.0.2:9180: 成功（直连）')
  })

  it('无 route 字段 → 不显示任何路径标注（向后兼容）', async () => {
    const text = await runPublish([{ node: '10.0.0.9:9180', status: 'success' }])
    expect(text).toContain('10.0.0.9:9180: 成功')
    expect(text).not.toContain('（经中继）')
    expect(text).not.toContain('（直连）')
  })

  it('失败节点同样带路径标注（error 前部保留，状态出中文）', async () => {
    const text = await runPublish([{ node: '10.0.0.5:9180', status: 'failed', error: 'timeout', route: 'relay' }])
    expect(text).toContain('10.0.0.5:9180: 失败 - timeout（经中继）')
  })
})

// ── 发布确认弹窗摘要 / 覆盖预警（static-resources-ux-close-loop 9.1/9.2）──────

describe('静态资源发布 · openPublishModal 第三参透传', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('携带资源摘要（名称/版本/大小/路径）与覆盖预警，不复用 currentVersion 版本提示', async () => {
    mockApiPost.mockResolvedValue({ data: { success: true, current_version: 4, results: [] } })
    const { useClusterStaticResources } = await import('../useClusterStaticResources')
    const deps = makeDeps()
    const { publishStaticResource } = useClusterStaticResources(deps)
    const full = {
      ...sr,
      current_version: 3,
      file_size: 204800,
      url_path: '/docs/*',
    } as StaticResource
    await publishStaticResource(cluster, full)

    expect(deps.openPublishModal).toHaveBeenCalledWith('发布静态资源「site.zip」', 7, {
      resourceSummary: '将把「site.zip」v3（200.0 KB，/docs/*）分发到所选节点',
      overwriteWarning: '发布将覆盖所选节点上的现有静态资源文件',
    })
  })
})

// ── 上传（static-resources-ux-close-loop 1.1 / 1.3）─────────────────────────

describe('静态资源上传 · 预检与结果行', () => {
  const textContent = () => document.body.textContent || ''

  async function runUpload(size: number, postResponse?: { data: Record<string, unknown> }) {
    if (postResponse) mockApiPost.mockResolvedValue(postResponse)
    else mockApiPost.mockRejectedValue(new Error('oversize 预检不应发出请求'))
    const { useClusterStaticResources } = await import('../useClusterStaticResources')
    const deps = makeDeps()
    deps.clusters.value = [{ id: 7, name: 'c7', static_resources: [{ id: 3, name: 'site.zip' }] }] as Cluster[]
    const { uploadStaticResource } = useClusterStaticResources(deps)

    const createSpy = vi.spyOn(document, 'createElement')
    uploadStaticResource({ id: 3, name: 'site.zip', url_path: '/docs/*' } as StaticResource)
    const input = createSpy.mock.results.map((r) => r.value).find((el) => el instanceof HTMLInputElement)
    expect(input).toBeTruthy()

    const file = new File(['x'], 'site.zip', { type: 'application/zip' })
    Object.defineProperty(file, 'size', { value: size })
    Object.defineProperty(input as HTMLInputElement, 'files', { value: [file] })
    input!.dispatchEvent(new Event('change'))
    if (postResponse) {
      // 成功路径：等上传请求发出并渲染结果行（流内含 200ms 人为延迟）
      await vi.waitFor(() => expect(textContent()).toContain('已保存到管理端'))
    } else {
      await vi.waitFor(() => expect(mockMessageError).toHaveBeenCalled())
    }
    createSpy.mockRestore()
    return textContent()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('1.1 超 32MB：即时拒绝（message.error），不发上传请求', async () => {
    await runUpload(33 * 1024 * 1024)
    expect(mockMessageError).toHaveBeenCalledWith('zip 文件过大：上限 32MB')
    expect(mockApiPost).not.toHaveBeenCalled()
  })

  it('1.3 上传成功：结果行为「已保存到管理端（版本 vN，大小）」+ 发布时机说明，不暴露 storage_path', async () => {
    const text = await runUpload(204800, {
      data: { current_version: 3, file_size: 204800, storage_path: '/data/secret/path/site.zip' },
    })
    expect(text).toContain('已保存到管理端（版本 v3，200.0 KB）')
    expect(text).toContain('发布后才会更新节点文件')
    expect(text).not.toContain('/data/secret/path')
    expect(text).not.toContain('管理端文件')
    // 上传请求确实发出（带 FormData）
    expect(mockApiPost).toHaveBeenCalledWith(
      '/clusters/7/static-resources/3/upload',
      expect.any(FormData),
      expect.objectContaining({ headers: expect.any(Object) }),
    )
  })
})
