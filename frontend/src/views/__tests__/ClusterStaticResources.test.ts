import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// useClusterUtils 轻量替身（避免 ant-design-vue Modal/进度弹窗真实挂载）
vi.mock('@/composables/useClusterUtils', () => ({
  showDeleteConfirm: vi.fn(async () => {}),
  executePublish: vi.fn(async () => {}),
  executeDeleteWithProgress: vi.fn(async () => {}),
  buildDeleteProgressContent: vi.fn(() => null),
  routeLabel: vi.fn((r: unknown) => (r === 'relay' ? '经中继' : r === 'direct' ? '直连' : null)),
  resultStatusLabel: vi.fn((s: string) => s),
}))

const apiGet = vi.fn(async () => ({ data: {} }))
const apiPost = vi.fn(async () => ({ data: {} }))
vi.mock('@/api', () => ({
  default: {
    get: (...a: unknown[]) => apiGet(...(a as [])),
    post: (...a: unknown[]) => apiPost(...(a as [])),
    put: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({ data: {} })),
  },
}))

// AntDV 组件桩（jsdom 下真实组件依赖 matchMedia 等）
const antStubs: Record<string, any> = {
  'a-form': { template: '<form><slot /></form>' },
  'a-form-item': { props: ['label'], template: '<div class="ant-form-item"><slot /></div>' },
  'a-select': {
    props: ['value'],
    emits: ['update:value', 'change'],
    methods: {
      onChange(e: Event) {
        const v = (e.target as HTMLSelectElement).value
        ;(this as any).$emit('update:value', v)
        ;(this as any).$emit('change', v)
      },
    },
    template: '<select :value="value" @change="onChange"><slot /></select>',
  },
  'a-select-option': { props: ['value', 'disabled'], template: '<option :value="value"><slot /></option>' },
  'a-textarea': {
    props: ['value'],
    template: '<textarea :value="value" @input="$emit(\'update:value\', $event.target.value)" />',
  },
  'a-tag': { template: '<span class="ant-tag"><slot /></span>' },
  VersionManagementModal: {
    name: 'VersionManagementModal',
    props: ['canPublish', 'resourceId', 'resourceName'],
    template: '<div class="vmm-stub" />',
  },
  PublishStatusTag: {
    props: ['version', 'publishedAt', 'timeLabel'],
    template: '<span class="pst-stub">{{ timeLabel }}</span>',
  },
}

function mkCluster() {
  return {
    id: 7,
    name: 'c7',
    routes: [
      { id: 11, name: 'legacy', uri: '/x', current_version: 3, plugins: [] },
      { id: 13, name: 'norel', uri: '/r/*', current_version: null, plugins: [{ plugin_name: 'static_resource' }] },
      {
        id: 12,
        name: 'ok',
        uri: '/y/*',
        current_version: 3,
        plugins: [{ plugin_name: 'static_resource' }],
      },
    ],
    static_resources: [
      {
        id: 1,
        name: 'portal',
        url_path: '/y/*',
        current_version: 2,
        file_size: 2048,
        updated_at: '2026-10-20T02:00:00',
        cluster_id: 7,
      },
      {
        id: 3,
        name: 'orphan',
        url_path: '/o/*',
        current_version: 1,
        route_exists: false,
        cluster_id: 7,
      },
      {
        id: 4,
        name: 'partial',
        url_path: '/p/*',
        current_version: 2,
        last_publish_ok: false,
        last_published_at: '2026-10-19T09:00:00',
        last_publish_detail: {
          total: 3,
          success: 1,
          failed: 2,
          failed_nodes: [
            { node: '10.0.0.2', node_id: 22, error: 'boom' },
            { node: '10.0.0.3', node_id: 23, error: 'timeout' },
          ],
        },
        cluster_id: 7,
      },
      {
        id: 2,
        name: 'empty',
        url_path: '/z/*',
        current_version: null,
        file_size: null,
        updated_at: null,
        cluster_id: 7,
      },
    ],
  } as any
}

async function mountTab() {
  const ClusterStaticResources = (await import('../clusters/ClusterStaticResources.vue')).default
  const wrapper = mount(ClusterStaticResources, {
    props: {
      cluster: mkCluster(),
      clusters: [mkCluster()],
      loading: false,
      openPublishModal: async () => [1],
      loadRoutes: async () => {},
    },
    global: { stubs: { ...antStubs, teleport: true } },
  })
  await flushPromises()
  await wrapper.vm.$nextTick()
  return wrapper
}

