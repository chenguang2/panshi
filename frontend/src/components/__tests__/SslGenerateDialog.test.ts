import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const mockGenerate = vi.fn()
const mockApiGet = vi.fn()

vi.mock('@/api/ssl', () => ({
  generateSslCertificate: (...args: any[]) => mockGenerate(...args),
}))

vi.mock('@/api', () => ({
  default: { get: (...args: any[]) => mockApiGet(...args) },
}))

vi.mock('ant-design-vue', () => ({
  message: { warning: vi.fn(), success: vi.fn(), error: vi.fn() },
}))

const stubs = {
  ASelect: { template: '<div><slot /></div>' },
  ASelectOption: { template: '<div><slot /></div>' },
  ATooltip: { template: '<span><slot /></span>' },
}

describe('SslGenerateDialog 生成载荷（真实组件）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGenerate.mockResolvedValue({ data: { server: { name: 'srv' } } })
  })

  // 经 visible watch 走真实打开重置链路（generate_client_certs 复位为 true 等）
  async function mountOpenedDialog() {
    const SslGenerateDialog = (await import('../SslGenerateDialog.vue')).default
    const wrapper = mount(SslGenerateDialog, {
      props: { visible: false, clusters: [] },
      global: { stubs },
    })
    await wrapper.setProps({ visible: true })
    await flushPromises()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  function fillBase(vm: any) {
    vm.form.cluster_id = 1
    vm.form.name = ' srv '
    vm.form.common_name = ' example.com '
    vm.form.ca_cert_id = 5
    vm.form.organization = ' EMBRACE '
    vm.form.organizational_unit = ''
    vm.caCerts = [{ id: 5, name: 'root', cert: 'ca-root-pem', algorithm: 'sm2' }]
    vm.dnsTags.push('api.example.com')
    vm.ipTags.push('10.0.0.5')
  }

  async function toggleMtls(wrapper: any, checked: boolean) {
    // 11.1 重排后 mTLS 开关在「高级选项」折叠区内：不在 DOM 时先展开
    let box = wrapper
      .findAll('input[type=checkbox]')
      .find((b: any) => (b.element.parentElement?.textContent || '').includes('启用双向认证'))
    if (!box) {
      const header = wrapper.findAll('.collapse-header').find((h: any) => h.text().includes('高级选项'))
      await header.trigger('click')
      await flushPromises()
      box = wrapper
        .findAll('input[type=checkbox]')
        .find((b: any) => (b.element.parentElement?.textContent || '').includes('启用双向认证'))
    }
    expect(box, '未找到 mTLS 复选框').toBeDefined()
    await box.setValue(checked)
  }

  async function generate(wrapper: any) {
    await wrapper.find('.modal-footer .btn-primary').trigger('click')
    await flushPromises()
  }

  function capturedPayload() {
    expect(mockGenerate).toHaveBeenCalledTimes(1)
    return mockGenerate.mock.calls[0][1]
  }

  it('sm2 且 mTLS 关闭：mTLS 三字段为 undefined，基础字段按 trim/合并/默认值序列化', async () => {
    const w = await mountOpenedDialog()
    const vm: any = w.vm
    vm.form.algorithm = 'sm2'
    fillBase(vm)
    await w.vm.$nextTick()
    await generate(w)
    expect(mockGenerate.mock.calls[0][0]).toBe(1)
    const p = capturedPayload()
    expect(p.name).toBe('srv')
    expect(p.common_name).toBe('example.com')
    expect(p.organization).toBe('EMBRACE')
    expect(p.organizational_unit).toBeUndefined()
    expect(p.algorithm).toBe('sm2')
    expect(p.cert_type).toBe('server')
    expect(p.ca_cert_id).toBe(5)
    expect(p.generate_client_certs).toBe(true)
    expect(p.client_ca).toBeUndefined()
    expect(p.client_depth).toBeUndefined()
    expect(p.skip_mtls_uri_regex).toBeUndefined()
    // 保留域名合并 + 新增域名 + IP SAN
    expect(p.dns_sans).toContain('edge.local')
    expect(p.dns_sans).toContain('api.example.com')
    expect(p.ip_sans).toEqual(['10.0.0.5'])
  })

  it('sm2 开启 mTLS：client_ca 自动取所选 CA 证书，client_depth 默认 1', async () => {
    const w = await mountOpenedDialog()
    const vm: any = w.vm
    vm.form.algorithm = 'sm2'
    fillBase(vm)
    await w.vm.$nextTick()
    await toggleMtls(w, true)
    expect(vm.form.client_ca).toBe('ca-root-pem')
    await generate(w)
    const p = capturedPayload()
    expect(p.client_ca).toBe('ca-root-pem')
    expect(p.client_depth).toBe(1)
    expect(p.skip_mtls_uri_regex).toBeUndefined()
  })

  it('sm2 开启 mTLS：depth 输入与 skip 正则按真实序列化进载荷', async () => {
    const w = await mountOpenedDialog()
    const vm: any = w.vm
    vm.form.algorithm = 'sm2'
    fillBase(vm)
    await w.vm.$nextTick()
    await toggleMtls(w, true)
    // mTLS 块渲染在有效期输入之前，用作用域选择器定位 depth 输入
    const depthInput = w.find('.collapse-body input[type=number]')
    expect(depthInput.exists()).toBe(true)
    await depthInput.setValue('3')
    await w.find('.mtls-uri-add-row input').setValue('/health')
    await w.find('.mtls-uri-add-row button').trigger('click')
    await generate(w)
    const p = capturedPayload()
    expect(p.client_depth).toBe(3)
    expect(p.skip_mtls_uri_regex).toBe('["/health"]')
  })

  it('client_ca 已手填时不被 CA 自动填充覆盖', async () => {
    const w = await mountOpenedDialog()
    const vm: any = w.vm
    vm.form.algorithm = 'sm2'
    fillBase(vm)
    vm.form.client_ca = 'custom-ca'
    await w.vm.$nextTick()
    await toggleMtls(w, true)
    expect(vm.form.client_ca).toBe('custom-ca')
    await generate(w)
    expect(capturedPayload().client_ca).toBe('custom-ca')
  })

  it('切回 rsa（mtls 开关残留为开）：mTLS 字段与 generate_client_certs 不进载荷', async () => {
    const w = await mountOpenedDialog()
    const vm: any = w.vm
    vm.form.algorithm = 'sm2'
    fillBase(vm)
    await w.vm.$nextTick()
    await toggleMtls(w, true)
    vm.form.algorithm = 'rsa'
    await w.vm.$nextTick()
    await generate(w)
    const p = capturedPayload()
    expect(p.client_ca).toBeUndefined()
    expect(p.client_depth).toBeUndefined()
    expect(p.skip_mtls_uri_regex).toBeUndefined()
    expect(p.generate_client_certs).toBeUndefined()
    // 真实现 ca_cert_id 不分算法传参（|| undefined）
    expect(p.ca_cert_id).toBe(5)
  })
})

