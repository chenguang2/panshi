import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const mockApiPost = vi.fn()
const mockApiPut = vi.fn()

vi.mock('@/api', () => ({
  default: {
    post: (...args: any[]) => mockApiPost(...args),
    put: (...args: any[]) => mockApiPut(...args),
  }
}))

const stubs = {
  AModal: { template: '<div class="mock-modal" :class="{ open: open }"><slot /><slot name="footer" /></div>', props: ['open', 'title', 'width', 'confirmLoading'] },
  ATabs: { template: '<div class="mock-tabs"><slot /></div>', props: ['activeKey'] },
  ATabPane: { template: '<div class="mock-tabpane"><slot /></div>', props: ['key', 'tab'] },
  AForm: { template: '<form><slot /></form>', props: ['model', 'labelCol', 'wrapperCol'], methods: { validate: () => Promise.resolve() } },
  AFormItem: { template: '<div class="mock-formitem"><label v-if="label" class="mock-label">{{ label }}</label><slot /></div>', props: ['label', 'name', 'rules'] },
  AInput: { template: '<input :value="value" @input="$emit(\'update:value\', $event.target.value)" />', props: ['value', 'placeholder'] },
  ATextarea: { template: '<textarea :value="value" @input="$emit(\'update:value\', $event.target.value)" />', props: ['value', 'rows'] },
  AInputNumber: { template: '<input type="number" :value="value" @input="$emit(\'update:value\', parseFloat($event.target.value) || 0)" />', props: ['value', 'min', 'max', 'placeholder', 'style'] },
  HealthCheckForm: {
    template: '<div class="mock-health-check" />',
    props: ['checks', 'enabled', 'modelMode'],
    watch: {
      enabled(val: boolean) {
        if (val && !this.checks) {
          this.$emit('update:checks', { active: { type: 'http', concurrency: 10, http_path: '/', timeout: 1, healthy: { interval: 5, successes: 2, http_statuses: [200, 302, 403, 404] }, unhealthy: { interval: 3, http_failures: 5, http_statuses: [429, 500, 501, 502, 503, 504, 505], tcp_failures: 2, timeouts: 3 } }, passive: { type: 'http', healthy: { successes: 5, http_statuses: [200, 308] }, unhealthy: { http_failures: 5, http_statuses: [429, 500, 503], tcp_failures: 2, timeouts: 7 } } })
        }
      },
    },
  },
  ASelect: { template: '<select :value="value" :disabled="disabled" @change="$emit(\'update:value\', $event.target.value)"><slot /></select>', props: ['value', 'disabled'] },
  ASelectOption: { template: '<option :value="value"><slot /></option>', props: ['value'] },
  ATable: { template: '<div class="mock-table"><template v-for="(item, i) in dataSource"><slot name="bodyCell" :column="{ key: \'ip\' }" :record="item" :index="i" /><slot name="bodyCell" :column="{ key: \'port\' }" :record="item" :index="i" /><slot name="bodyCell" :column="{ key: \'weight\' }" :record="item" :index="i" /><slot name="bodyCell" :column="{ key: \'action\' }" :record="item" :index="i" /></template></div>', props: ['columns', 'dataSource', 'pagination', 'size', 'rowKey'] },
  AButton: { template: '<button class="mock-btn" @click="$emit(\'click\')"><slot /></button>', props: ['type', 'size', 'danger', 'loading'] },
  WarningOutlined: { template: '<span class="mock-warning-icon" />' },
  PlusOutlined: { template: '<span class="mock-plus-icon" />' },
}

const MOCK_CLUSTERS = [
  { id: 1, name: 'cluster-a', display_name: '集群A' },
  { id: 2, name: 'cluster-b', display_name: '集群B' },
]

const MOCK_UPSTREAM = {
  id: 1,
  name: 'test-upstream',
  load_balance: 'weighted_roundrobin',
  description: '测试上游',
  targets: [{ target: '10.0.0.1:8080', weight: 100 }],
  cluster_id: 1,
}

