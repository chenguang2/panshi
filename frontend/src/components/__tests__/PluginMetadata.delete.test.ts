import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
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

/** 捕获 showDeleteConfirm 的 onOk，直接触发删除流程（避开确认弹窗交互） */
const captured: { onOk?: (deleteDb: boolean, deleteEdge: boolean, nodeIds: number[]) => Promise<void> } = {}
vi.mock('@/composables/useClusterUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/composables/useClusterUtils')>()
  return {
    ...actual,
    showDeleteConfirm: (opts: {
      onOk: (deleteDb: boolean, deleteEdge: boolean, nodeIds: number[]) => Promise<void>
    }) => {
      captured.onOk = opts.onOk
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
  mockApiDelete.mockResolvedValue({ data: { message: '插件元数据已删除', results } })

  const PluginMetadata = (await import('../PluginMetadata.vue')).default
  const wrapper = mount(PluginMetadata, { props: { clusterId: 1, nodes: [] }, global: { stubs } })
  await new Promise((r) => setTimeout(r, 120))

  // AntDV 在单测中未全局注册，<a-button> 渲染为同名自定义元素（图标组件则在组件内导入、正常渲染）
  const delBtn = wrapper.find('a-button[title="删除"]')
  expect(delBtn.exists()).toBe(true)
  await delBtn.trigger('click')

  expect(captured.onOk).toBeTruthy()
  await captured.onOk!(true, true, [1])
  return document.body.textContent || ''
}

describe('PluginMetadata.vue 删除日志 · 经中继 / 直连 标注', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    captured.onOk = undefined
    document.body.innerHTML = ''
    mockApiGet.mockImplementation((url: string) => {
      if (url.includes('/plugin-metadata')) {
        return Promise.resolve({
          data: {
            items: [
              { id: 1, plugin_name: 'data_center', metadata: {}, current_version: 5, version: 5, is_published: true },
            ],
          },
        })
      }
      return Promise.resolve({ data: [] })
    })
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