describe('SslGenerateDialog reserved SNI (edge.local)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function mountDialog() {
    const SslGenerateDialog = (await import('../SslGenerateDialog.vue')).default
    return mount(SslGenerateDialog, {
      props: { visible: true, clusters: [] },
      global: { stubs },
    })
  }

  it('preloads a locked edge.local chip marked as system-reserved', async () => {
    const wrapper = await mountDialog()
    await wrapper.vm.$nextTick()
    const texts = wrapper.findAll('.sni-tag').map((t) => t.text())
    expect(texts.some((t) => t.includes('edge.local') && t.includes('系统保留'))).toBe(true)
  })

  it('locked chip has no remove button and cannot be removed', async () => {
    const wrapper = await mountDialog()
    await wrapper.vm.$nextTick()
    const chip = wrapper.findAll('.sni-tag').find((t) => t.text().includes('edge.local'))!
    expect(chip.find('.sni-tag-remove').exists()).toBe(false)
    const idx = wrapper.vm.dnsTags.findIndex((t: string) => t === 'edge.local')
    wrapper.vm.removeDnsTag(idx)
    expect(wrapper.vm.dnsTags).toContain('edge.local')
  })

  it('submit payload always includes edge.local', async () => {
    const wrapper = await mountDialog()
    await wrapper.vm.$nextTick()
    wrapper.vm.form.cluster_id = 1
    wrapper.vm.form.name = 'srv'
    wrapper.vm.form.common_name = 'example.com'
    wrapper.vm.form.ca_cert_id = 1
    wrapper.vm.dnsTags.push('example.com')
    await wrapper.vm.handleGenerate()
    await flushPromises()
    const payload = mockGenerate.mock.calls[0][1]
    expect(payload.dns_sans).toContain('edge.local')
    expect(payload.dns_sans).toContain('example.com')
  })

  it('addDnsTag normalizes case and dedupes against the locked chip', async () => {
    const wrapper = await mountDialog()
    await wrapper.vm.$nextTick()
    wrapper.vm.dnsInput = 'EDGE.LOCAL'
    wrapper.vm.addDnsTag()
    expect(wrapper.vm.dnsTags[0]).toBe('edge.local')
    expect(wrapper.vm.dnsTags.filter((t: string) => t.toLowerCase() === 'edge.local')).toHaveLength(1)
  })

  it('addDnsTag normalizes new domains to lowercase', async () => {
    const wrapper = await mountDialog()
    await wrapper.vm.$nextTick()
    wrapper.vm.dnsInput = 'Example.COM'
    wrapper.vm.addDnsTag()
    expect(wrapper.vm.dnsTags).toContain('example.com')
    expect(wrapper.vm.dnsTags).not.toContain('Example.COM')
  })

  it('validate passes with only the locked edge.local and no other SAN', async () => {
    const wrapper = await mountDialog()
    await wrapper.vm.$nextTick()
    wrapper.vm.form.cluster_id = 1
    wrapper.vm.form.name = 'srv'
    wrapper.vm.form.common_name = 'example.com'
    wrapper.vm.form.ca_cert_id = 1
    expect(wrapper.vm.dnsTags).toEqual(['edge.local'])
    expect(wrapper.vm.validate()).toBe(true)
  })
})