describe('UpstreamFormModal.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiPost.mockResolvedValue({ data: { message: 'ok' } })
    mockApiPut.mockResolvedValue({ data: { message: 'ok' } })
  })

  it('renders create form when no editingUpstream', async () => {
    const UpstreamFormModal = (await import('../UpstreamFormModal.vue')).default
    const wrapper = mount(UpstreamFormModal, {
      props: { visible: true, editingUpstream: null, clusters: MOCK_CLUSTERS },
      global: { stubs }
    })
    expect(wrapper.find('.modal-overlay').exists()).toBe(true)
    expect(wrapper.text()).toContain('所属集群')
  })

  it('renders edit form when editingUpstream provided', async () => {
    const UpstreamFormModal = (await import('../UpstreamFormModal.vue')).default
    const wrapper = mount(UpstreamFormModal, {
      props: { visible: true, editingUpstream: MOCK_UPSTREAM, clusters: MOCK_CLUSTERS },
      global: { stubs }
    })
    // In edit mode, cluster selector should be disabled
    const select = wrapper.find('select')
    expect(select.attributes('disabled')).toBeDefined()
  })

  async function fillAndSubmit(wrapper: any, editing = false) {
    const vm = wrapper.vm as any
    vm.form.cluster_id = 1
    vm.form.targets = [{ key: 1, host: '10.0.0.1', port: 8080, weight: 100 }]
    vm.form.name = 'test-upstream'
    await wrapper.vm.$nextTick()
    const saveBtn = wrapper.findAll('button').filter((w: any) => w.text().includes('保存'))
    if (saveBtn.length > 0) {
      await saveBtn[0].trigger('click')
    } else {
      throw new Error('Save button not found')
    }
    await wrapper.vm.$nextTick()
  }

  it('calls POST API on create submit', async () => {
    const UpstreamFormModal = (await import('../UpstreamFormModal.vue')).default
    const wrapper = mount(UpstreamFormModal, {
      props: { visible: true, editingUpstream: null, clusters: MOCK_CLUSTERS },
      global: { stubs }
    })
    await fillAndSubmit(wrapper)
    expect(mockApiPost).toHaveBeenCalled()
  })

  it('calls PUT API on edit submit', async () => {
    const UpstreamFormModal = (await import('../UpstreamFormModal.vue')).default
    const wrapper = mount(UpstreamFormModal, {
      props: { visible: true, editingUpstream: MOCK_UPSTREAM, clusters: MOCK_CLUSTERS },
      global: { stubs }
    })
    await fillAndSubmit(wrapper)
    expect(mockApiPut).toHaveBeenCalled()
  })

  // ── RED TEST 1: Toggle OFF all → advanced fields should be null in API call ──
  it('submit with all toggles OFF sends null for all advanced config fields', async () => {
    const UpstreamFormModal = (await import('../UpstreamFormModal.vue')).default
    const wrapper = mount(UpstreamFormModal, {
      props: { visible: true, editingUpstream: null, clusters: MOCK_CLUSTERS },
      global: { stubs }
    })
    await fillAndSubmit(wrapper)

    const callArgs = mockApiPost.mock.calls[0]
    const body = callArgs[1] as Record<string, unknown>

    expect(body.checks).toBeNull()
    expect(body.timeout).toBeNull()
    expect(body.keepalive_pool).toBeNull()
    expect(body.retries).toBeNull()
    expect(body.retry_timeout).toBeNull()
    expect(body.pass_host).toBeNull()
    expect(body.upstream_host).toBeNull()
    expect(body.scheme).toBeNull()
  })

  // ── RED TEST 2: retries radio submits correct values ──
  it('retries radio auto sends null', async () => {
    const UpstreamFormModal = (await import('../UpstreamFormModal.vue')).default
    const wrapper = mount(UpstreamFormModal, {
      props: { visible: true, editingUpstream: null, clusters: MOCK_CLUSTERS },
      global: { stubs }
    })
    const vm = wrapper.vm as any
    vm.toggleRetries = true
    vm.retriesRadio = 'auto'
    await fillAndSubmit(wrapper)
    const body = mockApiPost.mock.calls[0][1] as Record<string, unknown>
    expect(body.retries).toBeNull()
  })

  it('retries radio custom sends N', async () => {
    const UpstreamFormModal = (await import('../UpstreamFormModal.vue')).default
    const wrapper = mount(UpstreamFormModal, {
      props: { visible: true, editingUpstream: null, clusters: MOCK_CLUSTERS },
      global: { stubs }
    })
    const vm = wrapper.vm as any
    vm.toggleRetries = true
    vm.retriesRadio = 'custom'
    vm.form.retriesInput = 5
    await fillAndSubmit(wrapper)
    const body = mockApiPost.mock.calls[0][1] as Record<string, unknown>
    expect(body.retries).toBe(5)
  })

  it('retries radio disabled sends 0', async () => {
    const UpstreamFormModal = (await import('../UpstreamFormModal.vue')).default
    const wrapper = mount(UpstreamFormModal, {
      props: { visible: true, editingUpstream: null, clusters: MOCK_CLUSTERS },
      global: { stubs }
    })
    const vm = wrapper.vm as any
    vm.toggleRetries = true
    vm.retriesRadio = 'disabled'
    await fillAndSubmit(wrapper)
    const body = mockApiPost.mock.calls[0][1] as Record<string, unknown>
    expect(body.retries).toBe(0)
  })

  // ── RED TEST 3: edit populates toggle states from DB values ──
  it('edit form toggles ON for non-null DB fields', async () => {
    const upstreamWithConfig = {
      ...MOCK_UPSTREAM,
      checks: { passive: {}, active: { unhealthy: {} } },
      timeout: { connect: 10, send: 10, read: 10 },
      retries: 3,
    }
    const UpstreamFormModal = (await import('../UpstreamFormModal.vue')).default
    const wrapper = mount(UpstreamFormModal, {
      props: { visible: true, editingUpstream: upstreamWithConfig, clusters: MOCK_CLUSTERS },
      global: { stubs }
    })
    const vm = wrapper.vm as any
    expect(vm.toggleChecks).toBe(true)
    expect(vm.toggleTimeout).toBe(true)
    expect(vm.toggleRetries).toBe(true)
    expect(vm.retriesRadio).toBe('custom')
    expect(vm.form.retriesInput).toBe(3)
  })

  it('edit form toggles OFF for null DB fields', async () => {
    const UpstreamFormModal = (await import('../UpstreamFormModal.vue')).default
    const wrapper = mount(UpstreamFormModal, {
      props: { visible: true, editingUpstream: MOCK_UPSTREAM, clusters: MOCK_CLUSTERS },
      global: { stubs }
    })
    const vm = wrapper.vm as any
    expect(vm.toggleChecks).toBe(false)
    expect(vm.toggleTimeout).toBe(false)
    expect(vm.toggleRetries).toBe(false)
  })

  // ── Regression: empty timeout fields should block save ──
  it('timeout validation blocks save when connect is empty', async () => {
    const UpstreamFormModal = (await import('../UpstreamFormModal.vue')).default
    const wrapper = mount(UpstreamFormModal, {
      props: { visible: true, editingUpstream: null, clusters: MOCK_CLUSTERS },
      global: { stubs }
    })
    const vm = wrapper.vm as any
    vm.toggleTimeout = true
    // Simulate clearing the connect input as custom @input handler does
    vm.form.timeout.connect = undefined as any
    vm.form.timeout.send = undefined as any
    vm.form.timeout.read = undefined as any
    vm.form.cluster_id = 1
    vm.form.targets = [{ key: 1, host: '10.0.0.1', port: 8080, weight: 100 }]
    vm.form.name = 'test-upstream'
    await vm.$nextTick()
    // Click save button
    const saveBtn = wrapper.findAll('button').filter((w: any) => w.text().includes('保存'))
    await saveBtn[0].trigger('click')
    await vm.$nextTick()
    // API should NOT be called
    expect(mockApiPost).not.toHaveBeenCalled()
    // Error message should be set
    expect(vm.formErrors.timeout).toContain('超时配置')
  })

  // ── Regression: toggle ON without touching textarea → checks should be valid ──
  it('toggle health check ON sends checks even without touching textarea', async () => {
    const UpstreamFormModal = (await import('../UpstreamFormModal.vue')).default
    const wrapper = mount(UpstreamFormModal, {
      props: { visible: true, editingUpstream: null, clusters: MOCK_CLUSTERS },
      global: { stubs }
    })
    const vm = wrapper.vm as any
    // Toggle health check ON without touching textarea
    vm.toggleChecks = true
    await fillAndSubmit(wrapper)
    const body = mockApiPost.mock.calls[0][1] as Record<string, unknown>
    expect(body.checks).not.toBeNull()
    expect(body.checks).toHaveProperty('passive')
    expect(body.checks).toHaveProperty('active')
  })

  // ── UI text labels ──────────────────────────────

  describe('UI text labels', () => {
    it('shows 主机/域名 in table header', async () => {
      const UpstreamFormModal = (await import('../UpstreamFormModal.vue')).default
      const wrapper = mount(UpstreamFormModal, {
        props: { visible: true, editingUpstream: null, clusters: MOCK_CLUSTERS },
        global: { stubs }
      })
      expect(wrapper.html()).toContain('主机/域名')
    })

    it('shows 主机地址 in placeholder', async () => {
      const UpstreamFormModal = (await import('../UpstreamFormModal.vue')).default
      const wrapper = mount(UpstreamFormModal, {
        props: { visible: true, editingUpstream: null, clusters: MOCK_CLUSTERS },
        global: { stubs }
      })
      expect(wrapper.html()).toContain('主机地址')
    })
  })

  // ── validateHost ────────────────────────────────────

  describe('validateHost', () => {
    async function createVm() {
      const UpstreamFormModal = (await import('../UpstreamFormModal.vue')).default
      const wrapper = mount(UpstreamFormModal, {
        props: { visible: true, editingUpstream: null, clusters: MOCK_CLUSTERS },
        global: { stubs }
      })
      return wrapper.vm as any
    }

    it('accepts valid IPv4 addresses', async () => {
      const vm = await createVm()
      expect(vm.validateHost('192.168.1.1').valid).toBe(true)
      expect(vm.validateHost('10.0.0.1').valid).toBe(true)
      expect(vm.validateHost('0.0.0.0').valid).toBe(true)
      expect(vm.validateHost('255.255.255.255').valid).toBe(true)
    })

    it('rejects invalid IPv4 addresses', async () => {
      const vm = await createVm()
      const r = vm.validateHost('256.1.1.1')
      expect(r.valid).toBe(false)
      expect(r.error).toContain('IPv4')
    })

    it('accepts valid domain names', async () => {
      const vm = await createVm()
      expect(vm.validateHost('foo.com').valid).toBe(true)
      expect(vm.validateHost('my-service.example.com').valid).toBe(true)
      expect(vm.validateHost('a.b.c').valid).toBe(true)
    })

    it('rejects domain names with invalid characters', async () => {
      const vm = await createVm()
      const r = vm.validateHost('foo_bar.com')
      expect(r.valid).toBe(false)
      expect(r.error).toBeTruthy()
    })

    it('rejects domain labels starting or ending with hyphen', async () => {
      const vm = await createVm()
      expect(vm.validateHost('-foo.com').valid).toBe(false)
      expect(vm.validateHost('foo-.com').valid).toBe(false)
    })

    it('accepts IPv6 with brackets', async () => {
      const vm = await createVm()
      expect(vm.validateHost('[::1]').valid).toBe(true)
      expect(vm.validateHost('[2001:db8::1]').valid).toBe(true)
    })

    it('accepts IPv6 without brackets', async () => {
      const vm = await createVm()
      expect(vm.validateHost('::1').valid).toBe(true)
      expect(vm.validateHost('2001:db8::1').valid).toBe(true)
    })

    it('rejects non-IP non-domain strings', async () => {
      const vm = await createVm()
      expect(vm.validateHost('').valid).toBe(false)
      expect(vm.validateHost('localhost').valid).toBe(false)
    })
  })

  // ── parseTarget ─────────────────────────────────

  describe('parseTarget', () => {
    async function createVm() {
      const UpstreamFormModal = (await import('../UpstreamFormModal.vue')).default
      const wrapper = mount(UpstreamFormModal, {
        props: { visible: true, editingUpstream: null, clusters: MOCK_CLUSTERS },
        global: { stubs }
      })
      return wrapper.vm as any
    }

    it('parses IPv4 target correctly', async () => {
      const vm = await createVm()
      const r = vm.parseTarget('192.168.1.1:80')
      expect(r.host).toBe('192.168.1.1')
      expect(r.port).toBe(80)
    })

    it('parses IPv6 target with brackets', async () => {
      const vm = await createVm()
      const r = vm.parseTarget('[::1]:80')
      expect(r.host).toBe('[::1]')
      expect(r.port).toBe(80)
    })

    it('parses domain target correctly', async () => {
      const vm = await createVm()
      const r = vm.parseTarget('foo.com:8080')
      expect(r.host).toBe('foo.com')
      expect(r.port).toBe(8080)
    })

    it('parses target without port', async () => {
      const vm = await createVm()
      const r = vm.parseTarget('192.168.1.1')
      expect(r.host).toBe('192.168.1.1')
      expect(r.port).toBe(80)
    })
  })

  // ── IPv6 bracket auto-wrap ─────────────────────

  describe('IPv6 bracket on submit', () => {
    async function createVm2() {
      const UpstreamFormModal = (await import('../UpstreamFormModal.vue')).default
      const wrapper = mount(UpstreamFormModal, {
        props: { visible: true, editingUpstream: null, clusters: MOCK_CLUSTERS },
        global: { stubs }
      })
      return wrapper.vm as any
    }

    it('wraps IPv6 host in brackets when building target', async () => {
      const vm = (await createVm2())
      const built = vm.buildTarget('::1', 80)
      expect(built).toBe('[::1]:80')
    })

    it('does not wrap IPv4 in brackets', async () => {
      const vm = (await createVm2())
      const built = vm.buildTarget('192.168.1.1', 80)
      expect(built).toBe('192.168.1.1:80')
    })

    it('does not wrap domain in brackets', async () => {
      const vm = (await createVm2())
      const built = vm.buildTarget('foo.com', 8080)
      expect(built).toBe('foo.com:8080')
    })
  })
})

