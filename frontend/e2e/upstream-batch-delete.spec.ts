import { test, expect } from '@playwright/test'
import {
  apiHeaders,
  apiJson,
  checkRowsByContent,
  cleanupUpstreamsByPrefix,
  expectAntModal,
  filterTableBySearch,
  interceptBatchDelete,
  openClusterTab,
  skipIfNoCluster,
  uniqueName,
  type ClusterRef,
} from './helpers/destructiveFlow'
import { login as uiLogin } from './helpers/navigation'

test.describe('Upstream Batch Delete E2E（route 拦截：不触达真实删除）', () => {
  let cluster: ClusterRef
  let headers: Record<string, string>
  let prefix: string
  let created: Array<{ id: number; name: string }>

  test.beforeEach(async ({ page, request }) => {
    cluster = (await skipIfNoCluster(request)) as ClusterRef
    if (!cluster) return
    headers = await apiHeaders(request)
    await uiLogin(page)

    // 造数：两条唯一名测试上游（demo 库上游 170 条，靠唯一前缀搜索锁定）
    prefix = uniqueName('e2e-bd-u')
    created = []
    for (const suffix of ['-1', '-2']) {
      const upstream = await apiJson<{ id: number; name: string }>(
        request,
        'POST',
        `/clusters/${cluster.id}/upstreams`,
        { name: `${prefix}${suffix}`, targets: [{ target: '127.0.0.1:18080', weight: 100 }] },
        headers,
      )
      created.push(upstream)
    }
  })

  test.afterEach(async ({ request }) => {
    if (!cluster) return
    await cleanupUpstreamsByPrefix(request, headers, cluster.id, 'e2e-bd-u-')
  })

  test('batch delete flow: check own rows, confirm, intercepted payload + UI progress, zero backend effect', async ({
    page,
    request,
  }) => {
    const table = await openClusterTab(page, cluster, '上游')
    await filterTableBySearch(page, table, '搜索上游', prefix)
    await checkRowsByContent(
      table,
      created.map((u) => u.name),
    )

    // 删除按钮显示勾选计数；多选时单选操作按钮禁用
    const deleteBtn = page.locator('.node-actions button').filter({ hasText: '删除上游' }).first()
    await expect(deleteBtn).toContainText('(2)')
    const editBtn = page.locator('.node-actions button').filter({ hasText: '编辑上游' }).first()
    await expect(editBtn).toBeDisabled()

    // 拦截批量删除端点（DELETE /clusters/{id}/upstreams 集合端点，cluster_upstreams.py:223）
    const names = new Map(created.map((u) => [u.id, u.name]))
    const captured = await interceptBatchDelete(page, cluster.id, 'upstreams', {
      idField: 'upstream_ids',
      resultIdField: 'upstream_id',
      resultNameField: 'upstream_name',
      label: '上游',
      names,
    })

    await deleteBtn.click()
    const modal = await expectAntModal(page, /确认删除/, '删除确认弹窗')
    await modal.locator('label').filter({ hasText: '数据库' }).first().locator('input[type="checkbox"]').check()
    await modal.locator('button.ant-btn-dangerous').last().click()

    const progress = await expectAntModal(page, new RegExp(`批量删除上游: `), '批量删除进度弹窗')
    for (const u of created) {
      await expect(progress.locator('.ant-modal-body')).toContainText(`删除上游 ${u.name}: 数据库✅`)
    }
    await expect(progress.locator('.ant-modal-body')).toContainText('✅ 批量删除完成!')

    // 载荷断言：仅含被勾选的两条造数上游，未误伤真实上游
    expect(captured).toHaveLength(1)
    expect(captured[0].body.delete_db).toBe(true)
    expect(captured[0].body.delete_edge).toBe(false)
    expect([...((captured[0].body.upstream_ids as number[]) || [])].sort()).toEqual(created.map((u) => u.id).sort())

    // 完成后选择被清空
    const deleteBtnAfter = page.locator('.node-actions button').filter({ hasText: '删除上游' }).first()
    await expect(deleteBtnAfter).toBeVisible({ timeout: 5000 })
    await expect.poll(async () => (await deleteBtnAfter.textContent()) || '', { timeout: 15000 }).not.toContain('(')

    // 拦截生效证据：真实后端零副作用——两条测试上游仍然存在
    const list = await apiJson<{ items: Array<{ id: number }> }>(
      request,
      'GET',
      `/clusters/${cluster.id}/upstreams?search=${encodeURIComponent(prefix)}&page_size=100`,
      undefined,
      headers,
    )
    expect(list.items.map((u) => u.id).sort(), '拦截应阻止真实删除').toEqual(created.map((u) => u.id).sort())
  })

  test('search clears batch selection (D9)', async ({ page }) => {
    const table = await openClusterTab(page, cluster, '上游')
    await filterTableBySearch(page, table, '搜索上游', prefix)
    await checkRowsByContent(table, [created[0].name])

    const deleteBtn = page.locator('.node-actions button').filter({ hasText: '删除上游' }).first()
    await expect(deleteBtn).toContainText('(1)')

    await filterTableBySearch(page, table, '搜索上游', '__no_such_upstream__', false)
    const deleteBtnAfter = page.locator('.node-actions button').filter({ hasText: '删除上游' }).first()
    await expect.poll(async () => (await deleteBtnAfter.textContent()) || '', { timeout: 15000 }).not.toContain('(')
  })
})