describe('SslGenerateDialog CA 提示与校验一致（ssl-ux-review-fixes 组 1）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiGet.mockResolvedValue({ data: { items: [] } })
  })

  async function mountOpened() {
    const SslGenerateDialog = (await import('../SslGenerateDialog.vue')).default
    const wrapper = mount(SslGenerateDialog, {
      props: { visible: false, clusters: [] },
      global: { stubs },
    })
    await wrapper.setProps({ visible: true })
    await flushPromises()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('1.1 未选集群打开：灰色提示，无红色「没有 CA」误报', async () => {
    const w = await mountOpened()
    const body = w.find('.modal-body').text()
    expect(body).toContain('请先选择集群，将列出该集群可用的 CA 根证书')
    expect(body).not.toContain('该集群没有 CA 根证书')
  })

  it('1.2 已选集群且确无 CA：红色提示且文案不含 API 路径', async () => {
    mockApiGet.mockResolvedValue({ data: { items: [] } })
    const w = await mountOpened()
    const vm: any = w.vm
    vm.form.cluster_id = 1
    await vm.loadCaCerts()
    await w.vm.$nextTick()
    const body = w.find('.modal-body').text()
    expect(body).toContain('该集群没有 CA 根证书')
    expect(body).toContain('请先在「CA 根证书」页签创建')
    expect(body).not.toContain('POST /clusters')
  })

  it('1.3 rsa 未选 CA：生成按钮 disabled 且带指引 title', async () => {
    const w = await mountOpened()
    const vm: any = w.vm
    vm.form.cluster_id = 1
    vm.form.name = 'srv'
    vm.form.common_name = 'example.com'
    vm.form.ca_cert_id = null
    await w.vm.$nextTick()
    const btn = w.find('.modal-footer .btn-primary')
    expect(btn.attributes('disabled')).toBeDefined()
    expect((btn.attributes('title') || '').length).toBeGreaterThan(0)
  })

  it('1.5 CA 列表加载失败：显示失败+重试，不误报「没有 CA」，重试可恢复', async () => {
    mockApiGet.mockRejectedValue(new Error('network down'))
    const w = await mountOpened()
    const vm: any = w.vm
    vm.form.cluster_id = 1
    await vm.loadCaCerts()
    await w.vm.$nextTick()
    let body = w.find('.modal-body').text()
    expect(body).toContain('CA 根证书列表加载失败')
    expect(body).toContain('重试')
    expect(body).not.toContain('该集群没有 CA 根证书')
    // 重试恢复后失败态消失
    mockApiGet.mockResolvedValue({
      data: { items: [{ id: 3, name: 'rootca', algorithm: 'rsa', is_ca: true }] },
    })
    await vm.loadCaCerts()
    await w.vm.$nextTick()
    body = w.find('.modal-body').text()
    expect(body).not.toContain('加载失败')
    expect(vm.caCerts).toHaveLength(1)
  })
})

