import { describe, it, expect, vi, beforeEach } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

const mockApiGet = vi.fn()
const mockApiPost = vi.fn()
const mockApiDelete = vi.fn()
vi.mock('@/api', () => ({
  default: {
    get: (...a: unknown[]) => mockApiGet(...a),
    post: (...a: unknown[]) => mockApiPost(...a),
    delete: (...a: unknown[]) => mockApiDelete(...a),
  },
}))

const mockShowOverlayModal = vi.hoisted(() => vi.fn())
vi.mock('@/composables/useOverlayModal', () => ({
  showOverlayModal: (...args: unknown[]) => mockShowOverlayModal(...args),
}))

const mockMessageSuccess = vi.fn()
const mockMessageError = vi.fn()
const mockMessageWarning = vi.fn()
vi.mock('ant-design-vue', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    message: {
      success: (...a: unknown[]) => mockMessageSuccess(...a),
      error: (...a: unknown[]) => mockMessageError(...a),
      warning: (...a: unknown[]) => mockMessageWarning(...a),
    },
  }
})

import VersionManagementModal from '../VersionManagementModal.vue'

// URL 感知 mock（约定 #43）：按路径分发，未命中一律 reject，杜绝顺序链
const HISTORY_URL = '/clusters/1/upstreams/9/history'
const ROLLBACK_V2_URL = '/clusters/1/upstreams/9/rollback/2'
const DELETE_V2_URL = '/clusters/1/upstreams/9/history/2'
const PLUGIN_HISTORY_URL = '/clusters/1/plugin-metadata/demo-plugin/versions'
const PLUGIN_ROLLBACK_V2_URL = '/clusters/1/plugin-metadata/demo-plugin/rollback/2'
const EDGE_ENV_HISTORY_URL = '/clusters/1/edge-env/versions'
const EDGE_ENV_DETAIL_V2_URL = '/clusters/1/edge-env/versions/2'

const versionsFixture = [
  { id: 1, version: 1, config: { nodes: [{ host: 'a' }] }, created_at: '2026-05-01T10:00:00Z' },
  { id: 2, version: 2, config: { nodes: [{ host: 'b' }] }, created_at: '2026-05-02T10:00:00Z' },
  { id: 3, version: 3, config: { nodes: [{ host: 'c' }] }, created_at: '2026-05-03T10:00:00Z' },
]

function setupApi() {
  mockApiGet.mockImplementation((url: string) => {
    if (url === HISTORY_URL) return Promise.resolve({ data: { items: versionsFixture, current_version: 3 } })
    if (url === PLUGIN_HISTORY_URL) return Promise.resolve({ data: { items: versionsFixture, current_version: 3 } })
    if (url === EDGE_ENV_HISTORY_URL) return Promise.resolve({ data: { items: versionsFixture, current_version: 3 } })
    if (url === EDGE_ENV_DETAIL_V2_URL) return Promise.resolve({ data: { config: JSON.stringify({ yaml: 'a: 1\n' }) } })
    return Promise.reject(new Error('unexpected GET: ' + url))
  })
  mockApiPost.mockImplementation((url: string) => {
    if (url === ROLLBACK_V2_URL) return Promise.resolve({ data: {} })
    if (url === PLUGIN_ROLLBACK_V2_URL) return Promise.resolve({ data: {} })
    return Promise.reject(new Error('unexpected POST: ' + url))
  })
  mockApiDelete.mockImplementation((url: string) => {
    if (url === DELETE_V2_URL) return Promise.resolve({ data: {} })
    return Promise.reject(new Error('unexpected DELETE: ' + url))
  })
}

async function mountModal(props: Record<string, unknown> = {}): Promise<VueWrapper> {
  const wrapper = mount(VersionManagementModal, {
    props: {
      open: false,
      resourceType: 'upstream',
      resourceId: 9,
      clusterId: 1,
      resourceName: 'demo-upstream',
      ...props,
    },
    attachTo: document.body,
    global: { stubs: { teleport: true } }, // 组件用 Teleport to body，桩掉才能在 wrapper 内查询
  })
  // open 由 false → true 触发 watch 加载版本历史
  await wrapper.setProps({ open: true })
  await flushPromises()
  return wrapper
}

