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
const GLOBAL_RULE_HISTORY_URL = '/clusters/1/global_rules/9/history'
const PLUGIN_CONFIG_HISTORY_URL = '/clusters/1/plugin_configs/9/history'

const versionsFixture = [
  { id: 1, version: 1, config: { nodes: [{ host: 'a' }] }, created_at: '2026-05-01T10:00:00Z' },
  { id: 2, version: 2, config: { nodes: [{ host: 'b' }] }, created_at: '2026-05-02T10:00:00Z' },
  { id: 3, version: 3, config: { nodes: [{ host: 'c' }] }, created_at: '2026-05-03T10:00:00Z' },
]

function setupApi() {
  mockApiGet.mockImplementation((url: string) => {
    if (url === HISTORY_URL) return Promise.resolve({ data: { items: versionsFixture, current_version: 3 } })
    if (url === PLUGIN_HISTORY_URL) return Promise.resolve({ data: { items: versionsFixture, current_version: 3 } })
    if (url === GLOBAL_RULE_HISTORY_URL)
      return Promise.resolve({ data: { items: versionsFixture, current_version: 3 } })
    if (url === PLUGIN_CONFIG_HISTORY_URL)
      return Promise.resolve({ data: { items: versionsFixture, current_version: 3 } })
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

/** content 可能是 string 或 VNode（children 嵌套）；递归取纯文本供断言 */
function contentText(c: unknown): string {
  if (typeof c === 'string') return c
  if (c == null) return ''
  const children = (c as { children?: unknown }).children
  if (typeof children === 'string') return children
  if (Array.isArray(children)) return children.map((x) => contentText(x)).join('')
  return contentText(children)
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

// ── 版本操作人展示（route-management-ux-batch1 7.4）────────────────────────
// meta 行补「由 {created_by} 发布」（config-version-management spec）；
// created_by 缺失静默降级只显时间，不出现「由 发布」残缺文案。

describe('VersionManagementModal.vue - 版本 meta 显示发布人（route-management-ux-batch1 7.4）', () => {
  it('created_by 非空：meta 行显示「由 {created_by} 发布」，发布时间保留', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === HISTORY_URL)
        return Promise.resolve({
          data: {
            items: [{ id: 1, version: 1, config: { a: 1 }, created_at: '2026-05-01T10:00:00Z', created_by: 'admin' }],
            current_version: 1,
          },
        })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })

    const w = await mountModal()

    const meta = w.find('.version-item-meta')
    expect(meta.exists()).toBe(true)
    expect(meta.text()).toContain('由 admin 发布')
    expect(meta.text()).toContain('2026')
  })

  it('created_by 缺失：只显示时间（静默降级，不出现「由 发布」残缺文案）', async () => {
    const w = await mountModal()

    const metas = w.findAll('.version-item-meta')
    expect(metas.length).toBe(3)
    for (const meta of metas) {
      expect(meta.text()).not.toContain('由')
      expect(meta.text()).not.toContain('发布')
    }
  })
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

describe('VersionManagementModal.vue - 资源名词表与 edge_uuid（global-rule-ux-close-loop 4.1-4.3）', () => {
  it('4.1 global_rule 标题显示「全局规则」', async () => {
    const w = await mountModal({ resourceType: 'global_rule', resourceId: 9, resourceName: 'demo-rule' })
    expect(w.find('.modal-header h2').text()).toBe('版本管理 - 全局规则: demo-rule')
  })

  it('4.1 plugin_config 标题显示「插件组」（不再兜底「插件」）', async () => {
    const w = await mountModal({ resourceType: 'plugin_config', resourceId: 9, resourceName: 'demo-pg' })
    expect(w.find('.modal-header h2').text()).toBe('版本管理 - 插件组: demo-pg')
  })

  it('4.1 既有资源名词不变（回归：upstream→上游）', async () => {
    const w = await mountModal()
    expect(w.find('.modal-header h2').text()).toBe('版本管理 - 上游: demo-upstream')
  })

  it('4.2 标题不再拼接 edge_uuid（传入也不显示，两入口统一不携带）', async () => {
    const w = await mountModal({ edgeUuid: 'edge-abc-123' })
    const title = w.find('.modal-header h2').text()
    expect(title).toBe('版本管理 - 上游: demo-upstream')
    expect(title).not.toContain('edge-abc-123')
  })
})

// ── hideConfigKeys（static-resources-ux-close-loop 4.10）──────────────────────
// 可选 prop（键名数组）：静态资源版本详情 JSON 不含 file_path/route_id/edge_uuid 等内部键，
// DB 保留供回滚；未传时其它域零变化。序列化前浅拷贝剔除。

describe('VersionManagementModal.vue - hideConfigKeys（static-resources-ux-close-loop 4.10）', () => {
  const STATIC_URL = '/clusters/1/static-resources/9/history'
  const SR_CONFIG = {
    uri: '/docs/*',
    auto_index: 'on',
    file_path: '/data/static/docs',
    route_id: 12,
    edge_uuid: 'edge-1',
  }

  function setupStaticApi() {
    mockApiGet.mockImplementation((url: string) => {
      if (url === STATIC_URL)
        return Promise.resolve({
          data: {
            items: [{ id: 1, version: 1, config: JSON.stringify(SR_CONFIG), created_at: '2026-05-01T10:00:00Z' }],
            current_version: 1,
          },
        })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
  }

  it('未传 hideConfigKeys：内部键原样显示（其它域/既有行为零变化）', async () => {
    setupStaticApi()
    const w = await mountModal({ resourceType: 'static_resource' })
    await selectVersion(w, 1)

    const text = w.find('.json-textarea').element as HTMLTextAreaElement
    expect(text.value).toContain('file_path')
    expect(text.value).toContain('route_id')
    expect(text.value).toContain('edge_uuid')
  })

  it('传 hideConfigKeys 键数组：指定键被剔除，其余键保留（浅拷贝，不改本体）', async () => {
    setupStaticApi()
    const w = await mountModal({
      resourceType: 'static_resource',
      hideConfigKeys: ['file_path', 'route_id', 'edge_uuid'],
    })
    await selectVersion(w, 1)

    const text = w.find('.json-textarea').element as HTMLTextAreaElement
    const parsed = JSON.parse(text.value)
    expect(parsed).toEqual({ uri: '/docs/*', auto_index: 'on' })
    expect(text.value).not.toContain('file_path')
    expect(text.value).not.toContain('route_id')
    expect(text.value).not.toContain('edge_uuid')
  })
})

// ── rollback 端点精确路由（version-modal-publish-exit-wiring 2.1-2.2）────────
// history 端点链含 stream_proxy 分支、rollback 链曾漏配——stream_proxy 恢复会落到
// else = routes 的 rollback 端点（拿流代理 id 调路由回滚）。守卫：端点必须含
// /stream-proxies/ 段且 MUST NOT 含 /routes/。
describe('VersionManagementModal.vue - rollback 端点精确路由（version-modal-publish-exit-wiring）', () => {
  const STREAM_HISTORY_URL = '/clusters/1/stream-proxies/9/history'
  const STREAM_ROLLBACK_V2_URL = '/clusters/1/stream-proxies/9/rollback/2'
  const STREAM_DELETE_V2_URL = '/clusters/1/stream-proxies/9/history/2'

  it('stream_proxy 恢复调用自身 rollback 端点（/stream-proxies/ 段，MUST NOT 含 /routes/）', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === STREAM_HISTORY_URL) return Promise.resolve({ data: { items: versionsFixture, current_version: 3 } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    mockApiPost.mockImplementation((url: string) => {
      if (url === STREAM_ROLLBACK_V2_URL) return Promise.resolve({ data: {} })
      return Promise.reject(new Error('unexpected POST: ' + url))
    })
    mockApiDelete.mockImplementation((url: string) => {
      if (url === STREAM_DELETE_V2_URL) return Promise.resolve({ data: {} })
      return Promise.reject(new Error('unexpected DELETE: ' + url))
    })

    const wrapper = await mountModal({ resourceType: 'stream_proxy', resourceName: 'tcp-3306' })
    await selectVersion(wrapper, 2)
    await confirmRestore(wrapper)

    const postCalls = mockApiPost.mock.calls.map((c) => c[0])
    expect(postCalls).toContain(STREAM_ROLLBACK_V2_URL)
    expect(postCalls.every((u: string) => !u.includes('/routes/'))).toBe(true)
  })

  it('dns_proxy 恢复端点分支保持独立（/dns-proxies/ 段，MUST NOT 含 /routes/）', async () => {
    const DNS_HISTORY_URL = '/clusters/1/dns-proxies/9/history'
    const DNS_ROLLBACK_V2_URL = '/clusters/1/dns-proxies/9/rollback/2'
    const DNS_DELETE_V2_URL = '/clusters/1/dns-proxies/9/history/2'
    mockApiGet.mockImplementation((url: string) => {
      if (url === DNS_HISTORY_URL) return Promise.resolve({ data: { items: versionsFixture, current_version: 3 } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    mockApiPost.mockImplementation((url: string) => {
      if (url === DNS_ROLLBACK_V2_URL) return Promise.resolve({ data: {} })
      return Promise.reject(new Error('unexpected POST: ' + url))
    })
    mockApiDelete.mockImplementation((url: string) => {
      if (url === DNS_DELETE_V2_URL) return Promise.resolve({ data: {} })
      return Promise.reject(new Error('unexpected DELETE: ' + url))
    })

    const wrapper = await mountModal({ resourceType: 'dns_proxy', resourceName: 'dns-53' })
    await selectVersion(wrapper, 2)
    await confirmRestore(wrapper)

    const postCalls = mockApiPost.mock.calls.map((c) => c[0])
    expect(postCalls).toContain(DNS_ROLLBACK_V2_URL)
    expect(postCalls.every((u: string) => !u.includes('/routes/'))).toBe(true)
  })
})

// ── 异代快照警示（ssl-version-orphan-purge）────────────────────────────
describe('VersionManagementModal.vue - 异代快照警示（ssl-version-orphan-purge）', () => {
  function setupForeignVersions() {
    mockApiGet.mockImplementation((url: string) => {
      if (url === HISTORY_URL)
        return Promise.resolve({
          data: {
            items: [
              {
                id: 1,
                version: 1,
                config: JSON.stringify({ name: 'gm-server', cert: 'JULY-PEM' }),
                created_at: '2026-07-22T03:16:10Z',
                created_by: 'system',
              },
              {
                id: 2,
                version: 2,
                config: JSON.stringify({ name: 'demo-upstream', cert: 'TODAY-PEM' }),
                created_at: '2026-10-23T01:05:46Z',
                created_by: 'system',
              },
            ],
            current_version: 2,
          },
        })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    mockApiPost.mockImplementation((url: string) => {
      if (url === ROLLBACK_V2_URL) return Promise.resolve({ data: {} })
      return Promise.reject(new Error('unexpected POST: ' + url))
    })
  }

  it('快照 name ≠ 当前资源名：列表项显示「异代」标记（title 含快照名）', async () => {
    setupForeignVersions()
    const w = await mountModal()
    const items = w.findAll('.version-item')
    const v1 = items.find((el) => el.text().includes('v1'))!
    expect(v1.text()).toContain('异代')
    expect(v1.find('.version-foreign-tag').attributes('title')).toContain('gm-server')
    const v2 = items.find((el) => el.text().includes('v2'))!
    expect(v2.find('.version-foreign-tag').exists()).toBe(false)
  })

  it('config 解析失败（非 JSON 字符串）静默不标记、不报错', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === HISTORY_URL)
        return Promise.resolve({
          data: {
            items: [{ id: 1, version: 1, config: 'not-json{{', created_at: '2026-07-22T03:16:10Z' }],
            current_version: null,
          },
        })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    const w = await mountModal()
    expect(w.findAll('.version-foreign-tag')).toHaveLength(0)
  })

  it('异代快照恢复确认弹窗含红色警示（恢复将覆盖名称与内容）', async () => {
    setupForeignVersions()
    const w = await mountModal()
    await selectVersion(w, 1)
    await w.find('.detail-actions .btn-primary').trigger('click')
    const opts = lastOverlayOpts()
    // content 支持 VNode | string（useOverlayModal）；递归取文本断言
    const text = contentText(opts.content)
    expect(text).toContain('gm-server')
    expect(text).toContain('覆盖')
  })
})

describe('VersionManagementModal.vue - stream 恢复范围文案（stream-proxy-ux-review-fixes）', () => {
  it('stream 域恢复确认含「不随回滚变更」范围说明', async () => {
    mockApiGet.mockImplementation((url: string) => {
      if (url === GLOBAL_RULE_HISTORY_URL.replace('global_rules', 'stream-proxies').replace('/9/history', '/9/history'))
        return Promise.resolve({ data: { items: versionsFixture, current_version: 3 } })
      if (url === HISTORY_URL) return Promise.resolve({ data: { items: versionsFixture, current_version: 3 } })
      return Promise.reject(new Error('unexpected GET: ' + url))
    })
    const w = await mountModal({ resourceType: 'stream_proxy' })
    await selectVersion(w, 1)
    await w.find('.detail-actions .btn-primary').trigger('click')
    const opts = lastOverlayOpts()
    const text = contentText(opts.content)
    expect(text).toContain('不随回滚变更')
    expect(text).toContain('健康检查')
  })
})