describe('SslGenerateDialog 信息架构重排（ssl-ux-review-fixes 11.1）', () => {
  async function mountOpened(): Promise<any> {
    const SslGenerateDialog = (await import('../SslGenerateDialog.vue')).default
    const w = mount(SslGenerateDialog, {
      props: { visible: false, clusterId: 1, clusterName: 'c1' },
      global: {
        stubs: {
          'a-tooltip': { template: '<span><slot /></span>' },
          'a-select': { template: '<div><slot /></div>' },
          'a-select-option': { template: '<div><slot /></div>' },
        },
      },
    })
    await w.setProps({ visible: true })
    await flushPromises()
    await w.vm.$nextTick()
    return w
  }

  const visibleLabels = (w: any) => w.findAll('.form-label').map((l: any) => l.text().replace(/\*|\s+/g, ''))

  it('字段顺序：签发（算法/集群/CA）→ 主体（名称/CN/O/OU）→ 覆盖范围（SAN/有效期收尾主区）', async () => {
    const w = await mountOpened()
    const labels = visibleLabels(w)
    const idx = (name: string) => labels.findIndex((l: string) => l.includes(name))
    const order = [
      '证书算法',
      '所属集群',
      '签发CA',
      '证书名称',
      '通用名称CN',
      '组织(O)',
      '组织单位(OU)',
      '域名SAN',
      'IPSAN',
      '有效期',
    ]
    const idxs = order.map(idx)
    expect(
      idxs.every((i) => i >= 0),
      '全部标签存在: ' + labels.join('|'),
    ).toBe(true)
    const sorted = [...idxs].sort((a, b) => a - b)
    expect(idxs).toEqual(sorted)
  })

  it('高级选项默认折叠：mTLS 开关与「同时生成客户端证书」不在首屏，展开后可达（SM2）', async () => {
    const w = await mountOpened()
    expect(w.text()).toContain('高级选项')
    const checkboxByText = (t: string) =>
      w.findAll('input[type=checkbox]').find((b: any) => (b.element.parentElement?.textContent || '').includes(t))
    expect(checkboxByText('启用双向认证')).toBeUndefined()
    expect(checkboxByText('同时生成客户端证书')).toBeUndefined()
    // 展开可达
    const header = w.findAll('.collapse-header').find((h: any) => h.text().includes('高级选项'))
    expect(header).toBeDefined()
    await header!.trigger('click')
    await w.vm.$nextTick()
    const vm: any = w.vm
    vm.form.algorithm = 'sm2'
    await w.vm.$nextTick()
    expect(checkboxByText('启用双向认证')).toBeDefined()
    expect(checkboxByText('同时生成客户端证书')).toBeDefined()
  })

  it('有效期即时预览到期日', async () => {
    const w = await mountOpened()
    const vm: any = w.vm
    vm.form.validity_days = 30
    await w.vm.$nextTick()
    expect(w.text()).toMatch(/到期日/)
  })
})
