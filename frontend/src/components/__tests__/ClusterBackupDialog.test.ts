import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import ClusterBackupDialog from '../ClusterBackupDialog.vue'
import api from '@/api'

vi.mock('@/api', () => ({
  default: {
    post: vi.fn((...args: unknown[]) => mockApiPost(...args)),
    get: vi.fn((...args: unknown[]) => mockApiGet(...args)),
  },
}))
const mockApiPost = vi.fn()
const mockApiGet = vi.fn()

/** 带统计数的集群对象（下载摘要行数据源） */
const countedCluster = {
  id: 4,
  name: 'test',
  display_name: '测试',
  node_count: 4,
  upstream_count: 7,
  route_count: 9,
  plugin_config_count: 1,
  global_rule_count: 1,
  plugin_metadata_count: 2,
  static_resource_count: 2,
}

async function mountDialog(props: Record<string, unknown> = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/central-management', component: { template: '<div />' } },
    ],
  })
  router.push('/')
  await router.isReady()
  const wrapper = mount(ClusterBackupDialog, {
    props: { visible: true, mode: 'import' as const, cluster: null, ...props },
    global: { plugins: [router] },
  })
  return { wrapper, router }
}

function findButton(wrapper: ReturnType<typeof mount>['wrapper'], text: string) {
  return wrapper.findAll('button').find((b) => b.text() === text)
}

async function chooseFile(wrapper: ReturnType<typeof mount>['wrapper'], name = 'backup.json') {
  const fileInput = wrapper.find('input[type="file"]')
  Object.defineProperty(fileInput.element, 'files', {
    value: [new File(['{}'], name, { type: 'application/json' })],
  })
  await fileInput.trigger('change')
}

/** 备份导入前端闭环（cluster-ux-close-loop B5） */
describe('ClusterBackupDialog - 导入完成闭环（B5）', () => {
  async function fillAndImport(wrapper: ReturnType<typeof mount>['wrapper']) {
    mockApiPost.mockResolvedValue({ data: { cluster_id: 3, warnings: [], pending_items: [] } })
    await chooseFile(wrapper)
    const nameInput = wrapper.find('input[type="text"]')
    await nameInput.setValue('demo-restored')
    await findButton(wrapper, '开始导入')!.trigger('click')
    await flushPromises()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockApiPost.mockImplementation((url: string) => {
      throw new Error('unexpected POST: ' + url)
    })
    mockApiGet.mockImplementation((url: string) => {
      throw new Error('unexpected GET: ' + url)
    })
  })

  it('导入成功 → 结果区提供「前往新集群」按钮，点击 emit imported/close 并深链跳转', async () => {
    const { wrapper, router } = await mountDialog()
    await fillAndImport(wrapper)
    const goBtn = findButton(wrapper, '前往新集群')
    expect(goBtn, '结果区应有「前往新集群」按钮').toBeTruthy()
    await goBtn!.trigger('click')
    await flushPromises()
    expect(wrapper.emitted('imported')).toBeTruthy()
    expect(wrapper.emitted('imported')![0]).toEqual([3])
    expect(wrapper.emitted('close')).toBeTruthy()
    expect(router.currentRoute.value.fullPath).toBe('/central-management?editClusterId=3')
  })
})

/** central-management-ux-review-fixes 批 1：术语诚实化 + 名称规则前置校验 */
describe('ClusterBackupDialog - 术语与前置校验（批1）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiPost.mockImplementation((url: string) => {
      throw new Error('unexpected POST: ' + url)
    })
    mockApiGet.mockImplementation((url: string) => {
      throw new Error('unexpected GET: ' + url)
    })
  })

  it('导入模式：标题与主按钮用「导入」表述，全文不出现「恢复」', async () => {
    const { wrapper } = await mountDialog()
    expect(wrapper.text()).toContain('从备份导入新集群')
    expect(findButton(wrapper, '开始导入')).toBeTruthy()
    expect(wrapper.text()).not.toContain('恢复')
  })

  it('导入说明首句前置「不会改动源集群」', async () => {
    const { wrapper } = await mountDialog()
    expect(wrapper.text()).toContain('不会改动源集群')
  })

  it('非法名称：即时提示规则且主按钮禁用（不依赖后端 400）', async () => {
    const { wrapper } = await mountDialog()
    await chooseFile(wrapper)
    const nameInput = wrapper.find('input[type="text"]')
    await nameInput.setValue('Test_A')
    expect(wrapper.text()).toContain('集群名称只能包含小写字母、数字和中划线')
    const btn = findButton(wrapper, '开始导入')!
    expect(btn.attributes('disabled')).toBeDefined()
    // 修正后恢复可提交
    await nameInput.setValue('demo-restored')
    expect(wrapper.text()).not.toContain('集群名称只能包含小写字母、数字和中划线')
    expect(findButton(wrapper, '开始导入')!.attributes('disabled')).toBeUndefined()
  })

  it('名称输入框 placeholder 展示规则', async () => {
    const { wrapper } = await mountDialog()
    expect(wrapper.find('input[type="text"]').attributes('placeholder')).toContain('小写字母')
  })
})

/** central-management-ux-review-fixes 批 2：下载摘要/语义说明 + 上传控件 + 错误建议 */
describe('ClusterBackupDialog - 下载摘要与上传体验（批2）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiPost.mockImplementation((url: string) => {
      throw new Error('unexpected POST: ' + url)
    })
    mockApiGet.mockImplementation((url: string) => {
      throw new Error('unexpected GET: ' + url)
    })
  })

  it('下载模式：展示内容摘要行（统计计数）与 JSON/Excel 语义说明', async () => {
    const { wrapper } = await mountDialog({ mode: 'download', cluster: countedCluster })
    expect(wrapper.text()).toContain('将导出')
    expect(wrapper.text()).toContain('节点 4')
    expect(wrapper.text()).toContain('路由 9')
    expect(wrapper.text()).toContain('JSON 备份')
    expect(wrapper.text()).toContain('Excel')
    expect(wrapper.text()).toContain('人工阅读')
  })

  it('导入模式：中文上传控件呈现已选文件名', async () => {
    const { wrapper } = await mountDialog()
    expect(findButton(wrapper, '选择备份文件')).toBeTruthy()
    expect(wrapper.text()).toContain('未选择文件')
    await chooseFile(wrapper, 'my-backup.json')
    expect(wrapper.text()).toContain('已选：my-backup.json')
    expect(wrapper.text()).not.toContain('未选择文件')
  })

  it('导入失败：错误区逐条呈现原因并附建议动作', async () => {
    mockApiPost.mockRejectedValue({
      response: { data: { detail: { errors: ['目标集群名已存在：demo-restored'] } } },
    })
    const { wrapper } = await mountDialog()
    await chooseFile(wrapper)
    await wrapper.find('input[type="text"]').setValue('demo-restored')
    await findButton(wrapper, '开始导入')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('目标集群名已存在：demo-restored')
    expect(wrapper.text()).toContain('建议')
    expect(wrapper.text()).toContain('重新下载备份')
  })
})
