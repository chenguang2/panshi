// 节点批量导入共享弹窗（B2b-2）：解析/默认值/预览/提交的唯一实现。
// 覆盖：默认值编辑生效到解析与提交载荷、预览列齐全、解析失败提示、逐条结果展示 + saved、
// 集群必选（页面形态）、关闭清理。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'

const mockApiPost = vi.fn()

vi.mock('@/api', () => ({
  default: {
    post: (...args: any[]) => mockApiPost(...args),
  },
}))

const CLUSTERS = [
  { id: 1, name: 'prod', display_name: '生产集群' },
  { id: 2, name: 'stage', display_name: '预发集群' },
]

/** ClusterSelect 桩：jsdom 下不入 antd 下拉，仅回传所选集群 id（组件内 v-model 语义一致） */
const ClusterSelectStub = defineComponent({
  name: 'ClusterSelect',
  props: ['modelValue', 'clusters'],
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h(
        'select',
        {
          class: 'cluster-select-stub',
          value: props.modelValue,
          onChange: (event: Event) => emit('update:modelValue', Number((event.target as HTMLSelectElement).value)),
        },
        [
          h('option', { value: '' }, '请选择集群'),
          ...[props.clusters as typeof CLUSTERS]
            .flat()
            .map((c) => h('option', { value: c.id }, c.display_name || c.name)),
        ],
      )
  },
})

async function mountModal(props: Record<string, unknown> = {}) {
  const NodeBatchImportModal = (await import('../NodeBatchImportModal.vue')).default
  const wrapper = mount(NodeBatchImportModal, {
    props: {
      visible: true,
      clusterId: 1,
      clusterName: '生产集群',
      lockCluster: true,
      ...props,
    },
    global: { stubs: { ClusterSelect: ClusterSelectStub } },
    attachTo: document.body,
  })
  await nextTick()
  return wrapper
}

async function parse(wrapper: Awaited<ReturnType<typeof mountModal>>, text: string) {
  await wrapper.find('textarea').setValue(text)
  await wrapper.find('.batch-import-parse').trigger('click')
  await nextTick()
}

