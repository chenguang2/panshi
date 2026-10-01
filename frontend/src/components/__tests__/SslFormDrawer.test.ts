import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const mockCreate = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/api/ssl', () => ({
  createSslCertificate: (...args: any[]) => mockCreate(...args),
  updateSslCertificate: (...args: any[]) => mockUpdate(...args),
}))

vi.mock('ant-design-vue', () => ({
  message: { warning: vi.fn(), success: vi.fn(), error: vi.fn() },
}))

const stubs = {
  ASelect: { template: '<div><slot /></div>' },
  ASelectOption: { template: '<div><slot /></div>' },
}

describe('SslFormDrawer mTLS submit payload (real component)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockResolvedValue({ data: { id: 1 } })
    mockUpdate.mockResolvedValue({ data: { id: 1 } })
  })

  async function mountDrawer(editingCert: any = null) {
    const SslFormDrawer = (await import('../SslFormDrawer.vue')).default
    const wrapper = mount(SslFormDrawer, {
      props: { visible: false, clusters: [], editingCert },
      global: { stubs },
    })
    await wrapper.setProps({ visible: true })
    await flushPromises()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  // 创建模式必填项（name/cluster/sni/cert/key + 国密签名证书对）
  async function fillCreateForm(wrapper: any, overrides: Record<string, unknown> = {}) {
    const vm: any = wrapper.vm
    vm.form.name = 'mtls-cert'
    vm.form.cluster_id = 1
    vm.sniTags.push('api.example.com')
    vm.form.cert = '---CERT---'
    vm.form.key = '---KEY---'
    vm.form.gm = true
    vm.form.sign_cert = '---SIGN---'
    vm.form.sign_key = '---SIGNKEY---'
    Object.assign(vm.form, overrides)
    await wrapper.vm.$nextTick()
  }

  async function toggleCheckbox(wrapper: any, labelText: string, checked: boolean) {
    const box = wrapper
      .findAll('input[type=checkbox]')
      .find((b: any) => (b.element.parentElement?.textContent || '').includes(labelText))
    expect(box, `未找到复选框：${labelText}`).toBeDefined()
    await box.setValue(checked)
  }

  async function submit(wrapper: any) {
    await wrapper.find('.modal-footer .btn-primary').trigger('click')
    await flushPromises()
  }

  it('mTLS 开关关闭时，表单里已有的 mTLS 字段不进提交载荷', async () => {
    const w = await mountDrawer()
    const vm: any = w.vm
    await fillCreateForm(w, { client_ca: 'ca-pem', client_depth: 2 })
    vm.mtlsSkipTags.push('/health')
    await submit(w)
    expect(mockCreate).toHaveBeenCalledTimes(1)
    const payload = mockCreate.mock.calls[0][1]
    expect(payload).not.toHaveProperty('client_ca')
    expect(payload).not.toHaveProperty('client_depth')
    expect(payload).not.toHaveProperty('skip_mtls_uri_regex')
  })

  it('mTLS 开启（gm+server）：depth 输入转 number、client_ca、skip 正则 JSON 数组进载荷', async () => {
    const w = await mountDrawer()
    await fillCreateForm(w)
    await toggleCheckbox(w, '启用双向认证', true)
    const depthInput = w.find('input[type=number]')
    expect(depthInput.exists()).toBe(true)
    await depthInput.setValue('2')
    await w.find('.collapse-body textarea').setValue('client-ca-pem')
    await w.find('.mtls-uri-add-row input').setValue('/health')
    await w.find('.mtls-uri-add-row button').trigger('click')
    await submit(w)
    const payload = mockCreate.mock.calls[0][1]
    expect(payload.client_ca).toBe('client-ca-pem')
    expect(payload.client_depth).toBe(2)
    expect(payload.skip_mtls_uri_regex).toBe('["/health"]')
  })

  it('开启 mTLS 后取消国密：mTLS 字段被载荷守卫挡下', async () => {
    const w = await mountDrawer()
    await fillCreateForm(w)
    await toggleCheckbox(w, '启用双向认证', true)
    await toggleCheckbox(w, '国密双证书', false)
    await submit(w)
    const payload = mockCreate.mock.calls[0][1]
    expect(payload).not.toHaveProperty('client_ca')
    expect(payload).not.toHaveProperty('client_depth')
    expect(payload).not.toHaveProperty('skip_mtls_uri_regex')
  })

  it('开启 mTLS 后切为 client 证书类型：mTLS 字段被载荷守卫挡下', async () => {
    const w = await mountDrawer()
    await fillCreateForm(w)
    await toggleCheckbox(w, '启用双向认证', true)
    const vm: any = w.vm
    vm.form.cert_type = 'client'
    await submit(w)
    const payload = mockCreate.mock.calls[0][1]
    expect(payload).not.toHaveProperty('client_ca')
    expect(payload).not.toHaveProperty('client_depth')
    expect(payload).not.toHaveProperty('skip_mtls_uri_regex')
  })

  it('mTLS 开启但字段全空：client_depth 空串被清理，空键不进载荷', async () => {
    const w = await mountDrawer()
    await fillCreateForm(w)
    await toggleCheckbox(w, '启用双向认证', true)
    await submit(w)
    const payload = mockCreate.mock.calls[0][1]
    expect(payload).not.toHaveProperty('client_ca')
    expect(payload).not.toHaveProperty('client_depth')
    expect(payload).not.toHaveProperty('skip_mtls_uri_regex')
  })

  it('client_depth=0 是合法值：不被空值清理吞掉', async () => {
    const w = await mountDrawer()
    await fillCreateForm(w)
    await toggleCheckbox(w, '启用双向认证', true)
    await w.find('.collapse-body textarea').setValue('ca-pem')
    await w.find('input[type=number]').setValue('0')
    await submit(w)
    const payload = mockCreate.mock.calls[0][1]
    expect(payload.client_depth).toBe(0)
    expect(payload.client_ca).toBe('ca-pem')
  })

  it('client_depth 为数字字符串（回填来源）时按 Number 序列化', async () => {
    const w = await mountDrawer()
    const vm: any = w.vm
    await fillCreateForm(w, { client_ca: 'ca-pem', client_depth: '2' })
    await toggleCheckbox(w, '启用双向认证', true)
    await submit(w)
    const payload = mockCreate.mock.calls[0][1]
    expect(payload.client_depth).toBe(2)
  })

  describe('edit mode backfill (real component)', () => {
    it('mTLS 证书回填开关与字段，保存载荷含 mTLS 字段且不带 sni', async () => {
      const cert = {
        id: 3,
        name: 'mtls-cert',
        cluster_id: 1,
        cert_type: 'server',
        sni: 'api.example.com',
        cert: 'crt',
        key: 'key',
        gm: true,
        sign_cert: 'sc',
        sign_key: 'sk',
        client_ca: 'mtls-ca',
        client_depth: 3,
        skip_mtls_uri_regex: '["/health"]',
      }
      const w = await mountDrawer(cert)
      const vm: any = w.vm
      expect(vm.mtlsEnabled).toBe(true)
      expect(vm.form.client_depth).toBe(3)
      expect(vm.mtlsSkipTags).toEqual(['/health'])
      await submit(w)
      expect(mockUpdate).toHaveBeenCalledTimes(1)
      expect(mockUpdate.mock.calls[0][0]).toBe(1)
      expect(mockUpdate.mock.calls[0][1]).toBe(3)
      const payload = mockUpdate.mock.calls[0][2]
      expect(payload.client_ca).toBe('mtls-ca')
      expect(payload.client_depth).toBe(3)
      expect(payload.skip_mtls_uri_regex).toBe('["/health"]')
      // 编辑模式 SNI 只读，不提交（后端 exclude_unset 不改动它）
      expect(payload).not.toHaveProperty('sni')
    })

    it('无 mTLS 字段的证书回填后开关关闭，保存载荷不含 mTLS 键', async () => {
      const cert = {
        id: 4,
        name: 'plain-cert',
        cluster_id: 1,
        cert_type: 'server',
        sni: 'api.example.com',
        cert: 'crt',
        key: 'key',
        gm: true,
        sign_cert: 'sc',
        sign_key: 'sk',
      }
      const w = await mountDrawer(cert)
      const vm: any = w.vm
      expect(vm.mtlsEnabled).toBe(false)
      await submit(w)
      const payload = mockUpdate.mock.calls[0][2]
      expect(payload).not.toHaveProperty('client_ca')
      expect(payload).not.toHaveProperty('client_depth')
      expect(payload).not.toHaveProperty('skip_mtls_uri_regex')
    })
  })
})

