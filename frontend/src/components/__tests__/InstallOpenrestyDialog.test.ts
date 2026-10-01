import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import InstallOpenrestyDialog from '../InstallOpenrestyDialog.vue'

// mock 数据形状取自真实后端响应（curl GET /api/v1/clusters/{id}/nodes/openresty-files 实测）：
// { files: [{ name, size, size_display, mtime }] }
const MOCK_FILES = [
  { name: 'openresty-edge-26071515.tar.gz', size: 52428800, size_display: '50.0 MB', mtime: '2026-06-15T10:30:00Z' },
  { name: 'openresty-edge-26071308.tar.gz', size: 41943040, size_display: '40.0 MB', mtime: '2026-06-13T08:00:00Z' },
]

const MOCK_NODE = { ip: '192.168.1.100', openresty_path: '/data/openresty', cluster_id: 1 }

const FILES_URL = '/clusters/1/nodes/openresty-files'

// URL 感知 mock：按请求 URL 分发注册的响应，未注册的 URL 直接 reject（不用顺序链，意外请求不会被静默吞掉）
const responses = new Map<string, { data: unknown }>()

const mockApiGet = vi.fn((url: string) => {
  const hit = responses.get(url)
  if (!hit) return Promise.reject(new Error(`unexpected GET: ${url}`))
  return Promise.resolve(hit)
})

vi.mock('@/api', () => ({
  default: {
    get: (url: string) => mockApiGet(url),
  },
}))

function mountClosed() {
  return mount(InstallOpenrestyDialog, {
    props: { visible: false, node: MOCK_NODE, clusterId: 1 },
  })
}

type DialogWrapper = ReturnType<typeof mountClosed>

function findButton(wrapper: DialogWrapper, text: string) {
  const btn = wrapper.findAll('button').find((w) => w.text().includes(text))
  expect(btn, `button not found: ${text}`).toBeTruthy()
  return btn!
}

// 组件经 watch(visible) 触发取数（真实流程是弹窗从隐藏打开），需 false→true 驱动
async function openDialog() {
  const wrapper = mountClosed()
  await wrapper.setProps({ visible: true })
  await flushPromises()
  return wrapper
}

describe('InstallOpenrestyDialog.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    responses.clear()
    responses.set(FILES_URL, { data: { files: MOCK_FILES } })
  })

  it('renders title and node info', async () => {
    const wrapper = await openDialog()
    expect(wrapper.text()).toContain('选择 OpenResty 安装包')
    expect(wrapper.text()).toContain('192.168.1.100')
    expect(wrapper.text()).toContain('/data/openresty')
  })

  it('fetches file list when dialog opens', async () => {
    await openDialog()
    expect(mockApiGet).toHaveBeenCalledWith(FILES_URL)
    expect(mockApiGet).toHaveBeenCalledTimes(1)
  })

  it('auto-selects first file and displays files with size and date', async () => {
    const wrapper = await openDialog()
    expect(wrapper.text()).toContain('openresty-edge-26071515.tar.gz')
    expect(wrapper.text()).toContain('50.0 MB')
    expect(wrapper.text()).toContain('2026-06-15')
    const radios = wrapper.findAll('input[type="radio"]')
    expect(radios).toHaveLength(MOCK_FILES.length)
    expect((radios[0].element as HTMLInputElement).checked).toBe(true)
    expect((radios[1].element as HTMLInputElement).checked).toBe(false)
  })

  it('emits confirm with the file picked via radio list', async () => {
    const wrapper = await openDialog()
    const radios = wrapper.findAll('input[type="radio"]')
    await radios[1].setValue()
    await findButton(wrapper, '开始安装').trigger('click')
    expect(wrapper.emitted('confirm')![0][0]).toEqual({
      node: MOCK_NODE,
      clusterId: 1,
      openrestyFile: 'openresty-edge-26071308.tar.gz',
    })
  })

  it('disables start when file list empty', async () => {
    responses.set(FILES_URL, { data: { files: [] } })
    const wrapper = await openDialog()
    expect(wrapper.text()).toContain('未找到 OpenResty 安装包')
    expect((findButton(wrapper, '开始安装').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows error message when fetching file list fails', async () => {
    responses.delete(FILES_URL)
    const wrapper = await openDialog()
    expect(wrapper.text()).toContain('获取文件列表失败，请重试')
  })

  it('emits close on cancel click', async () => {
    const wrapper = await openDialog()
    await findButton(wrapper, '取消').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })
})
