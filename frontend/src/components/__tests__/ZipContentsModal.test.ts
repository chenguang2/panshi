// ZipContentsModal（B2a）：面板静态资源 Tab 与静态资源页的唯一 ZIP 内容弹窗
// 自持拉取 `/clusters/{cid}/static-resources/{id}/zip-contents`，加载/错误/空态/截断提示全在组件内。
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ZipContentsModal from '@/components/ZipContentsModal.vue'

const mockGet = vi.fn()
vi.mock('@/api', () => ({
  default: { get: (...a: unknown[]) => mockGet(...(a as [])) },
}))

const ITEMS = [
  { name: 'index.html', file_size: 2048, compressed_size: 1024, modified: '2026-10-19T10:00:00' },
  { name: 'assets/app.js', file_size: 100, compressed_size: 60, modified: '2026-10-19T10:05:00' },
]

async function mountModal(props: Record<string, unknown> = {}) {
  const w = mount(ZipContentsModal, {
    props: { visible: true, clusterId: 7, resourceId: 1, resourceName: 'portal', ...props },
  })
  await flushPromises()
  return w
}

beforeEach(() => {
  mockGet.mockReset()
  mockGet.mockImplementation(async () => ({ data: { items: ITEMS, total_count: ITEMS.length, message: '' } }))
})

describe('ZipContentsModal', () => {
  it('标题为「ZIP 内容 — {资源名}」，按集群/资源标识拉取内容并渲染表格', async () => {
    const w = await mountModal()
    expect(w.find('.modal-header h2').text()).toBe('ZIP 内容 — portal')
    expect(mockGet).toHaveBeenCalledWith('/clusters/7/static-resources/1/zip-contents')
    const rows = w.findAll('.zip-table tbody tr')
    expect(rows.length).toBe(2)
    expect(rows[0].text()).toContain('index.html')
    expect(rows[0].text()).toContain('2.0 KB')
    expect(rows[0].text()).toContain('1.0 KB')
    // 修改时间走 formatDate（Asia/Shanghai，dash 格式）
    expect(rows[0].text()).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/)
  })

  it('title prop 优先于 resourceName 推导', async () => {
    const w = await mountModal({ title: '自定义标题' })
    expect(w.find('.modal-header h2').text()).toBe('自定义标题')
  })

  it('空态：无文件时显示空包文案（message 优先，缺省「ZIP 包内无文件」）', async () => {
    mockGet.mockResolvedValue({ data: { items: [], total_count: 0, message: 'ZIP 包内无文件（空包）' } })
    const w = await mountModal()
    expect(w.find('.zip-table').exists()).toBe(false)
    expect(w.find('.zip-empty').text()).toContain('ZIP 包内无文件（空包）')

    mockGet.mockResolvedValue({ data: { items: [], total_count: 0, message: '' } })
    const w2 = await mountModal()
    expect(w2.find('.zip-empty').text()).toContain('ZIP 包内无文件')
  })

  it('错误态：接口失败显示 detail 文案且不渲染表格', async () => {
    mockGet.mockRejectedValue({ response: { data: { detail: '获取 ZIP 内容失败' } } })
    const w = await mountModal()
    expect(w.find('.zip-empty-text.danger').text()).toBe('获取 ZIP 内容失败')
    expect(w.find('.zip-table').exists()).toBe(false)
    expect(w.find('.zip-empty-icon.danger').exists()).toBe(true)
  })

  it('截断提示：返回条数少于 total_count 时显式标注', async () => {
    mockGet.mockResolvedValue({ data: { items: [ITEMS[0]], total_count: 50, message: '' } })
    const w = await mountModal()
    expect(w.find('.zip-hint').text()).toContain('仅显示前 1 个 / 共 50 个文件')
  })

  it('visible=false 不发请求；关闭按钮 emit close', async () => {
    const w = await mountModal({ visible: false })
    expect(mockGet).not.toHaveBeenCalled()
    expect(w.find('.modal-overlay').attributes('style')).toContain('display: none')
    await w.findAll('.modal-footer button')[0].trigger('click')
    expect(w.emitted('close')).toBeTruthy()
  })

  it('缺少集群/资源标识时不发请求（面板首帧未选记录）', async () => {
    await mountModal({ clusterId: null, resourceId: null })
    expect(mockGet).not.toHaveBeenCalled()
  })
})
