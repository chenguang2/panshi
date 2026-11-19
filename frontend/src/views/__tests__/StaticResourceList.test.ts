import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { itGroupFilterSuite } from './helpers/groupFilterSuite'
import ClusterSelect from '@/components/ClusterSelect.vue'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: (...args: any[]) => mockApiPost(...args),
  },
}))

vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
  useRouter: () => ({ push: vi.fn() }),
  useRoute: () => ({ name: 'StaticResourceList', query: {} }),
}))

vi.mock('@/composables/useClusterUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/composables/useClusterUtils')>()
  return {
    ...actual,
    executePublish: vi.fn(),
    executeDeleteWithProgress: vi.fn(),
    showDeleteConfirm: vi.fn(),
  }
})

const stubs = {
  PageHeader: { template: '<div class="page-header"><slot name="actions" /></div>', props: ['title', 'description'] },
}

const MOCK_DATA = {
  total: 2,
  page: 1,
  page_size: 20,
  items: [
    {
      id: 1,
      name: 'static-files',
      url_path: '/static/*',
      cluster_id: 1,
      cluster_name: '生产集群',
      description: '静态文件',
      file_size: 204800,
      current_version: 3,
    },
    {
      id: 2,
      name: 'docs',
      url_path: '/docs/*',
      cluster_id: 1,
      cluster_name: '生产集群',
      description: '文档',
      file_size: null,
      current_version: null,
    },
  ],
}