describe('NodeBatchImportModal（B2b-2 共享批量导入）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiPost.mockResolvedValue({ data: { message: '成功创建 1 条节点', results: [] } })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('默认值可编辑：解析套用到所有行，且随提交载荷发出', async () => {
    const wrapper = await mountModal()

    await wrapper.find('.batch-import-default-service-port').setValue('8080')
    await wrapper.find('.batch-import-default-management-port').setValue('9090')
    await wrapper.find('.batch-import-default-edge-path').setValue('/edge/app')
    await wrapper.find('.batch-import-default-openresty-path').setValue('/opt/nginx')
    await parse(wrapper, '10.0.0.1\n10.0.0.2')

    const firstRow = wrapper.findAll('.batch-import-preview tbody tr')[0]
    expect((firstRow.find('.batch-import-cell-service-port').element as HTMLInputElement).value).toBe('8080')
    expect((firstRow.find('.batch-import-cell-management-port').element as HTMLInputElement).value).toBe('9090')
    expect((firstRow.find('.batch-import-cell-edge-path').element as HTMLInputElement).value).toBe('/edge/app')
    expect((firstRow.find('.batch-import-cell-openresty-path').element as HTMLInputElement).value).toBe('/opt/nginx')
    expect(firstRow.find('.batch-import-cell-status').element).toBeTruthy()

    await wrapper.find('.batch-import-submit').trigger('click')
    await vi.waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(1))
    expect(mockApiPost).toHaveBeenCalledWith('/clusters/1/nodes/batch', {
      nodes: [
        {
          ip: '10.0.0.1',
          service_port: 8080,
          management_port: 9090,
          edge_path: '/edge/app',
          openresty_path: '/opt/nginx',
          status: 1,
        },
        {
          ip: '10.0.0.2',
          service_port: 8080,
          management_port: 9090,
          edge_path: '/edge/app',
          openresty_path: '/opt/nginx',
          status: 1,
        },
      ],
    })
    wrapper.unmount()
  })

  it('预览表列 = 两侧并集（IP/服务端口/管理端口/Edge 路径/Nginx 安装目录/状态/原因）', async () => {
    const wrapper = await mountModal()
    await parse(wrapper, '10.0.0.1')
    const heads = wrapper.findAll('.batch-import-preview th').map((th) => th.text())
    expect(heads).toEqual(['IP', '服务端口', '管理端口', 'Edge 路径', 'Nginx 安装目录', '状态', '原因', ''])
    wrapper.unmount()
  })

  it('解析失败提示：非法 IP 进原因列、有效计数归零、提交禁用', async () => {
    const wrapper = await mountModal()
    await parse(wrapper, '10.0.0.1\n999.1.1.1')

    expect(wrapper.find('.batch-import-count').text()).toContain('已解析 1 / 2 个有效节点')
    const rows = wrapper.findAll('.batch-import-preview tbody tr')
    expect(rows).toHaveLength(2)
    expect(rows[1].find('.batch-import-error-cell').text()).toBe('不是合法的 IP 地址')
    expect(rows[1].classes()).toContain('batch-import-row-invalid')

    // 可编辑字段实时校验（对齐面板 batch1 4.1）：清空 Nginx 安装目录 → 行标红 + 原因 + 计数归零
    await rows[0].find('.batch-import-cell-openresty-path').setValue('')
    await nextTick()
    expect(wrapper.find('.batch-import-count').text()).toContain('已解析 0 / 2 个有效节点')
    expect(rows[0].find('.batch-import-error-cell').text()).toContain('OpenResty 安装路径为空')
    expect((wrapper.find('.batch-import-submit').element as HTMLButtonElement).disabled).toBe(true)

    // 路径恢复 → 行恢复有效，提交可用
    await rows[0].find('.batch-import-cell-openresty-path').setValue('/usr/local/nginx')
    await nextTick()
    expect(wrapper.find('.batch-import-count').text()).toContain('已解析 1 / 2 个有效节点')
    expect((wrapper.find('.batch-import-submit').element as HTMLButtonElement).disabled).toBe(false)
    wrapper.unmount()
  })

  it('提交后逐条展示成功/失败与原因，并 emit saved（不关闭弹窗）', async () => {
    mockApiPost.mockResolvedValue({
      data: {
        message: '成功创建 1 条，失败 1 条',
        results: [
          { ip: '10.0.0.1', status: 'success' },
          { ip: '10.0.0.2', status: 'failed', error: '该集群已存在相同 IP、Edge 路径与服务端口的节点' },
        ],
      },
    })
    const wrapper = await mountModal()
    await parse(wrapper, '10.0.0.1\n10.0.0.2')
    await wrapper.find('.batch-import-submit').trigger('click')

    await vi.waitFor(() => expect(wrapper.find('.batch-import-results').exists()).toBe(true))
    expect(wrapper.find('.batch-import-results-title').text()).toContain('成功创建 1 条，失败 1 条')
    const resultRows = wrapper.findAll('.batch-import-result-table tbody tr')
    expect(resultRows).toHaveLength(2)
    expect(resultRows[0].text()).toContain('成功')
    expect(resultRows[1].text()).toContain('失败')
    expect(resultRows[1].find('.batch-import-error-cell').text()).toContain('已存在相同 IP')

    expect(wrapper.emitted('saved')).toHaveLength(1)
    expect(wrapper.emitted('close')).toBeUndefined()
    // 结果态页脚只留「关闭」，避免重复提交
    expect(wrapper.find('.batch-import-submit').exists()).toBe(false)
    expect(wrapper.find('.batch-import-close').text()).toBe('关闭')
    wrapper.unmount()
  })

  it('页面形态：集群必选（未选集群提交禁用），选择后提交到该集群', async () => {
    const wrapper = await mountModal({ clusterId: null, clusterName: '', lockCluster: false, clusters: CLUSTERS })
    expect(wrapper.find('.cluster-select-stub').exists()).toBe(true)
    await parse(wrapper, '10.5.5.5')
    expect((wrapper.find('.batch-import-submit').element as HTMLButtonElement).disabled).toBe(true)

    await wrapper.find('.cluster-select-stub').setValue('2')
    await nextTick()
    expect((wrapper.find('.batch-import-submit').element as HTMLButtonElement).disabled).toBe(false)

    await wrapper.find('.batch-import-submit').trigger('click')
    await vi.waitFor(() => expect(mockApiPost).toHaveBeenCalledTimes(1))
    expect(mockApiPost.mock.calls[0][0]).toBe('/clusters/2/nodes/batch')
    wrapper.unmount()
  })

  it('关闭清理：关闭后重新打开，文本/预览/结果全部归零', async () => {
    mockApiPost.mockResolvedValue({
      data: { message: '成功创建 1 条节点', results: [{ ip: '10.0.0.1', status: 'success' }] },
    })
    const wrapper = await mountModal()
    await parse(wrapper, '10.0.0.1')
    await wrapper.find('.batch-import-submit').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('.batch-import-results').exists()).toBe(true))

    await wrapper.find('.batch-import-close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)

    await wrapper.setProps({ visible: false })
    await wrapper.setProps({ visible: true })
    await flushPromises()
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('')
    expect(wrapper.find('.batch-import-preview').exists()).toBe(false)
    expect(wrapper.find('.batch-import-results').exists()).toBe(false)
    expect(wrapper.find('.batch-import-submit').exists()).toBe(true)
    wrapper.unmount()
  })

  it('defaults prop 覆盖内置默认值', async () => {
    const wrapper = await mountModal({ defaults: { service_port: 8000, management_port: 9200 } })
    await parse(wrapper, '10.0.0.7')
    const row = wrapper.findAll('.batch-import-preview tbody tr')[0]
    expect((row.find('.batch-import-cell-service-port').element as HTMLInputElement).value).toBe('8000')
    expect((row.find('.batch-import-cell-management-port').element as HTMLInputElement).value).toBe('9200')
    // 未覆盖项沿用内置默认
    expect((row.find('.batch-import-cell-edge-path').element as HTMLInputElement).value).toBe('/edge')
    wrapper.unmount()
  })
})
