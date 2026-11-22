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
      { label: '10.0.0.1', status: 'running', logs: ['开始执行...', 'nginx_start rc=0'] },
      { label: '10.0.0.2', status: 'pending', logs: [] },
      { label: '10.0.0.3', status: 'success', logs: ['✅ 启动成功'] },
    ],
    expandedKey: null,
    ...overrides,
  }
}

describe('BatchActionProgressModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('renders each item as a row with status', async () => {
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

  it('首列承载身份标签：非 IP 的资源名称同样完整渲染（上游/路由域）', async () => {
    const BatchActionProgressModal = (await import('../BatchActionProgressModal.vue')).default
    const wrapper = mount(BatchActionProgressModal, {
      props: await makeProps({
        title: '批量删除上游',
        items: [
          { label: 'user-service', status: 'success', logs: ['✅ 数据库记录已删除'] },
          { label: 'order-service-with-a-long-name', status: 'error', logs: ['❌ 删除失败'] },
        ],
      }),
      global: { stubs },
    })
    const rows = Array.from(document.querySelectorAll('.batch-node-row'))
    expect(rows).toHaveLength(2)
    expect(rows[0].textContent).toContain('user-service')
    // 长名称不截断（折行而非省略）
    expect(rows[1].textContent).toContain('order-service-with-a-long-name')
    wrapper.unmount()
  })

  it('expands item details when a row is clicked', async () => {
    const BatchActionProgressModal = (await import('../BatchActionProgressModal.vue')).default
    const wrapper = mount(BatchActionProgressModal, {
      props: await makeProps({ expandedKey: '10.0.0.1' }),
      global: { stubs },
    })
    const text = bodyText()
    expect(text).toContain('nginx_start rc=0')
    wrapper.unmount()
  })

  it('toggle-expand 携带身份标签 label（不是旧字段 ip）', async () => {
    const BatchActionProgressModal = (await import('../BatchActionProgressModal.vue')).default
    const wrapper = mount(BatchActionProgressModal, {
      props: await makeProps({ items: [{ label: 'user-service', status: 'success', logs: [] }] }),
      global: { stubs },
    })
    const row = document.querySelector('.batch-node-row') as HTMLElement
    row.click()
    expect(wrapper.emitted('toggle-expand')).toEqual([['user-service']])
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