describe('StaticResourceList.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/static_resources') return Promise.resolve({ data: MOCK_DATA })
      if (url === '/clusters')
        return Promise.resolve({
          data: {
            items: [
              { id: 1, display_name: '生产集群', group_name: '线上' },
              { id: 2, display_name: '预发集群', group_name: '预发' },
            ],
          },
        })
      return Promise.reject(new Error('unknown url'))
    })
  })

  it('renders page header', async () => {
    const StaticResourceList = (await import('../StaticResourceList.vue')).default
    const wrapper = mount(StaticResourceList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.page-header').exists()).toBe(true)
  })

  it('loads resources on mount', async () => {
    const StaticResourceList = (await import('../StaticResourceList.vue')).default
    const wrapper = mount(StaticResourceList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(mockApiGet).toHaveBeenCalledWith('/static_resources', expect.any(Object))
  })

  it('shows view button when resource has file_size', async () => {
    const StaticResourceList = (await import('../StaticResourceList.vue')).default
    const wrapper = mount(StaticResourceList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()

    const buttons = wrapper.findAll('button')
    const viewBtn = buttons.find((b) => b.text().includes('查看'))
    expect(viewBtn).toBeDefined()
    // Resource with file_size should have enabled button
    expect(viewBtn?.attributes('disabled')).toBeUndefined()
  })

  it('disables view button when resource has no file_size', async () => {
    const StaticResourceList = (await import('../StaticResourceList.vue')).default
    const wrapper = mount(StaticResourceList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()

    // 组件绑定：查看按钮 :disabled="!sr.file_size"
    const cards = wrapper.findAll('.sr-card')
    expect(cards.length).toBe(2)
    // docs（file_size=null）的查看按钮必须真实禁用
    const noFileCard = cards.find((c) => c.text().includes('docs'))
    expect(noFileCard).toBeDefined()
    const disabledViewBtn = noFileCard!.findAll('button').find((b) => b.text().includes('查看'))
    expect(disabledViewBtn).toBeDefined()
    expect(disabledViewBtn!.attributes('disabled')).toBeDefined()
    // static-files（file_size 有值）的查看按钮保持可用
    const hasFileCard = cards.find((c) => c.text().includes('static-files'))
    expect(hasFileCard).toBeDefined()
    const enabledViewBtn = hasFileCard!.findAll('button').find((b) => b.text().includes('查看'))
    expect(enabledViewBtn).toBeDefined()
    expect(enabledViewBtn!.attributes('disabled')).toBeUndefined()
  })

  // ── Group Filter Tests ──

  itGroupFilterSuite({
    mountPage: async () => {
      const StaticResourceList = (await import('../StaticResourceList.vue')).default
      const wrapper = mount(StaticResourceList, { global: { stubs } })
      await flushPromises()
      await wrapper.vm.$nextTick()
      return wrapper
    },
    apiGet: mockApiGet,
    listUrl: '/static_resources',
    expectedGroups: ['线上', '预发'],
    groupParamAssert: 'sentinel',
  })

  it('status chips carry the total — count row removed by filter-architecture G (#86)', async () => {
    mockApiGet.mockImplementation((url: string, config?: any) => {
      if (url === '/static_resources') {
        const groupName = config?.params?.group_name
        if (groupName && groupName !== '__all__') {
          return Promise.resolve({
            data: {
              total: 99,
              page: 1,
              page_size: 20,
              items: [
                {
                  id: 1,
                  name: 'filtered-resource',
                  url_path: '/test/*',
                  cluster_id: 1,
                  cluster_name: '生产集群',
                  current_version: 1,
                },
              ],
            },
          })
        }
        return Promise.resolve({ data: MOCK_DATA })
      }
      if (url === '/clusters')
        return Promise.resolve({
          data: {
            items: [
              { id: 1, display_name: '生产集群', group_name: '线上' },
              { id: 2, display_name: '预发集群', group_name: '预发' },
            ],
          },
        })
      return Promise.reject(new Error('unknown url'))
    })

    const StaticResourceList = (await import('../StaticResourceList.vue')).default
    const wrapper = mount(StaticResourceList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()

    // 「共 N 个静态资源」文本行退场：总数只由状态 chips「全部 N」承担（#86）
    expect(wrapper.text()).not.toContain('共 2 个静态资源')
    expect(wrapper.find('.l5-chiprow').exists()).toBe(true)
    const allChip = wrapper.findAll('.f-chip.chip-status').find((c) => c.text().includes('全部'))
    expect(allChip).toBeDefined()
    expect(allChip!.text()).toContain('2')

    // 换分组筛选后重载：chips「全部」跟随服务器过滤后的 total
    const groupSelect = wrapper.findAll('select').find((s) => s.text().includes('全部分组'))
    expect(groupSelect).toBeDefined()
    await groupSelect!.setValue('线上')
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(allChip!.text()).toContain('99')
  })

  it('status chips aggregate the five dispatch states and filter rows', async () => {
    const StaticResourceList = (await import('../StaticResourceList.vue')).default
    const wrapper = mount(StaticResourceList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()

    // static-files: current_version=3, last_publish_ok=null → 待分发；docs: 无版本 → 待上传
    const labels = wrapper.findAll('.f-chip.chip-status').map((c) => c.text())
    expect(labels.some((t) => t.includes('待分发') && t.includes('1'))).toBe(true)
    expect(labels.some((t) => t.includes('待上传') && t.includes('1'))).toBe(true)
    expect(labels.some((t) => t.includes('已分发') && t.includes('0'))).toBe(true)

    // 点「已分发」chip → 卡片列表过滤为空（空态）
    const dispatchedChip = wrapper.findAll('.f-chip.chip-status').find((c) => c.text().includes('已分发'))!
    await dispatchedChip.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('暂无静态资源')
  })
})

describe('StaticResourceList.vue · 版本弹窗「立即发布恢复的配置」出口接线', () => {
  const vmStubs = {
    ...stubs,
    VersionManagementModal: {
      name: 'VersionManagementModal',
      props: ['open', 'canPublish', 'resourceId', 'resourceName'],
      template: '<div class="vmm-stub" />',
    },
    PublishConfirmModal: {
      name: 'PublishConfirmModal',
      template: '<div class="mock-publish-modal" />',
      props: ['visible', 'title', 'clusterId', 'resourceSummary', 'overwriteWarning'],
    },
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/static_resources') return Promise.resolve({ data: MOCK_DATA })
      if (url === '/clusters')
        return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }] } })
      return Promise.resolve({ data: { items: [], total: 0 } })
    })
  })

  async function mountAndOpenVm() {
    const StaticResourceList = (await import('../StaticResourceList.vue')).default
    const wrapper = mount(StaticResourceList, { global: { stubs: vmStubs } })
    await flushPromises()
    const card = wrapper.findAll('.sr-card').find((c) => c.text().includes('static-files'))!
    const vmBtn = card.findAll('button').find((b) => b.text().includes('版本管理'))!
    expect(vmBtn).toBeTruthy()
    await vmBtn.trigger('click')
    return wrapper
  }

  it('版本弹窗接收 canPublish=true（共享「立即发布恢复的配置」出口）', async () => {
    const wrapper = await mountAndOpenVm()
    expect(wrapper.findComponent({ name: 'VersionManagementModal' }).props('canPublish')).toBe(true)
  })

  it('publish-requested → 先关版本弹窗再开发布确认弹窗（不同屏，资源上下文正确）', async () => {
    const wrapper = await mountAndOpenVm()
    const vmm = wrapper.findComponent({ name: 'VersionManagementModal' })
    expect(vmm.props('resourceId')).toBe(1)
    vmm.vm.$emit('publish-requested')
    await wrapper.vm.$nextTick()
    const pm = wrapper.findComponent({ name: 'PublishConfirmModal' })
    expect(pm.props('visible')).toBe(true)
    expect(String(pm.props('title'))).toContain('static-files')
    // 版本弹窗必须先关闭（否则 Teleport 到 body 末尾的版本弹窗恒压住视图内发布框）
    expect(vmm.props('open')).toBe(false)
  })

  it('发布完成后重开版本弹窗（刷新列表 + 复位出口条）', async () => {
    const { executePublish } = await import('@/composables/useClusterUtils')
    vi.mocked(executePublish).mockImplementation(async (opts: any) => {
      await opts?.refreshFn?.()
    })
    const wrapper = await mountAndOpenVm()
    const vmm = wrapper.findComponent({ name: 'VersionManagementModal' })
    vmm.vm.$emit('publish-requested')
    await wrapper.vm.$nextTick()
    wrapper.findComponent({ name: 'PublishConfirmModal' }).vm.$emit('confirm', [1])
    await flushPromises()
    expect(vmm.props('open')).toBe(true)
  })
})