beforeEach(() => {
  apiGet.mockClear()
  apiPost.mockClear()
  apiGet.mockImplementation(async () => ({ data: {} }))
})

describe('ClusterStaticResources.vue（Tab）· static-resources-ux-close-loop 批 1', () => {
  it('五态徽章（7.2）：待上传/待分发按 last_publish_ok 判定，无版本=待上传', async () => {
    const w = await mountTab()
    // portal：current_version=2、无 last_publish_ok → 待分发；empty：无版本 → 待上传
    expect(w.text()).toContain('待分发')
    expect(w.text()).toContain('待上传')
    // 徽章不再出现「已发布」语义（4.1 失真文案，五态取代）
    const badgeTexts = w.findAll('.srs-tag').map((t) => t.text())
    expect(badgeTexts.every((t) => !t.startsWith('已发布'))).toBe(true)
    // 时间语义拆分（7.2）：版本行「上传时间」
    expect(w.text()).toContain('上传时间:')
  })

  it('PublishStatusTag 已被五态徽章取代（7.2），Tab 不再渲染该组件', async () => {
    const w = await mountTab()
    expect(w.find('.pst-stub').exists()).toBe(false)
  })

  it('失败态（7.3）：徽章显示 N/M 节点失败 + tooltip 列出失败节点，出现「重发失败节点」', async () => {
    const w = await mountTab()
    expect(w.text()).toContain('1/3 节点失败')
    const partialCard = w.findAll('.plugin-config-card').find((c) => c.text().includes('partial'))!
    const tip = partialCard.find('.srs-tag').attributes('title') || ''
    expect(tip).toContain('最近分发')
    expect(tip).toContain('10.0.0.2')
    expect(tip).toContain('boom')
    expect([...partialCard.findAll('button')].some((b) => b.text().includes('重发失败节点'))).toBe(true)
  })

  it('配置异常态（7.3）：操作收敛为删除——其余禁用带指路 tooltip', async () => {
    const w = await mountTab()
    const orphanCard = w.findAll('.plugin-config-card').find((c) => c.text().includes('orphan'))!
    const tip = '关联路由不存在，请删除该资源或重建路由'
    const byText = (t: string) => [...orphanCard.findAll('button')].find((b) => b.text().trim() === t)!
    expect(byText('编辑').attributes('disabled')).toBeDefined()
    expect(byText('上传 ZIP').attributes('disabled')).toBeDefined()
    expect(byText('发布').attributes('disabled')).toBeDefined()
    expect(byText('版本管理').attributes('disabled')).toBeDefined()
    expect(byText('编辑').attributes('title')).toBe(tip)
    expect(byText('删除').attributes('disabled')).toBeUndefined()
    expect([...orphanCard.findAll('button')].some((b) => b.text().includes('重发失败节点'))).toBe(false)
    // 徽章=配置异常
    expect(orphanCard.find('.srs-tag').text()).toBe('配置异常')
  })

  it('卡片体积走 formatFileSize（#26 收敛，无本地 toFixed）', async () => {
    const w = await mountTab()
    expect(w.text()).toContain('大小: 2.0 KB')
  })

  it('路由下拉不合格标注（3.2：legacy 无 /* 结尾）+ 合格路由无后缀', async () => {
    const w = await mountTab()
    // 打开添加弹窗后 editingCluster 就绪，路由 options 才渲染
    await w
      .findAll('button')
      .find((b) => b.text().includes('添加静态资源'))!
      .trigger('click')
    await w.vm.$nextTick()
    expect(w.text()).toContain('legacy (/x)（路径须以 /* 结尾、未挂静态资源插件）')
    expect(w.text()).toContain('norel (/r/*)（未发布）')
    expect(w.text()).toContain('ok (/y/*)')
  })

  it('卡片补「查看 ZIP」：有文件可点并调 zip-contents 渲染表格，无文件置灰', async () => {
    apiGet.mockImplementation(async (url: string) => {
      if (url.includes('/zip-contents')) {
        return {
          data: {
            items: [{ name: 'index.html', file_size: 100, compressed_size: 60, modified: '2026-10-19T10:00:00' }],
            total_count: 1,
            message: '',
          },
        }
      }
      return { data: {} }
    })
    const w = await mountTab()
    const buttons = w.findAll('button')
    const viewBtns = buttons.filter((b) => b.text().includes('查看 ZIP'))
    expect(viewBtns.length).toBe(4)
    // 无文件卡片置灰（orphan/partial/empty）
    expect(viewBtns[1].attributes('disabled')).toBeDefined()
    expect(viewBtns[2].attributes('disabled')).toBeDefined()
    expect(viewBtns[3].attributes('disabled')).toBeDefined()
    // 有文件卡片点击 → 弹窗渲染内容行
    await viewBtns[0].trigger('click')
    await flushPromises()
    await w.vm.$nextTick()
    expect(apiGet).toHaveBeenCalledWith('/clusters/7/static-resources/1/zip-contents')
    expect(w.text()).toContain('index.html')
  })

  it('「发布」未上传时置灰并带 title 提示（与全局页一致）', async () => {
    const w = await mountTab()
    const publishBtns = w.findAll('button').filter((b) => b.text().trim() === '发布')
    expect(publishBtns.length).toBe(4)
    // portal（有文件）可发布
    expect(publishBtns[0].attributes('disabled')).toBeUndefined()
    // orphan：配置异常态禁用 + 指路 tooltip（7.3）
    expect(publishBtns[1].attributes('disabled')).toBeDefined()
    expect(publishBtns[1].attributes('title')).toBe('关联路由不存在，请删除该资源或重建路由')
    // partial / empty：无文件置灰
    expect(publishBtns[2].attributes('disabled')).toBeDefined()
    expect(publishBtns[2].attributes('title')).toBe('暂未上传 ZIP 文件')
    expect(publishBtns[3].attributes('disabled')).toBeDefined()
  })

  it('操作按钮为原生按钮体系（btn btn-ghost/btn-secondary，无 a-button 两字插空格）', async () => {
    const w = await mountTab()
    const actions = w.find('.pcc-actions')
    expect(actions.findAll('button .ant-btn').length).toBe(0)
    expect(actions.find('button.btn-secondary').exists()).toBe(true)
    expect(actions.findAll('button.btn-ghost').length).toBeGreaterThanOrEqual(4)
  })
})

