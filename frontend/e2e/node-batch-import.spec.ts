import { test, expect, type APIRequestContext } from '@playwright/test'

const API_BASE = 'http://localhost:9100/api/v1'
// E2E 保留 IP 段：仅本 spec 造数用，teardown 全量回收（含历史运行遗留）
const IMPORT_IPS = ['10.99.99.1', '10.99.99.2', '10.99.99.3', '10.99.99.4']

/** API 登录并返回带 Authorization 的请求头 */
async function apiHeaders(request: APIRequestContext): Promise<Record<string, string>> {
  const login = await request.post(`${API_BASE}/auth/login`, {
    data: { username: 'admin', password: 'panshi123' },
  })
  const token = (await login.json()).access_token
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

/** 列出节点管理中全部 10.99.99.x 节点（全局节点列表 API，含 cluster_id） */
async function listImportedNodes(
  request: APIRequestContext,
  headers: Record<string, string>,
): Promise<Array<{ id: number; ip: string; cluster_id: number }>> {
  const res = await request.get(`${API_BASE}/nodes?search=10.99.99&page_size=100`, { headers })
  const data = (await res.json().catch(() => null)) || { items: [] }
  return (data.items as Array<{ id: number; ip: string; cluster_id: number }>).filter((n) => IMPORT_IPS.includes(n.ip))
}

test.describe('Node Batch Import E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.fill('#username', 'admin')
    await page.fill('#password', 'panshi123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/')
  })

  async function openNodesTab(page: import('@playwright/test').Page) {
    await page.goto('/central-management')

    const nodeStat = page
      .locator('.cl-stat-link')
      .filter({ has: page.locator('.cl-stat-label', { hasText: '节点' }) })
      .first()
    await expect(nodeStat).toBeVisible({ timeout: 10000 })
    await nodeStat.click()

    const toolbar = page.locator('.node-actions')
    await expect(toolbar).toBeVisible({ timeout: 10000 })

    const nodeTable = page.locator('.tab-content .ant-table-tbody').first()
    await expect(nodeTable).toBeVisible({ timeout: 10000 })
    return toolbar
  }

  async function openNodeAddModal(page: import('@playwright/test').Page) {
    const toolbar = await openNodesTab(page)
    const addBtn = toolbar.locator('button').filter({ hasText: '添加节点' }).first()
    await expect(addBtn).toBeVisible({ timeout: 5000 })
    await addBtn.click()
    // 页面残留多个隐藏 overlay（display:none 常驻 DOM）：以 :visible 过滤出刚打开的节点弹窗
    // （标题可能是 添加节点/批量导入节点），toBeVisible 自动等待替代固定 sleep + count/isVisible 轮询
    const visibleModal = page
      .locator('.modal-overlay:visible')
      .filter({ has: page.locator('.modal-header h2', { hasText: '节点' }) })
      .first()
    await expect(visibleModal, '节点弹窗未打开').toBeVisible({ timeout: 5000 })
    return visibleModal
  }

  test('batch import flow: paste IP range, parse, preview, create', async ({ page, request }) => {
    const headers = await apiHeaders(request)
    try {
      const modal = await openNodeAddModal(page)

      // Switch to batch import mode
      const batchBtn = modal.locator('button').filter({ hasText: '批量导入' }).first()
      await batchBtn.click()

      // Paste text into textarea
      const textarea = modal.locator('textarea').first()
      await textarea.fill('10.99.99.1\n10.99.99.2\n# comment line\n10.99.99.3-10.99.99.4')

      // Parse
      const parseBtn = modal.locator('button').filter({ hasText: '解析' }).first()
      await parseBtn.click()

      // Preview table should show 4 parsed nodes (comment line skipped)
      const previewRows = modal.locator('tbody tr')
      await expect(previewRows).toHaveCount(4)

      // Create button should show count 4
      const createBtn = modal.locator('.modal-footer button').filter({ hasText: '创建' }).first()
      const btnText = (await createBtn.textContent()) || ''
      expect(btnText).toContain('4')

      // Click create, then assert the result instead of blind-sleeping:
      // 节点列表 API 必须包含全部 4 个 IP（批量创建为纯库写入，单条失败不阻塞其余）
      await createBtn.click()
      const imported = await listImportedNodes(request, headers)
      const createdIps = imported.map((n) => n.ip)
      for (const ip of IMPORT_IPS) {
        expect(createdIps, `节点 ${ip} 应出现在节点列表 API`).toContain(ip)
      }
    } finally {
      // teardown：清理本用例创建 + 历史遗留的 10.99.99.x 节点。
      // delete_db=true 仅清库，不触达 Edge 节点（这些 IP 本就不存在真实主机）。
      const stale = await listImportedNodes(request, headers)
      for (const node of stale) {
        const del = await request.delete(`${API_BASE}/clusters/${node.cluster_id}/nodes/${node.id}`, {
          headers,
          data: { delete_db: true, delete_edge: false },
        })
        expect(del.status(), `清理节点 ${node.ip} 应成功`).toBe(200)
      }
      const remaining = await listImportedNodes(request, headers)
      expect(remaining, 'teardown 后不应残留 10.99.99.x 节点').toHaveLength(0)
    }
  })

  test('CSV template download button exists', async ({ page }) => {
    const modal = await openNodeAddModal(page)

    const batchBtn = modal.locator('button').filter({ hasText: '批量导入' }).first()
    await batchBtn.click()

    const csvTab = modal.locator('button').filter({ hasText: 'CSV 上传' }).first()
    await csvTab.click()

    const downloadBtn = modal.locator('button').filter({ hasText: '下载模板' }).first()
    await expect(downloadBtn).toBeVisible({ timeout: 5000 })
  })

  // 「copy button opens add modal」用例已删除：原用例无任何断言（isVisible 后仅 skip），零判别力。
})
