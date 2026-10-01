import { test, expect } from '@playwright/test'
import {
  apiHeaders,
  apiJson,
  checkRowsByContent,
  cleanupNodesByIps,
  expectAntModal,
  filterTableBySearch,
  interceptBatchDelete,
  openClusterTab,
  skipIfNoCluster,
  type ClusterRef,
} from './helpers/destructiveFlow'
import { login as uiLogin } from './helpers/navigation'

// E2E 保留 IP 段（与 node-batch-import 的 10.99.99.x、node-batch-action 的 10.99.97.x 互不重叠）
const SEGMENT = ['10.99.96.1', '10.99.96.2']

test.describe('Node Batch Delete E2E（route 拦截：不触达真实删除）', () => {
  let cluster: ClusterRef
  let headers: Record<string, string>
  let createdIds: number[]
  let names: Map<number, string>

  test.beforeEach(async ({ page, request }) => {
    cluster = (await skipIfNoCluster(request)) as ClusterRef
    if (!cluster) return
    headers = await apiHeaders(request)
    await uiLogin(page)

    // 造数：本 spec 专属测试节点（teardown 清扫本段 IP，含历史遗留）
    createdIds = []
    names = new Map()
    for (const ip of SEGMENT) {
      const node = await apiJson<{ id: number; ip: string }>(
        request,
        'POST',
        `/clusters/${cluster.id}/nodes`,
        { ip, edge_path: `/e2e-node-${ip.split('.').pop()}`, service_port: 80 },
        headers,
      )
      createdIds.push(node.id)
      names.set(node.id, node.ip)
    }
  })

  test.afterEach(async ({ request }) => {
    if (!cluster) return
    await cleanupNodesByIps(request, headers, SEGMENT)
  })

  test('batch delete flow: check own rows, confirm, intercepted payload + UI progress, zero backend effect', async ({
    page,
    request,
  }) => {
    const table = await openClusterTab(page, cluster, '节点')
    await checkRowsByContent(table, SEGMENT)

    // 删除按钮显示勾选计数
    const deleteBtn = page.locator('.node-actions button').filter({ hasText: '删除' }).first()
    await expect(deleteBtn).toContainText('(2)')

    // 多选时单选操作按钮禁用
    const editBtn = page.locator('.node-actions button').filter({ hasText: '编辑' }).first()
    await expect(editBtn).toBeDisabled()

    // 拦截批量删除端点（DELETE /clusters/{id}/nodes 集合端点）
    const captured = await interceptBatchDelete(page, cluster.id, 'nodes', {
      idField: 'node_ids',
      resultIdField: 'node_id',
      resultNameField: 'node_ip',
      label: '节点',
      names,
    })

    await deleteBtn.click()
    const modal = await expectAntModal(page, /确认删除/, '删除确认弹窗')
    await modal.locator('label').filter({ hasText: '数据库' }).first().locator('input[type="checkbox"]').check()
    await modal.locator('button.ant-btn-dangerous').last().click()

    // 进度弹窗按后端成功形状渲染逐节点日志 + 完成态
    const progress = await expectAntModal(page, new RegExp(`批量删除节点: `), '批量删除进度弹窗')
    for (const ip of SEGMENT) {
      await expect(progress.locator('.ant-modal-body')).toContainText(`删除节点 ${ip}: 数据库✅`)
    }
    await expect(progress.locator('.ant-modal-body')).toContainText('✅ 批量删除完成!')

    // 载荷断言：仅含被勾选的造数节点，未误伤真实节点；仅勾选了"数据库"
    expect(captured).toHaveLength(1)
    expect(captured[0].body.delete_db).toBe(true)
    expect(captured[0].body.delete_edge).toBe(false)
    expect([...((captured[0].body.node_ids as number[]) || [])].sort()).toEqual([...createdIds].sort())

    // 完成后选择被清空
    const deleteBtnAfter = page.locator('.node-actions button').filter({ hasText: '删除' }).first()
    await expect(deleteBtnAfter).toBeVisible({ timeout: 5000 })
    await expect.poll(async () => (await deleteBtnAfter.textContent()) || '', { timeout: 15000 }).not.toContain('(')

    // 拦截生效证据：真实后端零副作用——两个测试节点仍然存在
    const list = await apiJson<{ items: Array<{ ip: string }> }>(
      request,
      'GET',
      `/clusters/${cluster.id}/nodes?page_size=100`,
      undefined,
      headers,
    )
    const ips = list.items.map((n) => n.ip)
    for (const ip of SEGMENT) expect(ips, `拦截应阻止真实删除：${ip} 仍应在库`).toContain(ip)
  })

  test('search clears batch selection (D8)', async ({ page }) => {
    const table = await openClusterTab(page, cluster, '节点')
    await checkRowsByContent(table, [SEGMENT[0]])
    const deleteBtn = page.locator('.node-actions button').filter({ hasText: '删除' }).first()
    await expect(deleteBtn).toContainText('(1)')

    await filterTableBySearch(page, table, '搜索节点', '__no_such_node__', false)
    const deleteBtnAfter = page.locator('.node-actions button').filter({ hasText: '删除' }).first()
    await expect.poll(async () => (await deleteBtnAfter.textContent()) || '', { timeout: 15000 }).not.toContain('(')
  })
})
