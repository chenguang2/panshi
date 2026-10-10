import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import ClusterBackupDialog from '../ClusterBackupDialog.vue'
import api from '@/api'

vi.mock('@/api', () => ({
  default: {
    post: vi.fn((...args: unknown[]) => mockApiPost(...args)),
    get: vi.fn(),
  },
}))
const mockApiPost = vi.fn()

/** 备份导入前端闭环（cluster-ux-close-loop B5） */
describe('ClusterBackupDialog - 导入完成闭环（B5）', () => {
  async function mountDialog() {
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
      props: { visible: true, mode: 'import' as const, cluster: null },
      global: { plugins: [router] },
    })
    return { wrapper, router }
  }

  async function fillAndImport(wrapper: ReturnType<typeof mount>['wrapper']) {
    mockApiPost.mockResolvedValue({ data: { cluster_id: 3, warnings: [], pending_items: [] } })
    const fileInput = wrapper.find('input[type="file"]')
    Object.defineProperty(fileInput.element, 'files', {
      value: [new File(['{}'], 'backup.json', { type: 'application/json' })],
    })
    await fileInput.trigger('change')
    const nameInput = wrapper.find('input[type="text"]')
    await nameInput.setValue('demo-restored')
    await wrapper
      .findAll('button')
      .find((b) => b.text() === '开始恢复')!
      .trigger('click')
    await flushPromises()
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockApiPost.mockImplementation((url: string) => {
      throw new Error('unexpected POST: ' + url)
    })
  })

  it('导入成功 → 结果区提供「前往新集群」按钮，点击 emit imported/close 并深链跳转', async () => {
    const { wrapper, router } = await mountDialog()
    await fillAndImport(wrapper)
    const goBtn = wrapper.findAll('button').find((b) => b.text() === '前往新集群')
    expect(goBtn, '结果区应有「前往新集群」按钮').toBeTruthy()
    await goBtn!.trigger('click')
    await flushPromises()
    expect(wrapper.emitted('imported')).toBeTruthy()
    expect(wrapper.emitted('imported')![0]).toEqual([3])
    expect(wrapper.emitted('close')).toBeTruthy()
    expect(router.currentRoute.value.fullPath).toBe('/central-management?editClusterId=3')
  })
})