describe('StaticResourceList.vue 发布日志 · 经中继 / 直连 标注', () => {
  const publishStubs = {
    ...stubs,
    PublishConfirmModal: {
      name: 'PublishConfirmModal',
      template: '<div class="mock-publish-modal" />',
      props: ['visible', 'title', 'clusterId', 'resourceSummary', 'overwriteWarning'],
    },
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/static_resources') return Promise.resolve({ data: MOCK_DATA })
      if (url === '/clusters')
        return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }] } })
      return Promise.reject(new Error('unknown url'))
    })
  })

  async function mountAndOpenPublish() {
    const StaticResourceList = (await import('../StaticResourceList.vue')).default
    const wrapper = mount(StaticResourceList, { global: { stubs: publishStubs } })
    await flushPromises()
    const btn = wrapper.findAll('button').find((b) => b.text().trim() === '发布')
    expect(btn).toBeTruthy()
    await btn!.trigger('click')
    wrapper.findComponent({ name: 'PublishConfirmModal' }).vm.$emit('confirm', [1])
    await flushPromises()
    const { executePublish } = await import('@/composables/useClusterUtils')
    return vi.mocked(executePublish).mock.calls.at(-1)![0]
  }

  it('route=relay → 节点行尾（经中继），状态出中文（2.2 resultStatusLabel）', async () => {
    const opts = await mountAndOpenPublish()
    const logs: string[] = []
    opts.handleResult!(
      { results: [{ node: '10.0.0.1:9180', status: 'success', route: 'relay' }] },
      (m: string) => logs.push(m),
      { percent: 0, status: 'active' },
    )
    expect(logs.join('\n')).toContain('10.0.0.1:9180: 成功（经中继）')
  })

  it('route=direct → 节点行尾（直连）', async () => {
    const opts = await mountAndOpenPublish()
    const logs: string[] = []
    opts.handleResult!(
      { results: [{ node: '10.0.0.2:9180', status: 'success', route: 'direct' }] },
      (m: string) => logs.push(m),
      { percent: 0, status: 'active' },
    )
    expect(logs.join('\n')).toContain('10.0.0.2:9180: 成功（直连）')
  })

  it('无 route 字段 → 不显示任何路径标注（向后兼容）', async () => {
    const opts = await mountAndOpenPublish()
    const logs: string[] = []
    opts.handleResult!({ results: [{ node: '10.0.0.9:9180', status: 'success' }] }, (m: string) => logs.push(m), {
      percent: 0,
      status: 'active',
    })
    const text = logs.join('\n')
    expect(text).toContain('10.0.0.9:9180: 成功')
    expect(text).not.toContain('（经中继）')
    expect(text).not.toContain('（直连）')
  })
})

