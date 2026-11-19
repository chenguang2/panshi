import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetPublishPreview = vi.fn()
const mockFetchAllClusterNodes = vi.fn()

vi.mock('@/api/clusters', () => ({
  getPublishPreview: (...args: any[]) => mockGetPublishPreview(...args),
}))

vi.mock('@/composables/useClusterUtils', () => ({
  fetchAllClusterNodes: (...args: any[]) => mockFetchAllClusterNodes(...args),
}))

import {
  buildFailedNoticeText,
  useRepublishFailedNodes,
  noticeTextFromPublishDetail,
} from '@/composables/useRepublishFailedNodes'

function previewPayload(overrides: Record<string, unknown> = {}) {
  return {
    cluster_id: 1,
    resource_type: 'stream_proxy',
    resource_id: 11,
    name: '四层代理#11',
    checked_at: '2026-11-19T00:00:00',
    cluster_error: null,
    has_baseline: true,
    baseline_missing_reason: null,
    platform_change: null,
    nodes: [
      { label: '192.168.0.13', status: 'ok', reason: null, diff_count: 0, behind: false, behind_reason: null },
      {
        label: '192.168.0.15',
        status: 'diff',
        reason: null,
        diff_count: 2,
        behind: true,
        behind_reason: '落后于上次发布：/listen_port 与待发布配置不一致（其余节点已一致）',
      },
      {
        label: '192.168.0.16',
        status: 'unreachable',
        reason: '连接超时',
        diff_count: 0,
        behind: false,
        behind_reason: null,
      },
    ],
    matrix: { node_labels: [], diff_rows: [], same_rows: [] },
    summary: { diff_count: 2, same_count: 0, behind_nodes: ['192.168.0.15'] },
    ...overrides,
  }
}

const ROW = { id: 11, cluster_id: 1 }

