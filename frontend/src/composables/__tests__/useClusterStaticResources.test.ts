import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import type { Cluster, StaticResource } from '@/types'

const mockApiPost = vi.fn()
vi.mock('@/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { items: [] } }),
    post: (...args: unknown[]) => mockApiPost(...args),
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

// 2026-11-22（A 推广清理）：本文件原覆盖发布路径标注 / 编辑换绑（组件表单）/ 面板表单态，
// 那些成员已随面板 Tab 改 scoped 形态而删除（发布链路唯一实现 = StaticResourceList 逐节点循环，
// 其路径标注由 StaticResourceList 的用例覆盖）。此处只保留仍在生产消费的上传流。

// static-zip-limit-config：上限由 features store 的 limits.static_zip_max_mb 决定
// （缺省 32MB）——用例需要 pinia 提供 store 实例。
import { setActivePinia, createPinia } from 'pinia'
import { useFeaturesStore } from '@/stores/features'

function makeDeps() {
  const clusters = ref<Cluster[]>([])
  const afterUpload = vi.fn().mockResolvedValue(undefined)
  return { clusters, afterUpload }
}

const sr = { id: 3, name: 'site.zip', url_path: '/docs/*' } as StaticResource

describe('静态资源上传 · 预检与结果行', () => {
  const textContent = () => document.body.textContent || ''

  async function runUpload(
    size: number,
    postResponse?: { data: Record<string, unknown> },
  ): Promise<{ text: string; afterUpload: ReturnType<typeof vi.fn> }> {
    if (postResponse) mockApiPost.mockResolvedValue(postResponse)
    else mockApiPost.mockRejectedValue(new Error('oversize 预检不应发出请求'))
    const { useClusterStaticResources } = await import('../useClusterStaticResources')
    const deps = makeDeps()
    deps.clusters.value = [{ id: 7, name: 'c7', static_resources: [{ id: 3, name: 'site.zip' }] }] as Cluster[]
    const { uploadStaticResource } = useClusterStaticResources(deps)

    const createSpy = vi.spyOn(document, 'createElement')
    uploadStaticResource(sr)
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
    return { text: textContent(), afterUpload: deps.afterUpload }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    // 每个用例独立 pinia：默认（未配置 limits）→ 上限回退 32MB
    setActivePinia(createPinia())
  })

  it('1.1 超 32MB：即时拒绝（message.error），不发上传请求', async () => {
    const { afterUpload } = await runUpload(33 * 1024 * 1024)
    expect(mockMessageError).toHaveBeenCalledWith('zip 文件过大：上限 32MB')
    expect(mockApiPost).not.toHaveBeenCalled()
    expect(afterUpload).not.toHaveBeenCalled()
  })

  it('1.1b 配置上限 64MB（static-zip-limit-config）：按 store 值判定，文案随之变化', async () => {
    // 65MB → 拒绝（若仍硬编码 32MB 也会拒绝，故同时断言 33MB 放行）
    const features = useFeaturesStore()
    features.limits = { static_zip_max_mb: 64 }
    features.loaded = true

    const rejected = await runUpload(65 * 1024 * 1024)
    expect(mockMessageError).toHaveBeenCalledWith('zip 文件过大：上限 64MB')
    expect(mockApiPost).not.toHaveBeenCalled()
    expect(rejected.afterUpload).not.toHaveBeenCalled()

    // 33MB 在上限 64MB 内 → 发出请求（证明判定用的是 store 值而非 32MB 硬编码）
    const accepted = await runUpload(33 * 1024 * 1024, {
      data: { current_version: 1, file_size: 33 * 1024 * 1024 },
    })
    expect(mockApiPost).toHaveBeenCalled()
    expect(accepted.text).toContain('已保存到管理端（版本 v1')
  })

  it('1.3 上传成功：结果行为「已保存到管理端（版本 vN，大小）」+ 发布时机说明，不暴露 storage_path', async () => {
    const { text, afterUpload } = await runUpload(204800, {
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
    // afterUpload：上传成功后同步刷新页面列表（面板徽标随之更新）
    expect(afterUpload).toHaveBeenCalledTimes(1)
  })
})