describe('StaticResourceList.vue 添加弹窗 · #204 路由下拉占位守卫', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/static_resources') return Promise.resolve({ data: MOCK_DATA })
      if (url === '/clusters')
        return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }] } })
      if (url === '/clusters/1/routes') return Promise.resolve({ data: [] })
      return Promise.reject(new Error('unknown url'))
    })
  })

  // 约束 #204：原生 select 的模型初值/重置点必须与占位 option value='' 精确匹配——
  // null 会被 select 渲染器判为无匹配 option → selectedIndex=-1 → 下拉框整块空白（非占位文案）
  it('add modal shows route select placeholder (selectedIndex=0, not blank)', async () => {
    const StaticResourceList = (await import('../StaticResourceList.vue')).default
    const wrapper = mount(StaticResourceList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    await wrapper
      .findAll('button')
      .find((b) => b.text().includes('添加静态资源'))!
      .trigger('click')
    await wrapper.vm.$nextTick()
    const overlay = wrapper.findAll('.modal-overlay').find((o) => o.text().includes('所属集群'))!
    // 集群字段已换装 ClusterSelect（a-select 族，非原生 select）——原生 select 仅剩路由下拉
    const selects = overlay.findAll('select')
    expect(selects.length).toBe(1)
    const routeSelect = selects[0]
    expect(routeSelect.element.selectedIndex).toBe(0)
    expect((routeSelect.element.selectedOptions[0]?.textContent || '').trim()).toBe('请选择路由')
    // 重置点守卫：选完集群（ClusterSelect 契约填值）后路由下拉仍回落到占位（watch 重置 route_id=''）
    const clusterComp = overlay.findComponent(ClusterSelect)
    expect(clusterComp.exists()).toBe(true)
    await clusterComp.vm.$emit('update:modelValue', 1)
    await flushPromises()
    await wrapper.vm.$nextTick()
    expect(routeSelect.element.selectedIndex).toBe(0)
    expect((routeSelect.element.selectedOptions[0]?.textContent || '').trim()).toBe('请选择路由')
  })
})

describe('StaticResourceList.vue 上传走共享流（static-resources-ux-close-loop 1.2）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/static_resources') return Promise.resolve({ data: MOCK_DATA })
      if (url === '/clusters')
        return Promise.resolve({ data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }] } })
      if (url === '/clusters/1/routes') return Promise.resolve({ data: [] })
      if (url === '/clusters/1/static-resources') return Promise.resolve({ data: { items: [] } })
      return Promise.reject(new Error('unknown url'))
    })
    mockApiPost.mockResolvedValue({ data: { current_version: 4, file_size: 204800 } })
  })

  // 全局页上传不再裸 api.post：点「上传 ZIP」→ 共享流接管（composable 预检 + 进度弹窗 + 结果行）
  it('clicking 上传 ZIP opens shared stream (progress modal with result lines, not bare api.post at click time)', async () => {
    const StaticResourceList = (await import('../StaticResourceList.vue')).default
    const wrapper = mount(StaticResourceList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()

    // 拦 file input click：模拟用户选择小 zip（≤32MB）
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (
      this: HTMLInputElement,
    ) {
      const file = new File(['PK'], 'demo.zip')
      Object.defineProperty(this, 'files', { value: [file] })
      this.dispatchEvent(new Event('change'))
    })
    try {
      const uploadBtn = wrapper.findAll('button').find((b) => b.text().includes('替换 ZIP'))
      expect(uploadBtn).toBeTruthy()
      await uploadBtn!.trigger('click')
      // 共享流内有 200ms 启动延时（真实计时器），等待其走完再断言
      await new Promise((r) => setTimeout(r, 300))
      await flushPromises()
      await wrapper.vm.$nextTick()

      // 点击时不发裸请求（预检通过后才发 upload）
      expect(mockApiPost).toHaveBeenCalledTimes(1)
      expect(mockApiPost.mock.calls[0][0]).toBe('/clusters/1/static-resources/1/upload')
      // 进度弹窗（共享流）渲染于 body：标题 + 上传结果行（1.3 新文案）
      const bodyText = document.body.textContent || ''
      expect(bodyText).toContain('上传静态资源: static-files')
      expect(bodyText).toContain('已保存到管理端（版本 v4，200.0 KB）')
      expect(bodyText).toContain('发布后才会更新节点文件')
      expect(bodyText).not.toContain('/data/')
    } finally {
      clickSpy.mockRestore()
    }
  })
})

