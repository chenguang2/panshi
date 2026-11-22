/**
 * 中继区域管理 · 同区域并发 409（批次 B6）。
 *
 * 后端 `_INFLIGHT` 守卫（region 级）在流开始前返回 409 —— 真实加锁/释放逻辑由
 * backend/tests/test_relay_concurrency*.py 覆盖；本 spec 只验**前端呈现**：
 * 中文提示透出、抽屉进入错误态但可关闭、行内按钮不停在「下发中…」、页面无未捕获异常。
 */
import { expect, test } from '@playwright/test'
import { login } from './helpers/navigation'
import {
  confirmModal,
  execDrawer,
  openRelayTable,
  openRowMenuItem,
  regionRow,
  relayRegion,
  sseConflictDetail,
  stubRelayApis,
  stubSseStream,
  type RelayStub,
} from './helpers/sseStub'

test.describe('中继区域管理 · 并发 409（SSE 桩返回 409）', () => {
  let stub: RelayStub

  test.beforeEach(async ({ page }) => {
    stub = await stubRelayApis(page, { regions: [relayRegion({ id: 1, code: 'e2e-a', name: 'E2E 甲局' })] })
    await login(page)
    await openRelayTable(page)
  })

  test.afterEach(() => {
    // 硬约束：页面发出的每个 relay 路径都必须被桩覆盖（未覆盖即 501，写请求绝不 fallback 到真实后端）
    expect(stub.unmatched, `未覆盖的 relay 请求：${stub.unmatched.join('、')}`).toEqual([])
  })

  test('下发配置 409：中文提示 + 错误态可关闭 + 行内按钮复位 + 无未捕获异常', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (e) => pageErrors.push(e.message))

    const detail = sseConflictDetail('e2e-a')
    await stubSseStream(page, '/relay/gateways/1/push-config', {
      events: [],
      status: 409,
      errorDetail: detail,
    })

    await regionRow(page, 'e2e-a').locator('button', { hasText: '下发配置' }).click()
    await confirmModal(page, '下发网关配置').locator('.btn-primary', { hasText: '开始下发' }).click()

    // ① 提示文案：toast + 抽屉错误横幅都是后端 detail（不是白屏、不是「请求失败 (409)」兜底）
    await expect(page.locator('.ant-message')).toContainText(detail)
    const drawer = execDrawer(page)
    await expect(drawer).toBeVisible()
    await expect(drawer).toContainText(detail)

    // ② 不进入流式态：进度未推进、无成功高亮，底部是「关闭」而非「取消安装」
    await expect(drawer.locator('.progress-bar')).toHaveAttribute('style', /width:\s*0%/)
    await expect(drawer.locator('.progress-bar')).not.toHaveClass(/progress-success/)
    await expect(drawer.locator('.modal-footer button', { hasText: '取消安装' })).toHaveCount(0)
    await expect(drawer.locator('.modal-footer button', { hasText: '关闭' })).toBeVisible()

    // ③ 页面仍可用：表格在、行内按钮恢复可点（未卡在「下发中…」）
    await expect(page.locator('.region-table')).toBeVisible()
    const pushButton = regionRow(page, 'e2e-a').locator('button', { hasText: /^下发配置$/ })
    await expect(pushButton).toBeVisible()
    await expect(pushButton).toBeEnabled()

    await drawer.locator('.modal-footer button', { hasText: '关闭' }).click()
    await expect(drawer).toBeHidden()
    expect(pageErrors, `页面不应抛未捕获异常，实际：${pageErrors.join(' | ')}`).toEqual([])
  })

  test('初始化网关 409：同一区域并发提示一致，菜单动作未被锁死', async ({ page }) => {
    await stubSseStream(page, '/relay/gateways/1/init', {
      events: [],
      status: 409,
      errorDetail: sseConflictDetail('e2e-a'),
    })

    await openRowMenuItem(page, 'e2e-a', '初始化网关')
    await confirmModal(page, '初始化网关').locator('.btn-primary', { hasText: '开始初始化' }).click()

    await expect(page.locator('.ant-message')).toContainText('已有进行中的初始化/下发任务')
    const drawer = execDrawer(page)
    await expect(drawer).toBeVisible()
    await expect(drawer).toContainText(sseConflictDetail('e2e-a'))
    await drawer.locator('.modal-footer button', { hasText: '关闭' }).click()
    await expect(drawer).toBeHidden()

    // 失败后仍可再次打开菜单（activeId/activeKind 已清空，流式按钮不再全局禁用）
    await openRowMenuItem(page, 'e2e-a', '查看配置')
    await expect(confirmModal(page, '配置预览')).toBeVisible()
  })
})