describe('SslFormDrawer reserved SNI (edge.local)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  async function mountDrawer(editingCert: any = null) {
    const SslFormDrawer = (await import('../SslFormDrawer.vue')).default
    const wrapper = mount(SslFormDrawer, {
      props: { visible: false, clusters: [], editingCert },
      global: { stubs },
    })
    await wrapper.setProps({ visible: true })
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('edit mode marks edge.local as system-reserved (case-insensitive)', async () => {
    const cert = {
      id: 1,
      name: 'srv',
      cluster_id: 1,
      cert_type: 'server',
      sni: 'EDGE.LOCAL,api.example.com',
      cert: 'crt',
      key: 'key',
    }
    const wrapper = await mountDrawer(cert)
    const tags = wrapper.findAll('.sni-tag')
    const edgeTag = tags.find((t) => t.text().includes('EDGE.LOCAL'))!
    expect(edgeTag.text()).toContain('系统保留')
    const apiTag = tags.find((t) => t.text().includes('api.example.com'))!
    expect(apiTag.text()).not.toContain('系统保留')
  })

  it('edit mode marks lowercase edge.local as system-reserved', async () => {
    const cert = {
      id: 1,
      name: 'srv',
      cluster_id: 1,
      cert_type: 'server',
      sni: 'edge.local,api.example.com',
      cert: 'crt',
      key: 'key',
    }
    const wrapper = await mountDrawer(cert)
    const edgeTag = wrapper.findAll('.sni-tag').find((t) => t.text().includes('edge.local'))!
    expect(edgeTag.text()).toContain('系统保留')
  })

  it('import mode shows hint for server certs', async () => {
    const wrapper = await mountDrawer(null)
    expect(wrapper.text()).toContain('edge.local')
    expect(wrapper.text()).toContain('管理链路')
  })

  it('import mode hides hint for client certs', async () => {
    const wrapper = await mountDrawer(null)
    wrapper.vm.form.cert_type = 'client'
    await wrapper.vm.$nextTick()
    const hint = wrapper.findAll('.form-hint').find((h) => h.text().includes('管理链路'))
    expect(hint).toBeUndefined()
  })
})
