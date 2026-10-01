import { test, expect } from '@playwright/test'
import { login, gotoResourcePage } from './helpers/navigation'
import { apiJson } from './helpers/destructiveFlow'

test.describe('静态资源上传', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('静态资源页有上传 ZIP 行内按钮', async ({ page }) => {
    await gotoResourcePage(page, '静态资源')
    const pageRoot = page.locator('.sr-card, .sr-empty')
    await expect(pageRoot.first()).toBeVisible({ timeout: 10000 })

    // 行内上传按钮存在（无资源时为空态——跳过）
    const firstCard = page.locator('.sr-card').first()
    const hasCard = await firstCard.isVisible({ timeout: 3000 }).catch(() => false)
    if (!hasCard) {
      test.skip('无静态资源数据')
      return
    }
    await expect(firstCard.locator('button:has-text("上传 ZIP")')).toBeVisible()
  })

  test('API 返回格式包含 storage_path', async ({ request }) => {
    // F5：手写登录样板（硬编码 9100 + 裸 .json() 不校验 2xx）收敛到 destructiveFlow 共享 helper
    // （apiJson 内部经 apiHeaders 登录，非 2xx 显式抛错并附响应体）
    const body = await apiJson<{ items: Array<Record<string, unknown>> }>(
      request,
      'GET',
      '/clusters/1/static-resources',
    )
    // F4：items 为空说明环境无静态资源数据，优雅 skip（与上方用例守卫风格对齐）
    if (!body.items || body.items.length === 0) {
      test.skip('无静态资源数据')
      return
    }
    for (const item of body.items) {
      expect(item).toHaveProperty('storage_path')
    }
  })
})
