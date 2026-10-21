import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { message } from 'ant-design-vue'

const mockCreate = vi.fn()
const mockUpdate = vi.fn()
const mockPreview = vi.fn()

vi.mock('@/api/ssl', () => ({
  createSslCertificate: (...args: any[]) => mockCreate(...args),
  updateSslCertificate: (...args: any[]) => mockUpdate(...args),
  previewSslPem: (...args: any[]) => mockPreview(...args),
}))

vi.mock('ant-design-vue', () => ({
  message: { warning: vi.fn(), success: vi.fn(), error: vi.fn() },
}))

const stubs = {
  ASelect: { template: '<div><slot /></div>' },
  ASelectOption: { template: '<div><slot /></div>' },
}

const PEM_STUBS = {
  ASelect: { template: '<div><slot /></div>' },
  ASelectOption: { template: '<div><slot /></div>' },
}

async function mountWithVisibility(editingCert: any = null) {
  const SslFormDrawer = (await import('../SslFormDrawer.vue')).default
  const wrapper = mount(SslFormDrawer, {
    props: { visible: false, clusters: [], editingCert },
    global: { stubs: PEM_STUBS },
  })
  await wrapper.setProps({ visible: true })
  await flushPromises()
  await wrapper.vm.$nextTick()
  return wrapper
}

async function clickSubmit(wrapper: any) {
  await wrapper.find('.modal-footer .btn-primary').trigger('click')
  await flushPromises()
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

describe('SslFormDrawer 编辑保存提示（ssl-ux-review-fixes 组 2.4）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdate.mockResolvedValue({ data: { id: 9 } })
  })

  async function mountEdit(cert: Record<string, any>) {
    const SslFormDrawer = (await import('../SslFormDrawer.vue')).default
    const wrapper = mount(SslFormDrawer, {
      props: { visible: false, clusters: [], editingCert: cert },
      global: { stubs },
    })
    await wrapper.setProps({ visible: true })
    await flushPromises()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  async function submit(wrapper: any) {
    await wrapper.find('.modal-footer .btn-primary').trigger('click')
    await flushPromises()
  }

  function publishedCert(overrides: Record<string, any> = {}) {
    return {
      id: 9,
      name: 'srv',
      cluster_id: 1,
      sni: 'a.example.com',
      cert: 'C',
      private_key: 'K',
      cert_type: 'server',
      algorithm: 'rsa',
      gm: false,
      current_version: 2,
      ...overrides,
    }
  }

  it('2.4 编辑已发布后又被修改的证书（pending_publish）：提示平台侧语义', async () => {
    const w = await mountEdit(publishedCert({ pending_publish: true }))
    await submit(w)
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    const toasts = vi.mocked(message.success).mock.calls.map((c) => String(c[0]))
    expect(toasts.some((t) => t.includes('重新发布后 Edge 生效'))).toBe(true)
  })

  it('2.4 编辑未发布证书：保持「已更新」', async () => {
    const w = await mountEdit(publishedCert())
    await submit(w)
    expect(vi.mocked(message.success)).toHaveBeenCalledWith('已更新')
  })
})

