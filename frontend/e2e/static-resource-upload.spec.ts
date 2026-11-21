import { test, expect } from '@playwright/test'
import { login, gotoResourcePage } from './helpers/navigation'
import { apiHeaders, apiJson } from './helpers/destructiveFlow'

test.describe('静态资源上传', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('静态资源卡片动作菜单有上传 ZIP 入口', async ({ page }) => {
    await gotoResourcePage(page, '静态资源')
    const pageRoot = page.locator('.sr-card, .sr-empty')
    await expect(pageRoot.first()).toBeVisible({ timeout: 10000 })

    // 深链按首集群过滤，而静态资源常只存在于个别集群 → 空页时退回全集群视图（该用例断言的是
    // 上传入口位置，不依赖特定集群；导航本身已由上面 helper 的深链断言覆盖）
    if (
      !(await page
        .locator('.sr-card')
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false))
    ) {
      await page.goto('/static-resources')
      await expect(pageRoot.first()).toBeVisible({ timeout: 10000 })
    }

    // 行内上传按钮已退场：卡片页动作统一收进 ⋯ 三栏菜单（AGENTS #81「动作菜单三栏结构」），
    // 静态资源的「上传 ZIP / 替换 ZIP」入口按记录门控（file_size / 上传中 / broken）
    const firstCard = page.locator('.sr-card').first()
    const hasCard = await firstCard.isVisible({ timeout: 3000 }).catch(() => false)
    if (!hasCard) {
      test.skip('无静态资源数据')
      return
    }
    await firstCard.locator('.op-btn[aria-label="更多操作"]').click()
    const menu = firstCard.locator('.l5-menu.open')
    await expect(menu).toBeVisible({ timeout: 5000 })
    await expect(menu.locator('button.mi', { hasText: /上传 ZIP|替换 ZIP/ }).first()).toBeVisible()
  })

  test('API 返回格式包含 storage_path', async ({ request }) => {
    // F5：手写登录样板（硬编码 9100 + 裸 .json() 不校验 2xx）收敛到 destructiveFlow 共享 helper
    // （apiJson 内部经 apiHeaders 登录，非 2xx 显式抛错并附响应体）
    const headers = await apiHeaders(request)
    // 静态资源只存在于个别集群：逐个集群探测（只读）找到有数据者，避免固定 cluster 1 恒空跳过
    const clusters = await apiJson<{ items: Array<{ id: number }> }>(
      request,
      'GET',
      '/clusters?page_size=100',
      undefined,
      headers,
    )
    let items: Array<Record<string, unknown>> = []
    for (const cluster of clusters.items || []) {
      const body = await apiJson<{ items: Array<Record<string, unknown>> }>(
        request,
        'GET',
        `/clusters/${cluster.id}/static-resources`,
        undefined,
        headers,
      )
      if (body.items && body.items.length > 0) {
        items = body.items
        break
      }
    }
    // 全环境无静态资源数据 → 优雅 skip（与上方用例守卫风格对齐）
    if (items.length === 0) {
      test.skip('无静态资源数据')
      return
    }
    for (const item of items) {
      expect(item).toHaveProperty('storage_path')
    }
  })
})