async function selectVersion(wrapper: VueWrapper, version: number) {
  const nums = wrapper.findAll('.version-number')
  const target = nums.find((el) => el.text() === `v${version}`)
  expect(target, `版本 v${version} 应在列表中`).toBeTruthy()
  await target!.trigger('click')
  await flushPromises()
}

interface OverlayOpts {
  title?: string
  content?: string
  okText?: string
  onOk?: () => void | Promise<void>
  onCancel?: () => void
}

function lastOverlayOpts(): OverlayOpts {
  expect(mockShowOverlayModal).toHaveBeenCalled()
  return mockShowOverlayModal.mock.calls[mockShowOverlayModal.mock.calls.length - 1][0] as OverlayOpts
}

async function confirmRestore(wrapper: VueWrapper) {
  await wrapper.find('.detail-actions .btn-primary').trigger('click')
  const opts = lastOverlayOpts()
  await opts.onOk?.()
  await flushPromises()
}

beforeEach(() => {
  vi.clearAllMocks()
  setupApi()
})

describe('VersionManagementModal.vue - 恢复语义（tasks 1.1-1.4）', () => {
  it('1.1 非当前版本按钮文案为「恢复此版本配置（不会自动发布）」，不再显示「切换到此版本」', async () => {
    const w = await mountModal()
    await selectVersion(w, 2)
    const btn = w.find('.detail-actions .btn-primary')
    expect(btn.text()).toBe('恢复此版本配置（不会自动发布）')
    expect(btn.text()).not.toContain('切换到此版本')
  })

  it('1.2 点击恢复先弹 useOverlayModal 确认，正文说明平台侧恢复与 Edge 不受影响', async () => {
    const w = await mountModal()
    await selectVersion(w, 2)
    await w.find('.detail-actions .btn-primary').trigger('click')
    const opts = lastOverlayOpts()
    expect(opts.content).toContain('将把平台侧配置恢复到 v2，Edge 节点上的现有配置不受影响；如需下发请再执行发布')
  })

  it('1.2 取消确认 → 不发任何回滚请求', async () => {
    const w = await mountModal()
    await selectVersion(w, 2)
    await w.find('.detail-actions .btn-primary').trigger('click')
    lastOverlayOpts().onCancel?.()
    await flushPromises()
    expect(mockApiPost).not.toHaveBeenCalled()
  })

  it('1.2 确认后调用既有回滚 API（URL 语义不变），且先确认后请求', async () => {
    const w = await mountModal()
    await selectVersion(w, 2)
    await w.find('.detail-actions .btn-primary').trigger('click')
    expect(mockApiPost).not.toHaveBeenCalled()
    await lastOverlayOpts().onOk?.()
    await flushPromises()
    expect(mockApiPost).toHaveBeenCalledTimes(1)
    expect(mockApiPost.mock.calls[0][0]).toBe(ROLLBACK_V2_URL)
  })

  it('1.3 恢复成功提示「已恢复到 vX（平台侧）。请发布以推送到 Edge 节点」', async () => {
    const w = await mountModal()
    await selectVersion(w, 2)
    await confirmRestore(w)
    expect(mockMessageSuccess).toHaveBeenCalledWith('已恢复到 v2（平台侧）。请发布以推送到 Edge 节点')
    for (const call of mockMessageSuccess.mock.calls) {
      expect(String(call[0])).not.toContain('已切换到版本')
    }
  })

  it('1.4 canPublish 默认 false：恢复成功后不渲染「立即发布恢复的配置」按钮', async () => {
    const w = await mountModal()
    await selectVersion(w, 2)
    await confirmRestore(w)
    expect(w.text()).not.toContain('立即发布恢复的配置')
    expect(w.emitted('publish-requested')).toBeUndefined()
  })

  it('1.4 canPublish=true：恢复成功后显示出口按钮，点击 emit publish-requested（无参数）', async () => {
    const w = await mountModal({ canPublish: true })
    await selectVersion(w, 2)
    await confirmRestore(w)
    const publishBtn = w.findAll('button').find((b) => b.text() === '立即发布恢复的配置')
    expect(publishBtn, 'canPublish=true 时必须渲染发布出口按钮').toBeTruthy()
    await publishBtn!.trigger('click')
    const emitted = w.emitted('publish-requested')
    expect(emitted).toBeTruthy()
    expect(emitted![0]).toEqual([])
    // 弹窗自身不发发布请求，发布链路由调用方接
    expect(mockApiPost).toHaveBeenCalledTimes(1)
    expect(mockApiPost.mock.calls[0][0]).toBe(ROLLBACK_V2_URL)
  })

  it('1.4 canPublish=true 但未恢复任何版本时不显示出口按钮', async () => {
    const w = await mountModal({ canPublish: true })
    expect(w.text()).not.toContain('立即发布恢复的配置')
  })

  it('回归：plugin_metadata 恢复同样先确认再调既有回滚 API', async () => {
    const w = await mountModal({ resourceType: 'plugin_metadata', resourceId: null, resourceName: 'demo-plugin' })
    await selectVersion(w, 2)
    await w.find('.detail-actions .btn-primary').trigger('click')
    expect(mockApiPost).not.toHaveBeenCalled()
    expect(lastOverlayOpts().content).toContain('将把平台侧配置恢复到 v2')
    await lastOverlayOpts().onOk?.()
    await flushPromises()
    expect(mockApiPost).toHaveBeenCalledTimes(1)
    expect(mockApiPost.mock.calls[0][0]).toBe(PLUGIN_ROLLBACK_V2_URL)
    expect(mockMessageSuccess).toHaveBeenCalledWith('已恢复到 v2（平台侧）。请发布以推送到 Edge 节点')
  })

  it('回归：edge_env 保持「加载到编辑器」，不弹恢复确认', async () => {
    const w = await mountModal({ resourceType: 'edge_env' })
    await selectVersion(w, 2)
    const btn = w.find('.detail-actions .btn-primary')
    expect(btn.text()).toBe('加载到编辑器')
    await btn.trigger('click')
    await flushPromises()
    expect(mockShowOverlayModal).not.toHaveBeenCalled()
    expect(w.emitted('republish')).toBeTruthy()
  })
})