describe('SslFormDrawer 表单细节反馈（ssl-ux-review-fixes 组 5）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockResolvedValue({ data: { id: 1 } })
    mockUpdate.mockResolvedValue({ data: { id: 1 } })
  })

  async function mountCreate() {
    const SslFormDrawer = (await import('../SslFormDrawer.vue')).default
    const wrapper = mount(SslFormDrawer, {
      props: { visible: false, clusters: [], editingCert: null },
      global: { stubs },
    })
    await wrapper.setProps({ visible: true })
    await flushPromises()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  async function selectFile(wrapper: any, inputEl: any, name: string, content: string) {
    const file = new File([content], name, { type: 'text/plain' })
    Object.defineProperty(inputEl.element, 'files', { value: [file] })
    await inputEl.trigger('change')
  }

  it('5.1 选择证书文件后显示「已读取 {文件名}」并可一键切粘贴模式查看内容', async () => {
    const w = await mountCreate()
    const fileInputs = w.findAll('input[type=file]')
    await selectFile(w, fileInputs[0], 'server.pem', '---CERT-PEM---')
    await selectFile(w, fileInputs[1], 'server.key', '---KEY-PEM---')
    await vi.waitFor(() => {
      expect(w.text()).toContain('已读取 server.pem')
      expect(w.text()).toContain('已读取 server.key')
    })
    const viewBtn = w.findAll('button').find((b: any) => b.text().includes('查看内容'))
    expect(viewBtn, '应有「查看内容」一键切换').toBeDefined()
    await viewBtn.trigger('click')
    const vm: any = w.vm
    expect(vm.form.cert).toContain('---CERT-PEM---')
  })

  it('5.2 SNI 粘贴 a.com,b.com 回车拆为两标签', async () => {
    const w = await mountCreate()
    const vm: any = w.vm
    vm.sniInputValue = 'a.com,b.com'
    await w.vm.$nextTick()
    await w.find('.sni-input-inline').trigger('keydown.enter')
    expect(vm.sniTags).toEqual(['a.com', 'b.com'])
    expect(vm.sniInputValue).toBe('')
  })

  it('5.2 SNI 提示统一「Enter 或逗号添加，支持粘贴多个」', async () => {
    const w = await mountCreate()
    const input = w.find('.sni-input-inline')
    expect(input.attributes('placeholder')).toBe('Enter 或逗号添加，支持粘贴多个')
  })

  async function mountEdit(cert: Record<string, any>) {
    const SslFormDrawer = (await import('../SslFormDrawer.vue')).default
    const wrapper = mount(SslFormDrawer, {
      props: { visible: false, clusters: [], editingCert: cert },
      global: { stubs },
    })
    await wrapper.setProps({ visible: true })
    await flushPromises()
    await wrapper.vm.$nextTick()
    return wrapper
  }

  async function submit(wrapper: any) {
    await wrapper.find('.modal-footer .btn-primary').trigger('click')
    await flushPromises()
  }

  function publishedCert(overrides: Record<string, any> = {}) {
    return {
      id: 9,
      name: 'srv',
      cluster_id: 1,
      sni: 'a.example.com',
      cert: 'C',
      private_key: 'K',
      cert_type: 'server',
      algorithm: 'rsa',
      gm: false,
      current_version: 2,
      ...overrides,
    }
  }

  it('5.3 提交失败：422 detail 数组逐条拼接为「保存失败：…」', async () => {
    mockUpdate.mockRejectedValueOnce({
      response: { status: 422, data: { detail: [{ msg: '证书 PEM 解析失败' }, { msg: '私钥不匹配' }] } },
    })
    const w = await mountEdit(publishedCert())
    await submit(w)
    const errs = vi.mocked(message.error).mock.calls.map((c) => String(c[0]))
    expect(errs.some((t) => t.startsWith('保存失败：'))).toBe(true)
    expect(errs.some((t) => t.includes('证书 PEM 解析失败') && t.includes('私钥不匹配'))).toBe(true)
  })

  it('5.3 提交失败：字符串 detail 保留原文并加前缀', async () => {
    mockUpdate.mockRejectedValueOnce({ response: { data: { detail: '连接超时' } } })
    const w = await mountEdit(publishedCert())
    await submit(w)
    expect(vi.mocked(message.error)).toHaveBeenCalledWith('保存失败：连接超时')
  })
})