describe('useRepublishFailedNodes · 失败集合解析（republish-failed-nodes）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchAllClusterNodes.mockResolvedValue([
      { id: 7, ip: '192.168.0.13', management_port: 16620, status: 1 },
      { id: 9, ip: '192.168.0.15', management_port: 16620, status: 1 },
      { id: 12, ip: '192.168.0.16', management_port: 16620, status: 1 },
    ])
  })

  it('解析成功：diff/unreachable/missing 三态为失败集合，IP 映射为节点 id，文案同构静态资源页', async () => {
    mockGetPublishPreview.mockResolvedValue({ data: previewPayload() })
    const { resolve } = useRepublishFailedNodes()
    const outcome = await resolve(ROW, 'stream_proxy')
    expect(outcome?.ok).toBe(true)
    expect(outcome?.failedNodeIds).toEqual([9, 12])
    expect(outcome?.failedNodes).toHaveLength(2)
    expect(outcome?.failedNodes[0]).toEqual({
      id: 9,
      label: '192.168.0.15',
      reason: '落后于上次发布：/listen_port 与待发布配置不一致（其余节点已一致）',
    })
    expect(outcome?.noticeText).toBe(
      '2 个节点分发失败（192.168.0.15 落后于上次发布：/listen_port 与待发布配置不一致（其余节点已一致） 等）',
    )
    // 预览请求带 cluster/type/id
    expect(mockGetPublishPreview).toHaveBeenCalledWith(1, 'stream_proxy', 11)
    // 节点清单按 cluster 拉取（IP→id 映射）
    expect(mockFetchAllClusterNodes).toHaveBeenCalledWith(1)
  })

  it('missing 态取缺失原因；label = node-{id} 兜底无法映射 → 保留在 failedNodes、跳过预选', async () => {
    mockGetPublishPreview.mockResolvedValue({
      data: previewPayload({
        nodes: [
          { label: '192.168.0.13', status: 'ok', reason: null, diff_count: 0, behind: false, behind_reason: null },
          {
            label: 'node-3',
            status: 'missing',
            reason: '该节点无此资源',
            diff_count: 0,
            behind: true,
            behind_reason: '缺失该资源（未收到此前发布或被 Edge 侧删除）',
          },
        ],
      }),
    })
    const { resolve } = useRepublishFailedNodes()
    const outcome = await resolve(ROW, 'stream_proxy')
    expect(outcome?.ok).toBe(true)
    expect(outcome?.failedNodes[0].label).toBe('node-3')
    expect(outcome?.failedNodes[0].id).toBeNull()
    expect(outcome?.failedNodeIds).toEqual([])
    expect(outcome?.noticeText).toContain('1 个节点分发失败（node-3 缺失该资源（未收到此前发布或被 Edge 侧删除））')
  })

  it('基线缺失（旧快照）→ 回退，不发节点清单请求', async () => {
    mockGetPublishPreview.mockResolvedValue({
      data: previewPayload({
        has_baseline: false,
        baseline_missing_reason: '基线缺失：该快照不含实发载荷（旧版本），重新发布后可用',
        nodes: [],
      }),
    })
    const { resolve } = useRepublishFailedNodes()
    const outcome = await resolve(ROW, 'stream_proxy')
    expect(outcome?.ok).toBe(false)
    expect(outcome?.fallback).toBe('baseline_missing')
    expect(outcome?.noticeText).toBeNull()
    expect(mockFetchAllClusterNodes).not.toHaveBeenCalled()
  })

  it('cluster_error（无活跃节点）→ 回退', async () => {
    mockGetPublishPreview.mockResolvedValue({
      data: previewPayload({ cluster_error: '集群中没有活跃的 edge 节点', nodes: [] }),
    })
    const { resolve } = useRepublishFailedNodes()
    const outcome = await resolve(ROW, 'stream_proxy')
    expect(outcome?.ok).toBe(false)
    expect(outcome?.fallback).toBe('cluster_error')
  })

  it('预览请求失败 → request_failed 回退，不抛异常', async () => {
    mockGetPublishPreview.mockRejectedValue(new Error('boom'))
    const { resolve } = useRepublishFailedNodes()
    const outcome = await resolve(ROW, 'stream_proxy')
    expect(outcome?.ok).toBe(false)
    expect(outcome?.fallback).toBe('request_failed')
    expect(outcome?.noticeText).toBeNull()
  })

  it('全部节点一致（无失败集合）→ empty 回退', async () => {
    mockGetPublishPreview.mockResolvedValue({
      data: previewPayload({ nodes: [previewPayload().nodes[0]] }),
    })
    const { resolve } = useRepublishFailedNodes()
    const outcome = await resolve(ROW, 'stream_proxy')
    expect(outcome?.ok).toBe(false)
    expect(outcome?.fallback).toBe('empty')
  })

  it('in-flight 防重复：进行中再次 resolve → null（忽略）', async () => {
    let release!: (v: unknown) => void
    mockGetPublishPreview.mockImplementation(() => new Promise((res) => (release = res)))
    const { resolve, loading } = useRepublishFailedNodes()
    const first = resolve(ROW, 'stream_proxy')
    await Promise.resolve()
    expect(loading.value).toBe(true)
    const second = await resolve(ROW, 'stream_proxy')
    expect(second).toBeNull()
    release({ data: previewPayload() })
    const outcome = await first
    expect(outcome?.ok).toBe(true)
    expect(loading.value).toBe(false)
  })

  it('节点清单拉取失败 → 预选为空（弹窗退回默认全选在线），失败集合文案仍可用', async () => {
    mockGetPublishPreview.mockResolvedValue({ data: previewPayload() })
    mockFetchAllClusterNodes.mockRejectedValue(new Error('nodes boom'))
    const { resolve } = useRepublishFailedNodes()
    const outcome = await resolve(ROW, 'stream_proxy')
    expect(outcome?.ok).toBe(true)
    expect(outcome?.failedNodeIds).toEqual([])
    expect(outcome?.noticeText).toContain('2 个节点分发失败')
  })
})

describe('buildFailedNoticeText · 文案规则（与静态资源页 failedNoticeText 同构）', () => {
  it('单节点不带「等」；原因缺省只出 label', () => {
    expect(buildFailedNoticeText([{ label: '10.0.0.14', reason: null }])).toBe('1 个节点分发失败（10.0.0.14）')
  })
  it('多节点首项 + 「等」', () => {
    const text = buildFailedNoticeText([
      { label: '10.0.0.14', reason: '连接超时' },
      { label: '10.0.0.15', reason: null },
    ])
    expect(text).toBe('2 个节点分发失败（10.0.0.14 连接超时 等）')
  })
})

describe('noticeTextFromPublishDetail · 持久化明细文案（方案 B D11）', () => {
  it('failed_nodes → 具体文案；无明细 → null（回退泛化）', () => {
    expect(
      noticeTextFromPublishDetail({
        total: 2,
        success: 1,
        failed: 1,
        failed_nodes: [{ node: '10.0.0.14:9180', error: 'Edge API error 403' }],
      }),
    ).toBe('1 个节点分发失败（10.0.0.14:9180 Edge API error 403）')
    expect(noticeTextFromPublishDetail(null)).toBeNull()
    expect(noticeTextFromPublishDetail({ failed_nodes: [] })).toBeNull()
  })
})