describe('ClusterStaticResources.vue（Tab）· 版本弹窗「立即发布恢复的配置」出口接线', () => {
  async function mountTabWithPublishSpy() {
    const openPublishModal = vi.fn(async () => [1])
    const ClusterStaticResources = (await import('../clusters/ClusterStaticResources.vue')).default
    const wrapper = mount(ClusterStaticResources, {
      props: {
        cluster: mkCluster(),
        clusters: [mkCluster()],
        loading: false,
        openPublishModal,
        loadRoutes: async () => {},
      },
      global: { stubs: { ...antStubs, teleport: true } },
    })
    await flushPromises()
    await wrapper.vm.$nextTick()
    return { wrapper, openPublishModal }
  }

  it('版本弹窗接收 canPublish=true（共享「立即发布恢复的配置」出口）', async () => {
    const { wrapper } = await mountTabWithPublishSpy()
    const vmm = wrapper.findComponent({ name: 'VersionManagementModal' })
    expect(vmm.exists()).toBe(true)
    expect(vmm.props('canPublish')).toBe(true)
  })

  it('publish-requested → 走本 Tab 发布链路（openPublishModal 带资源名与摘要）', async () => {
    const { wrapper, openPublishModal } = await mountTabWithPublishSpy()
    // 点 portal 卡片「版本管理」→ 弹窗 resource 上下文就位
    const card = wrapper.findAll('.plugin-config-card').find((c) => c.text().includes('portal'))!
    const vmBtn = card.findAll('button').find((b) => b.text().trim() === '版本管理')!
    expect(vmBtn).toBeTruthy()
    await vmBtn.trigger('click')
    const vmm = wrapper.findComponent({ name: 'VersionManagementModal' })
    expect(vmm.props('resourceId')).toBe(1)
    vmm.vm.$emit('publish-requested')
    await flushPromises()
    expect(openPublishModal).toHaveBeenCalledTimes(1)
    const [title, clusterId] = openPublishModal.mock.calls[0]
    expect(String(title)).toBe('发布静态资源「portal」')
    expect(clusterId).toBe(7)
  })
})
