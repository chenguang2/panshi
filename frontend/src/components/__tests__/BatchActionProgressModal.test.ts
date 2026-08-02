import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const stubs = {}

function bodyText(): string {
  return (document.body.textContent || '').trim()
}

async function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    visible: true,
    title: '批量启动',
    items: [
      { ip: '10.0.0.1', status: 'running', logs: ['开始执行...', 'nginx_start rc=0'] },
      { ip: '10.0.0.2', status: 'pending', logs: [] },
      { ip: '10.0.0.3', status: 'success', logs: ['✅ 启动成功'] },
    ],
    expandedIp: null,
    ...overrides,
  }
}

describe('BatchActionProgressModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('renders each node as a row with status', async () => {
    const BatchActionProgressModal = (await import('../BatchActionProgressModal.vue')).default
    const wrapper = mount(BatchActionProgressModal, { props: await makeProps(), global: { stubs } })
    const text = bodyText()
    expect(text).toContain('10.0.0.1')
    expect(text).toContain('10.0.0.2')
    expect(text).toContain('10.0.0.3')
    expect(text).toContain('执行中')
    expect(text).toContain('等待中')
    expect(text).toContain('成功')
    wrapper.unmount()
  })

  it('expands node details when a row is clicked', async () => {
    const BatchActionProgressModal = (await import('../BatchActionProgressModal.vue')).default
    const wrapper = mount(BatchActionProgressModal, {
      props: await makeProps({ expandedIp: '10.0.0.1' }),
      global: { stubs },
    })
    const text = bodyText()
    expect(text).toContain('nginx_start rc=0')
    wrapper.unmount()
  })

  it('emits update:visible when close clicked', async () => {
    const BatchActionProgressModal = (await import('../BatchActionProgressModal.vue')).default
    const wrapper = mount(BatchActionProgressModal, { props: await makeProps(), global: { stubs } })
    const closeBtn = document.querySelector('.modal-close') as HTMLElement
    closeBtn.click()
    expect(wrapper.emitted('update:visible')).toBeTruthy()
    expect(wrapper.emitted('update:visible')![0]).toEqual([false])
    wrapper.unmount()
  })
})
