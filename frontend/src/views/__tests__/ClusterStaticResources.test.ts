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
  VersionManagementModal: { template: '<div class="vmm-stub" />' },
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
  it('徽章一致：「已上传 vX」+「未发布」，不再出现「已发布」徽章', async () => {
    const w = await mountTab()
    const tags = w.findAll('.ant-tag').map((t) => t.text())
    expect(tags).toContain('已上传 v2')
    expect(tags).toContain('未发布')
    expect(tags.every((t) => !t.startsWith('已发布'))).toBe(true)
  })

  it('PublishStatusTag 传 timeLabel「最近变更」（铁律 8）', async () => {
    const w = await mountTab()
    expect(w.find('.pst-stub').text()).toBe('最近变更')
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
    expect(viewBtns.length).toBe(2)
    // 无文件卡片置灰
    expect(viewBtns[1].attributes('disabled')).toBeDefined()
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
    expect(publishBtns.length).toBe(2)
    expect(publishBtns[1].attributes('disabled')).toBeDefined()
    expect(publishBtns[1].attributes('title')).toBe('暂未上传 ZIP 文件')
    expect(publishBtns[0].attributes('disabled')).toBeUndefined()
  })

  it('操作按钮为原生按钮体系（btn btn-ghost/btn-secondary，无 a-button 两字插空格）', async () => {
    const w = await mountTab()
    const actions = w.find('.pcc-actions')
    expect(actions.findAll('button .ant-btn').length).toBe(0)
    expect(actions.find('button.btn-secondary').exists()).toBe(true)
    expect(actions.findAll('button.btn-ghost').length).toBeGreaterThanOrEqual(4)
  })
})