describe('UpstreamFormModal.vue copy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiPost.mockResolvedValue({ data: { message: 'ok' } })
    mockApiPut.mockResolvedValue({ data: { message: 'ok' } })
  })

  it('copyingUpstream 时标题显示「复制上游」', async () => {
    const UpstreamFormModal = (await import('../UpstreamFormModal.vue')).default
    const wrapper = mount(UpstreamFormModal, {
      props: { visible: true, editingUpstream: MOCK_UPSTREAM, copyingUpstream: true, clusters: MOCK_CLUSTERS },
      global: { stubs }
    })
    expect(wrapper.text()).toContain('复制上游')
  })

  it('copyingUpstream 填充源配置且 name=复制_源名', async () => {
    const UpstreamFormModal = (await import('../UpstreamFormModal.vue')).default
    const wrapper = mount(UpstreamFormModal, {
      props: { visible: true, editingUpstream: MOCK_UPSTREAM, copyingUpstream: true, clusters: MOCK_CLUSTERS },
      global: { stubs }
    })
    const vm = wrapper.vm as any
    expect(vm.form.name).toBe('复制_test-upstream')
    expect(vm.form.load_balance).toBe('weighted_roundrobin')
    expect(vm.form.description).toBe('测试上游')
  })

  it('copyingUpstream 提交走 POST 新建（非 PUT）', async () => {
    const UpstreamFormModal = (await import('../UpstreamFormModal.vue')).default
    const wrapper = mount(UpstreamFormModal, {
      props: { visible: true, editingUpstream: MOCK_UPSTREAM, copyingUpstream: true, clusters: MOCK_CLUSTERS },
      global: { stubs }
    })
    const vm = wrapper.vm as any
    vm.form.cluster_id = 1
    vm.form.targets = [{ key: 1, host: '10.0.0.1', port: 8080, weight: 100 }]
    await wrapper.vm.$nextTick()
    const saveBtn = wrapper.findAll('button').filter((w: any) => w.text().includes('保存'))
    if (saveBtn.length > 0) {
      await saveBtn[0].trigger('click')
    }
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    expect(mockApiPost).toHaveBeenCalled()
    expect(mockApiPut).not.toHaveBeenCalled()
  })
})
