import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const mockApiGet = vi.fn()
const mockApiDelete = vi.fn()
vi.mock('@/api', () => ({
  default: {
    get: (...a: any[]) => mockApiGet(...a),
    post: vi.fn(),
    put: vi.fn(),
    delete: (...a: any[]) => mockApiDelete(...a),
  },
}))

/**
 * 捕获 showDeleteConfirm 的 onOk（避开确认弹窗交互）与 executeDeleteWithProgress 的入参；
 * 共享流程本体照常真实执行（渲染真实进度弹窗与日志，断言落在用户可见内容上）。
 */
const captured: {
  onOk?: (deleteDb: boolean, deleteEdge: boolean, nodeIds: number[]) => Promise<void>
  deleteOpts?: Record<string, unknown>
} = {}

vi.mock('@/composables/useClusterUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/composables/useClusterUtils')>()
  return {
    ...actual,
    showDeleteConfirm: (opts: {
      onOk: (deleteDb: boolean, deleteEdge: boolean, nodeIds: number[]) => Promise<void>
    }) => {
      captured.onOk = opts.onOk
    },
    executeDeleteWithProgress: async (opts: Record<string, unknown>) => {
      captured.deleteOpts = opts
      await actual.executeDeleteWithProgress(opts)
    },
  }
})

const stubs = {
  PublishConfirmModal: { template: '<div class="mock-pub-modal" />', props: ['visible', 'title', 'clusterId'] },
  VersionManagementModal: { template: '<div class="mock-vm-modal" />' },
  PluginEditorDrawer: { template: '<div class="mock-editor" />' },
  PluginViewDrawer: { template: '<div class="mock-view" />' },
}

async function runDelete(results: unknown[]) {
  captured.onOk = undefined
  // URL 感知 mock：注册删除端点返回 results，其余一律 reject（#43 禁调用顺序链）
  mockApiDelete.mockImplementation((url: string) => {
    if (url === '/clusters/1/plugin-metadata/data_center') {
      return Promise.resolve({ data: { message: '插件元数据已删除', results } })
    }
    return Promise.reject(new Error('unexpected DELETE: ' + url))
  })

  const PluginMetadata = (await import('../PluginMetadata.vue')).default
  const wrapper = mount(PluginMetadata, { props: { clusterId: 1, nodes: [] }, global: { stubs } })
  await flushPromises()

  // AntDV 在单测中未全局注册，<a-button> 渲染为同名自定义元素（图标组件则在组件内导入、正常渲染）
  const delBtn = wrapper.find('a-button[title="删除"]')
  expect(delBtn.exists()).toBe(true)
  await delBtn.trigger('click')

  expect(captured.onOk).toBeTruthy()
  await captured.onOk!(true, true, [1])
  wrapper.unmount()
  return document.body.textContent || ''
}

describe('PluginMetadata.vue 删除走共享 executeDeleteWithProgress（#51③，手写进度弹窗已移除）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    captured.onOk = undefined
    captured.deleteOpts = undefined
    document.body.innerHTML = ''
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/plugin-metadata')) {
        return Promise.resolve({
          data: {
            total: 1,
            items: [
              {
                id: 1,
                cluster_id: 1,
                plugin_name: 'data_center',
                metadata: {},
                current_version: 5,
                created_at: '2025-01-01T00:00:00Z',
                updated_at: '2025-01-02T00:00:00Z',
                published_at: '2025-01-03T08:00:00Z',
                pending_publish: false,
                last_publish_status: null,
              },
            ],
          },
        })
      }
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
  })

  it('确认后经共享流程执行：携带范围/节点入参，并按共享实现日志口径渲染', async () => {
    const text = await runDelete([{ scope: 'edge', node: '10.0.0.1:9180', status: 'success', route: 'relay' }])
    expect(captured.deleteOpts).toBeTruthy()
    expect(captured.deleteOpts).toMatchObject({
      title: '删除插件元数据: data_center',
      apiEndpoint: '/clusters/1/plugin-metadata/data_center',
      deleteDb: true,
      deleteEdge: true,
      nodeIds: [1],
    })
    expect(captured.deleteOpts!.refreshFn).toBeTypeOf('function')
    // 共享实现签名日志（手写实现是「开始删除插件元数据: …」，不会出现）
    expect(text).toContain('开始删除...')
    expect(text).toContain('10.0.0.1:9180: ✅ （经中继）')
    expect(text).toContain('✅ 删除完成!')
    // 删除请求体由共享实现统一构造
    expect(mockApiDelete).toHaveBeenCalledWith(
      '/clusters/1/plugin-metadata/data_center',
      expect.objectContaining({
        data: expect.objectContaining({ delete_db: true, delete_edge: true, node_ids: [1] }),
      }),
    )
  })

  it('edge + route=relay → 节点行尾（经中继）', async () => {
    const text = await runDelete([{ scope: 'edge', node: '10.0.0.1:9180', status: 'success', route: 'relay' }])
    expect(text).toContain('10.0.0.1:9180: ✅ （经中继）')
  })

  it('edge + route=direct → 节点行尾（直连）', async () => {
    const text = await runDelete([{ scope: 'edge', node: '10.0.0.2:9180', status: 'success', route: 'direct' }])
    expect(text).toContain('10.0.0.2:9180: ✅ （直连）')
  })

  it('edge 无 route 字段 → 不显示任何路径标注（向后兼容）', async () => {
    const text = await runDelete([{ scope: 'edge', node: '10.0.0.9:9180', status: 'success' }])
    expect(text).toContain('10.0.0.9:9180: ✅')
    expect(text).not.toContain('（经中继）')
    expect(text).not.toContain('（直连）')
  })

  it('scope=database 条目即使带 route 也不标注', async () => {
    const text = await runDelete([{ scope: 'database', status: 'success', message: '数据库已删除', route: 'relay' }])
    expect(text).toContain('数据库: 数据库已删除')
    expect(text).not.toContain('（经中继）')
    expect(text).not.toContain('（直连）')
  })
})
