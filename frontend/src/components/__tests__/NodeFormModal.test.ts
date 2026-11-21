// 节点单条表单共享组件（B2b-1）：字段集/校验规则/提交入口的唯一实现。
// 覆盖：字段齐全、集群锁定、新增态预选、路径与 IP 校验（含 max255）、编辑回填、提交 emit。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import Antd from 'ant-design-vue'

// jsdom 缺 matchMedia/ResizeObserver：真实 AntDV 表单项依赖（仓库约定 #54 是给 Table 桩，
// 本组件需要真实 a-form 跑 async-validator，故此处补最小 polyfill 而非桩）
if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  })
}
if (!('ResizeObserver' in window)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  ;(window as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub
}

const mockApiPost = vi.fn()
const mockApiPut = vi.fn()

vi.mock('@/api', () => ({
  default: {
    post: (...args: any[]) => mockApiPost(...args),
    put: (...args: any[]) => mockApiPut(...args),
  },
}))

const CLUSTERS = [
  { id: 1, name: 'prod', display_name: '生产集群' },
  { id: 2, name: 'stage', display_name: '预发集群' },
]

const EDIT_NODE = {
  id: 9,
  cluster_id: 2,
  ip: '10.0.0.9',
  service_port: 8080,
  management_port: 9181,
  ssh_port: 2222,
  edge_path: '/opt/edge',
  openresty_path: '/opt/openresty/nginx',
  status: 0,
}

async function mountModal(props: Record<string, unknown> = {}) {
  const NodeFormModal = (await import('../NodeFormModal.vue')).default
  const wrapper = mount(NodeFormModal, {
    props: {
      visible: true,
      clusters: CLUSTERS,
      defaultClusterId: 1,
      ...props,
    },
    global: { plugins: [Antd] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

/** 表单里带 error 的字段文案（antd 的 explain-error） */
function errorTexts(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper.findAll('.ant-form-item-explain-error').map((el) => el.text())
}

async function submit(wrapper: ReturnType<typeof mount>) {
  await wrapper.find('.node-form-submit').trigger('click')
  await flushPromises()
  // async-validator 在微任务里分批结算：并发跑（CPU 争抢）时单次 flush 可能仍拿到旧状态，
  // 追加一个宏任务 + flush 让校验/提交链稳定（否则本文件在并行跑时随机红）。
  await new Promise((r) => setTimeout(r, 0))
  await flushPromises()
  await wrapper.vm.$nextTick()
}

/** async-validator 的错误渲染是异步的：全量并发跑（CPU 争抢）下需轮询等待，避免时序假失败 */
async function submitUntilError(wrapper: ReturnType<typeof mount>, text: string) {
  await submit(wrapper)
  await vi.waitFor(() => expect(errorTexts(wrapper), `未出现校验文案：${text}`).toContain(text), { timeout: 5000 })
}

describe('NodeFormModal 字段与形态', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiPost.mockResolvedValue({ data: {} })
    mockApiPut.mockResolvedValue({ data: {} })
  })

  it('字段齐全：所属集群 + IP + 三个端口 + 两条安装路径 + 状态（两侧字段并集）', async () => {
    const wrapper = await mountModal()
    const labels = wrapper.findAll('.ant-form-item-label').map((el) => el.text().replace(/\s+/g, ''))
    for (const label of [
      '所属集群',
      'IP地址',
      '服务端口',
      '管理端口',
      'SSH端口',
      'OpenResty安装路径',
      'Edge安装路径',
      '状态',
    ]) {
      expect(labels, `缺少字段 ${label}`).toContain(label)
    }
    expect(wrapper.find('.node-form-ip').exists()).toBe(true)
    expect(wrapper.find('.node-form-service-port input').exists()).toBe(true)
    expect(wrapper.find('.node-form-management-port input').exists()).toBe(true)
    expect(wrapper.find('.node-form-ssh-port input').exists()).toBe(true)
    expect(wrapper.find('.node-form-openresty-path').exists()).toBe(true)
    expect(wrapper.find('.node-form-edge-path').exists()).toBe(true)
    // 状态 = 启用/禁用下拉（节点语境措辞）
    expect(wrapper.find('.node-form-status').text()).toBe('启用')
    expect(wrapper.text()).toContain('禁用的节点不进入中继网关流量白名单')
    wrapper.unmount()
  })

  it('lockCluster：所属集群选择器禁用（面板场景）', async () => {
    const wrapper = await mountModal({ lockCluster: true })
    const select = wrapper.find('.ant-select')
    expect(select.classes()).toContain('ant-select-disabled')
    wrapper.unmount()
  })

  it('新增态未锁定时集群可改（节点管理页场景）', async () => {
    const wrapper = await mountModal({ lockCluster: false })
    expect(wrapper.find('.ant-select').classes()).not.toContain('ant-select-disabled')
    wrapper.unmount()
  })

  it('新增态用 defaultClusterId 预选集群', async () => {
    const wrapper = await mountModal({ defaultClusterId: 2 })
    expect(wrapper.find('.ant-select-selection-item').text()).toBe('预发集群')
    wrapper.unmount()
  })

  it('编辑态回填全部字段，且集群禁用', async () => {
    const wrapper = await mountModal({ editingNode: EDIT_NODE })
    expect((wrapper.find('.node-form-ip').element as HTMLInputElement).value).toBe('10.0.0.9')
    expect((wrapper.find('.node-form-service-port input').element as HTMLInputElement).value).toBe('8080')
    expect((wrapper.find('.node-form-management-port input').element as HTMLInputElement).value).toBe('9181')
    expect((wrapper.find('.node-form-ssh-port input').element as HTMLInputElement).value).toBe('2222')
    expect((wrapper.find('.node-form-edge-path').element as HTMLInputElement).value).toBe('/opt/edge')
    expect((wrapper.find('.node-form-openresty-path').element as HTMLInputElement).value).toBe('/opt/openresty/nginx')
    expect(wrapper.find('.ant-select').classes()).toContain('ant-select-disabled')
    expect(wrapper.text()).toContain('编辑节点')
    wrapper.unmount()
  })
})

describe('NodeFormModal 校验规则（取两侧更严格者）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiPost.mockResolvedValue({ data: {} })
  })

  it('IP 非法 → 「IP 地址格式不正确」且不提交', async () => {
    const wrapper = await mountModal()
    await wrapper.find('.node-form-ip').setValue('999.1.1.1')
    await wrapper.find('.node-form-edge-path').setValue('/opt/edge')
    await wrapper.find('.node-form-openresty-path').setValue('/opt/or')
    await submitUntilError(wrapper, 'IP 地址格式不正确')
    expect(mockApiPost).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('路径不以 / 开头 → 「路径必须以 / 开头」', async () => {
    const wrapper = await mountModal()
    await wrapper.find('.node-form-ip').setValue('10.0.0.1')
    await wrapper.find('.node-form-edge-path').setValue('opt/edge')
    await wrapper.find('.node-form-openresty-path').setValue('/opt/or')
    await submitUntilError(wrapper, '路径必须以 / 开头')
    expect(mockApiPost).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('路径末尾带 / → 「路径末尾不能为 /」（两侧统一后的校验）', async () => {
    const wrapper = await mountModal()
    await wrapper.find('.node-form-ip').setValue('10.0.0.1')
    await wrapper.find('.node-form-edge-path').setValue('/opt/edge/')
    await wrapper.find('.node-form-openresty-path').setValue('/opt/or')
    await submitUntilError(wrapper, '路径末尾不能为 /')
    expect(mockApiPost).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('路径超 255 字符 → 「最多255个字符」（面板侧规则，页面侧补上）', async () => {
    const wrapper = await mountModal()
    await wrapper.find('.node-form-ip').setValue('10.0.0.1')
    await wrapper.find('.node-form-edge-path').setValue('/' + 'a'.repeat(255))
    await wrapper.find('.node-form-openresty-path').setValue('/opt/or')
    await submitUntilError(wrapper, '最多255个字符')
    expect(mockApiPost).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('未选集群 → 「请选择所属集群」', async () => {
    const wrapper = await mountModal({ defaultClusterId: null })
    await wrapper.find('.node-form-ip').setValue('10.0.0.1')
    await wrapper.find('.node-form-edge-path').setValue('/opt/edge')
    await wrapper.find('.node-form-openresty-path').setValue('/opt/or')
    await submitUntilError(wrapper, '请选择所属集群')
    expect(mockApiPost).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('NodeFormModal 提交', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiPost.mockResolvedValue({ data: {} })
    mockApiPut.mockResolvedValue({ data: {} })
  })

  it('新增：POST /clusters/{id}/nodes，成功后 emit saved + close', async () => {
    const wrapper = await mountModal({ defaultClusterId: 1 })
    await wrapper.find('.node-form-ip').setValue('10.0.0.1')
    await wrapper.find('.node-form-edge-path').setValue('/opt/edge')
    await wrapper.find('.node-form-openresty-path').setValue('/opt/or')
    await submit(wrapper)
    await vi.waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(1), { timeout: 5000 })
    expect(mockApiPost.mock.calls[0][0]).toBe('/clusters/1/nodes')
    expect(mockApiPost.mock.calls[0][1]).toMatchObject({
      ip: '10.0.0.1',
      service_port: 80,
      management_port: 9180,
      ssh_port: 22,
      edge_path: '/opt/edge',
      openresty_path: '/opt/or',
      status: 1,
    })
    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('编辑：PUT /clusters/{cluster_id}/nodes/{id}', async () => {
    const wrapper = await mountModal({ editingNode: EDIT_NODE })
    await submit(wrapper)
    await vi.waitFor(() => expect(mockApiPut).toHaveBeenCalledTimes(1), { timeout: 5000 })
    expect(mockApiPut.mock.calls[0][0]).toBe('/clusters/2/nodes/9')
    expect(mockApiPost).not.toHaveBeenCalled()
    expect(wrapper.emitted('saved')).toHaveLength(1)
    wrapper.unmount()
  })

  it('复制：标题「复制节点」、IP 清空、其余预填，提交仍走 POST', async () => {
    const wrapper = await mountModal({ editingNode: EDIT_NODE, copyingNode: true, defaultClusterId: null })
    expect(wrapper.text()).toContain('复制节点')
    expect((wrapper.find('.node-form-ip').element as HTMLInputElement).value).toBe('')
    expect((wrapper.find('.node-form-service-port input').element as HTMLInputElement).value).toBe('8080')
    await wrapper.find('.node-form-ip').setValue('10.0.0.10')
    await submit(wrapper)
    expect(mockApiPost).toHaveBeenCalledTimes(1)
    expect(mockApiPost.mock.calls[0][0]).toBe('/clusters/2/nodes')
    wrapper.unmount()
  })
})
