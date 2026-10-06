import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { PAGE_SIZE_TABLE } from '@/constants'

const mockApiGet = vi.fn()
vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

// a-table 桩（仓库惯例：真实 Table 在 jsdom 缺 window.matchMedia 会挂，参考 aTableStub/AuditLog/NodeList）。
// 渲染行 + 分页诊断信息，并提供翻页按钮（$emit('change', …) 对应真实表格分页 change 事件）。
const aTableStub = {
  name: 'ATableStub',
  props: ['dataSource', 'columns', 'rowKey', 'pagination'],
  emits: ['change'],
  template: `
    <div class="ant-table">
      <div v-for="(r, i) in dataSource" :key="i" class="table-row">
        <slot name="bodyCell" :record="r" :column="{ key: 'name' }" :index="i" />
      </div>
      <div v-if="pagination" class="stub-pagination">
        <span class="stub-total">{{ pagination.showTotal ? pagination.showTotal(pagination.total) : '' }}</span>
        <span class="stub-pagesize">{{ pagination.pageSize }}</span>
        <span class="stub-options">{{ (pagination.pageSizeOptions || []).join(',') }}</span>
        <button class="stub-goto-page2" @click="$emit('change', { current: 2, pageSize: pagination.pageSize })">
          去第2页
        </button>
      </div>
    </div>
  `,
}

// a-tabs 桩：直接渲染全部 pane 内容（SSL pane 无需真实点击切换）
const aTabsStub = { template: '<div class="tabs-stub"><slot /></div>' }
const aTabPaneStub = { props: ['tab'], template: '<div class="tab-pane-stub" :data-tab="tab"><slot /></div>' }

const NODE = '192.168.0.14:16620'

// 形状取自真实 GET /edge-client/nodes/{ip}/{port}/ssl 响应（key + value{ id, snis, type, status }）
function sslCerts(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    key: `/apisix/admin/ssl/${i + 1}`,
    value: { id: `cert_${i + 1}`, snis: [`sni${i + 1}.example.com`], type: 'server', status: 1 },
  }))
}

/** 经「手动输入」模式连接节点并完成查询，SSL 响应注入 count 张证书 */
async function mountWithSsl(count: number) {
  mockApiGet.mockImplementation((url: string) => {
    if (url.includes('/ssl')) return Promise.resolve({ data: { ssl_certificates: sslCerts(count), route: 'direct' } })
    if (url.includes('/edge-client/nodes/')) return Promise.resolve({ data: { route: 'direct' } })
    if (url.includes('/clusters')) return Promise.resolve({ data: { items: [] } })
    return Promise.resolve({ data: {} })
  })

  const EdgeClient = (await import('@/views/EdgeClient.vue')).default
  const wrapper = mount(EdgeClient, {
    global: {
      stubs: { 'a-table': aTableStub, 'a-tabs': aTabsStub, 'a-tab-pane': aTabPaneStub, teleport: true },
    },
  })
  await flushPromises()

  await wrapper.findAll('select')[0].setValue('manual')
  const input = wrapper.find('input[placeholder="192.168.100.235:11999"]')
  await input.setValue(NODE)
  await input.trigger('blur')

  const queryBtn = wrapper.findAll('button').find((b) => b.text().trim() === '查询')
  await queryBtn!.trigger('click')
  await flushPromises()
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('EdgeClient.vue - SSL 证书表分页（paginationProps 工厂 + 客户端切片）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('分页走共享工厂：默认每页 PAGE_SIZE_TABLE、showTotal 渲染「共 X 张证书」、选项含 100', async () => {
    const wrapper = await mountWithSsl(25)

    // 其余表均 :pagination="false"，带分页的 stub-pagination 唯一，即 SSL 表
    const pag = wrapper.find('.stub-pagination')
    expect(pag.exists()).toBe(true)
    expect(pag.find('.stub-pagesize').text()).toBe(String(PAGE_SIZE_TABLE))
    expect(pag.find('.stub-total').text()).toBe('共 25 张证书')
    expect(pag.find('.stub-options').text().split(',')).toContain('100')
  })

  it('客户端切片：25 张时首页渲染 20 行，翻页事件写回页码后渲染剩余 5 行', async () => {
    const wrapper = await mountWithSsl(25)

    expect(wrapper.findAll('.table-row')).toHaveLength(20)
    await wrapper.find('.stub-goto-page2').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.table-row')).toHaveLength(5)
  })
})
