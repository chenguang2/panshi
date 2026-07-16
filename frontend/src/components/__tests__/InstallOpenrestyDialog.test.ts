import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

const mockApiGet = vi.fn()

vi.mock('@/api', () => ({
  default: {
    get: (...args: any[]) => mockApiGet(...args),
  }
}))

function flush() {
  return new Promise(r => setTimeout(r, 100))
}

const MOCK_FILES = [
  { name: 'openresty-edge-26071515.tar.gz', size: 52428800, size_display: '50.0 MB', mtime: '2026-06-15T10:30:00Z' },
  { name: 'openresty-edge-26071308.tar.gz', size: 41943040, size_display: '40.0 MB', mtime: '2026-06-13T08:00:00Z' },
]

const MOCK_NODE = { ip: '192.168.1.100', edge_install_path: '/data/openresty', cluster_id: 1 }

async function createWrapper(props = {}) {
  const Dialog = (await import('../InstallOpenrestyDialog.vue')).default
  return mount(Dialog, {
    props: { visible: true, node: MOCK_NODE, clusterId: 1, ...props },
  })
}

describe('InstallOpenrestyDialog.vue', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders title and node info', async () => {
    mockApiGet.mockResolvedValue({ data: { files: MOCK_FILES } })
    const wrapper = await createWrapper()
    await flush()
    expect(wrapper.text()).toContain('选择 OpenResty 安装包')
    expect(wrapper.text()).toContain('192.168.1.100')
    expect(wrapper.text()).toContain('/data/openresty')
  })

  it('fetches file list on mount', async () => {
    mockApiGet.mockResolvedValue({ data: { files: MOCK_FILES } })
    await createWrapper()
    await flush()
    expect(mockApiGet).toHaveBeenCalledWith('/clusters/1/nodes/openresty-files')
  })

  it('displays files with size and date', async () => {
    mockApiGet.mockResolvedValue({ data: { files: MOCK_FILES } })
    const wrapper = await createWrapper()
    await flush()
    expect(wrapper.text()).toContain('openresty-edge-26071515.tar.gz')
    expect(wrapper.text()).toContain('50.0 MB')
  })

  it('emits confirm with selected file', async () => {
    mockApiGet.mockResolvedValue({ data: { files: MOCK_FILES } })
    const wrapper = await createWrapper()
    await flush()
    ;(wrapper.vm as any).selectedFile = 'openresty-edge-26071515.tar.gz'
    await wrapper.vm.$nextTick()
    const btn = wrapper.findAll('button').filter(w => w.text().includes('开始安装'))
    await btn[0].trigger('click')
    expect(wrapper.emitted('confirm')![0][0]).toEqual({
      node: MOCK_NODE, clusterId: 1, openrestyFile: 'openresty-edge-26071515.tar.gz',
    })
  })

  it('disables start when file list empty', async () => {
    mockApiGet.mockResolvedValue({ data: { files: [] } })
    const wrapper = await createWrapper()
    await flush()
    expect(wrapper.text()).toContain('未找到 OpenResty 安装包')
    const btn = wrapper.findAll('button').filter(w => w.text().includes('开始安装'))
    expect((btn[0].element as HTMLButtonElement).disabled).toBe(true)
  })

  it('emits close on cancel click', async () => {
    mockApiGet.mockResolvedValue({ data: { files: MOCK_FILES } })
    const wrapper = await createWrapper()
    await flush()
    const btn = wrapper.findAll('button').filter(w => w.text().includes('取消'))
    await btn[0].trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