describe('VersionManagementModal.vue - 删除版本记录确认（task 1.5）', () => {
  it('1.5 非当前版本删除按钮文案为「删除此版本记录」', async () => {
    const w = await mountModal()
    await selectVersion(w, 2)
    expect(w.find('.detail-actions .btn-danger').text()).toBe('删除此版本记录')
  })

  it('1.5 点击删除先弹确认「删除后无法再回滚到 v2，确定删除？」，确认后才调删除 API', async () => {
    const w = await mountModal()
    await selectVersion(w, 2)
    await w.find('.detail-actions .btn-danger').trigger('click')
    expect(mockApiDelete).not.toHaveBeenCalled()
    const opts = lastOverlayOpts()
    expect(opts.content).toContain('删除后无法再回滚到 v2，确定删除？')
    await opts.onOk?.()
    await flushPromises()
    expect(mockApiDelete).toHaveBeenCalledTimes(1)
    expect(mockApiDelete.mock.calls[0][0]).toBe(DELETE_V2_URL)
  })

  it('1.5 取消删除 → 不发请求', async () => {
    const w = await mountModal()
    await selectVersion(w, 2)
    await w.find('.detail-actions .btn-danger').trigger('click')
    lastOverlayOpts().onCancel?.()
    await flushPromises()
    expect(mockApiDelete).not.toHaveBeenCalled()
  })

  it('1.5 当前版本保留既有拦截：按钮禁用 + warning「无法删除当前版本」，不弹确认、不调 API', async () => {
    const w = await mountModal()
    // 打开弹窗默认选中当前版本 v3
    const delBtn = w.find('.detail-actions .btn-danger')
    expect(delBtn.attributes('disabled')).toBeDefined()
    // jsdom 不向 disabled 按钮派发 click；临时移除 disabled 以验证 handler 内的防御性拦截
    ;(delBtn.element as HTMLButtonElement).removeAttribute('disabled')
    await delBtn.trigger('click')
    expect(mockShowOverlayModal).not.toHaveBeenCalled()
    expect(mockApiDelete).not.toHaveBeenCalled()
    expect(mockMessageWarning).toHaveBeenCalledWith('无法删除当前版本')
  })
})
