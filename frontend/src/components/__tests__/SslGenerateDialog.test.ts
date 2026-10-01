import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const mockGenerate = vi.fn()

vi.mock('@/api/ssl', () => ({
  generateSslCertificate: (...args: any[]) => mockGenerate(...args),
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
    const box = wrapper
      .findAll('input[type=checkbox]')
      .find((b: any) => (b.element.parentElement?.textContent || '').includes('启用双向认证'))
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
    await new Promise((r) => setTimeout(r, 50))
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