describe('SslFormDrawer 私钥保护链（ssl-ux-review-fixes 9.3/9.4）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockResolvedValue({ data: { id: 1 } })
    mockUpdate.mockResolvedValue({ data: { id: 1 } })
  })

  // 掩码后的真实响应形状（#43）：private_key/sign_key 恒空串 + has_* 布尔
  const maskedCert = {
    id: 7,
    name: 'masked-cert',
    cluster_id: 1,
    cert_type: 'server',
    sni: 'a.example.com',
    cert: '---CERT---',
    key: '',
    private_key: '',
    has_private_key: true,
    gm: false,
    ssl_protocols: '["TLSv1.2","TLSv1.3"]',
  }

  it('9.3 编辑模式私钥不回填明文，placeholder 提示「已保存，留空表示不修改」', async () => {
    const w = await mountWithVisibility(maskedCert)
    const ta = w.findAll('textarea').find((t: any) => (t.attributes('placeholder') || '').includes('已保存'))
    expect(ta, '未找到带「已保存，留空表示不修改」占位符的私钥输入框').toBeDefined()
  })

  it('9.4 编辑模式留空私钥可保存，payload 不含 private_key（留空=不修改）', async () => {
    const w = await mountWithVisibility(maskedCert)
    await clickSubmit(w)
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    const payload = mockUpdate.mock.calls[0][2]
    expect(payload).not.toHaveProperty('private_key')
  })

  it('9.4 国密编辑留空签名私钥不进 payload（防误清签名字段）', async () => {
    const gmMasked = {
      ...maskedCert,
      gm: true,
      algorithm: 'sm2',
      sign_cert: '---SIGNCERT---',
      sign_key: '',
      has_sign_key: true,
      cert_type: 'server',
    }
    const w = await mountWithVisibility(gmMasked)
    await clickSubmit(w)
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    const payload = mockUpdate.mock.calls[0][2]
    expect(payload).not.toHaveProperty('sign_key')
    expect(payload.sign_cert).toBe('---SIGNCERT---') // 非掩码字段照常回填提交
  })

  it('9.4 创建模式私钥仍必填（校验不放松）', async () => {
    const w = await mountWithVisibility(null)
    const vm: any = w.vm
    vm.form.name = 'new-cert'
    vm.form.cluster_id = 1
    vm.sniTags.push('a.example.com')
    vm.form.cert = '---CERT---'
    await clickSubmit(w)
    expect(mockCreate).not.toHaveBeenCalled()
    expect(vm.formErrors.key).toContain('请上传或粘贴私钥')
  })
})

describe('SslFormDrawer PEM 即时预览（ssl-ux-review-fixes 10.2）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockResolvedValue({ data: { id: 1 } })
    mockUpdate.mockResolvedValue({ data: { id: 1 } })
  })

  async function mountAndPaste(cert: string, key: string) {
    const w = await mountWithVisibility(null)
    const vm: any = w.vm
    vm.form.cluster_id = 1 // 预览端点挂集群 URL，需先选集群
    vm.form.cert = cert
    vm.form.key = key
    await new Promise((r) => setTimeout(r, 700)) // 越过防抖窗口
    await w.vm.$nextTick()
    return w
  }

  it('粘贴证书+私钥（防抖后）显示预览行（CN/有效期/算法/配对）', async () => {
    mockPreview.mockResolvedValue({
      data: {
        cert: {
          ok: true,
          subject_cn: 'preview.example.com',
          san: [],
          not_after: '2027-01-01T00:00:00',
          algorithm: 'rsa',
          expire_days: 500,
        },
        key: { ok: true },
        key_match: true,
      },
    })
    const w = await mountAndPaste('---CERT---', '---KEY---')
    expect(mockPreview).toHaveBeenCalled()
    const row = w.find('.pem-preview-row')
    expect(row.exists()).toBe(true)
    expect(row.text()).toContain('preview.example.com')
    expect(row.text()).toContain('配对')
  })

  it('不配对显示红色警示', async () => {
    mockPreview.mockResolvedValue({
      data: {
        cert: {
          ok: true,
          subject_cn: 'a.example.com',
          san: [],
          not_after: '2027-01-01T00:00:00',
          algorithm: 'rsa',
          expire_days: 500,
        },
        key: { ok: true },
        key_match: false,
      },
    })
    const w = await mountAndPaste('---CERT---', '---KEY---')
    const row = w.find('.pem-preview-row')
    expect(row.exists()).toBe(true)
    expect(row.text()).toContain('不配对')
    expect(row.classes()).toContain('pem-preview-mismatch')
  })

  it('证书为空不发起预览', async () => {
    const before = mockPreview.mock.calls.length
    await mountAndPaste('', '')
    // 仅断言本用例自身未新增调用（历史用例泄漏的挂起定时器可能仍在窗口内触发）
    expect(mockPreview.mock.calls.length).toBe(before)
  })
})
