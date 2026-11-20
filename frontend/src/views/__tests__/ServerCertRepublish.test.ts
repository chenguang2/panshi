import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'

const mockGet = vi.fn()
vi.mock('@/api', () => ({
  default: { get: (...args: any[]) => mockGet(...args), put: vi.fn() },
}))
vi.mock('ant-design-vue', () => ({
  message: { warning: vi.fn(), success: vi.fn(), error: vi.fn(), info: vi.fn() },
  Modal: { template: '<div v-if="open"><slot /></div>', props: ['open'] },
}))

const stubs = {
  PageHeader: { template: '<div><slot name="actions" /><slot /></div>' },
  SslViewDrawer: true,
  SslFormDrawer: true,
  SslCertDownloadDialog: true,
  SslGenerateDialog: true,
  PublishPreviewModal: true,
  PublishConfirmModal: { template: '<div class="pub-modal" />', props: ['visible', 'preselectedNodeIds'] },
}

const baseCert = (o: Record<string, any> = {}) => ({
  id: 1,
  name: 'srv',
  cluster_id: 1,
  cert_type: 'server',
  sni: 'a.com',
  algorithm: 'rsa',
  expire_days: 100,
  expire_at: '2027-01-01T00:00:00Z',
  current_version: 2,
  published_at: '2026-11-14T10:22:00',
  ...o,
})

describe('ServerCertList · 重发失败节点接线（republish-failed-nodes 补接）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('partial 证书卡片渲染提示条 + 重发失败节点/查看差异双动作；常规发布复位预选', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/clusters')
        return Promise.resolve({ data: { items: [{ id: 1, name: 'prod', display_name: '生产集群' }] } })
      if (url === '/ssl') return Promise.resolve({ data: { items: [baseCert({ last_publish_status: 'partial' })] } })
      if (url.startsWith('/clusters/1/upstreams')) return Promise.resolve({ data: { items: [] } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    const ServerCertList = (await import('../ServerCertList.vue')).default
    const w = mount(ServerCertList, { global: { stubs } })
    await flushPromises()

    const notice = w.find('.lp-notice.alert-error')
    expect(notice.exists()).toBe(true)
    expect(notice.text()).toContain('重发失败节点')
    expect(notice.find('.n-act.ghost').text()).toBe('查看差异')
    // 非证书卡片（正常 partial 之外）不渲染
    w.unmount()
  })

  it('pending 优先：pending_publish=true 的 partial 证书不渲染提示条', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/clusters')
        return Promise.resolve({ data: { items: [{ id: 1, name: 'prod', display_name: '生产集群' }] } })
      if (url === '/ssl')
        return Promise.resolve({
          data: { items: [baseCert({ last_publish_status: 'partial', pending_publish: true })] },
        })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    const ServerCertList = (await import('../ServerCertList.vue')).default
    const w = mount(ServerCertList, { global: { stubs } })
    await flushPromises()
    expect(w.find('.lp-notice.alert-error').exists()).toBe(false)
    w.unmount()
  })
})