describe('StaticResourceList.vue 批量管理（21.9b：useBatchDelete 统一入口）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockApiGet.mockImplementation((url: string) => {
      if (url === '/static_resources') return Promise.resolve({ data: MOCK_DATA })
      if (url === '/clusters')
        return Promise.resolve({
          data: { items: [{ id: 1, display_name: '生产集群', group_name: '线上' }] },
        })
      if (url === '/clusters/1/nodes')
        return Promise.resolve({ data: { items: [{ id: 7, ip: '10.0.0.1', management_port: 9180, status: 1 }] } })
      return Promise.reject(new Error('unknown url'))
    })
  })

  async function enterBatchMode() {
    const StaticResourceList = (await import('../StaticResourceList.vue')).default
    const wrapper = mount(StaticResourceList, { global: { stubs } })
    await flushPromises()
    await wrapper.vm.$nextTick()
    const batchBtn = wrapper.findAll('button').find((b) => b.text().includes('批量管理'))!
    // 页头按钮序（#88 ⑦）：批量管理在「新建」左侧
    const createIdx = wrapper.findAll('button').findIndex((b) => b.text().includes('添加静态资源'))
    const batchIdx = wrapper.findAll('button').findIndex((b) => b.text().includes('批量管理'))
    expect(batchIdx).toBeLessThan(createIdx)
    await batchBtn.trigger('click')
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('开启后显示批量条（状态行下、网格前），全选/清空联动计数', async () => {
    const wrapper = await enterBatchMode()
    const bar = wrapper.find('.l5-batchbar')
    expect(bar.exists()).toBe(true)
    expect(bar.text()).toContain('已选 0 项')
    expect(bar.classes()).not.toContain('has-sel')

    await bar
      .findAll('button')
      .find((b) => b.text().includes('全选当前筛选结果'))!
      .trigger('click')
    await wrapper.vm.$nextTick()
    expect(bar.text()).toContain('已选 2 项')
    expect(bar.classes()).toContain('has-sel')

    await bar
      .findAll('button')
      .find((b) => b.text().includes('清除选择'))!
      .trigger('click')
    await wrapper.vm.$nextTick()
    expect(bar.text()).toContain('已选 0 项')
  })

  it('批量删除走全局 ids 端点契约（U2）：resourceKey + 节点并集 + 退出批量', async () => {
    const { showDeleteConfirm, executeDeleteWithProgress } = await import('@/composables/useClusterUtils')
    const wrapper = await enterBatchMode()
    const bar = wrapper.find('.l5-batchbar')
    await bar
      .findAll('button')
      .find((b) => b.text().includes('全选当前筛选结果'))!
      .trigger('click')
    await wrapper.vm.$nextTick()
    await bar
      .findAll('button')
      .find((b) => b.text().includes('批量删除'))!
      .trigger('click')
    await flushPromises()

    expect(showDeleteConfirm).toHaveBeenCalledTimes(1)
    const opts = vi.mocked(showDeleteConfirm).mock.calls[0][0] as any
    // 节点并集 + 归属集群标注 + 默认全选在线 + 子集后果（硬约束，禁 noNodeSelection）
    expect(opts.nodes).toEqual([{ id: 7, ip: '10.0.0.1', management_port: 9180, status: 1, clusterName: '生产集群' }])
    expect(opts.defaultSelectOnline).toBe(true)
    expect(opts.subsetConsequence).toContain('未选中的 {n} 个节点')

    await opts.onOk(true, true, [7])
    await flushPromises()
    expect(executeDeleteWithProgress).toHaveBeenCalledTimes(1)
    const del = vi.mocked(executeDeleteWithProgress).mock.calls[0][0] as any
    expect(del.apiEndpoint).toBe('/static_resources')
    expect(del.resourceKey).toEqual({
      field: 'static_resource_ids',
      label: '静态资源',
      nameField: 'resource_name',
      keys: [1, 2],
    })
    expect(del.deleteDb).toBe(true)
    expect(del.deleteEdge).toBe(true)
    expect(del.nodeIds).toEqual([7])
    // 完成后清选 + 退出批量（clearSelectedFn）
    del.clearSelectedFn()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.l5-batchbar').exists()).toBe(false)
  })
})
