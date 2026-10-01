import { test, expect, type Page } from '@playwright/test'
import { login } from './helpers/navigation'

/**
 * 会话过期守卫（审计卡片 F2-NEW-02，B2 批次 lane C）
 *
 * 机制（读码所得）：
 * - src/stores/auth.ts：token/user/permissions 存 localStorage（键名 `token`/`user`/`permissions`）；
 *   clearSession() 是会话清理的单一实现（复位 store + 清空三键），401 拦截器与 logout 共用。
 * - src/api/index.ts 响应拦截器：非 /auth/login 的 401 → clearSession()
 *   + message.error('登录状态已失效，请重新登录') + router.push('/login')。
 * - src/router/index.ts beforeEach 守卫：目标非 /login 且 localStorage 无 token → 重定向 /login。
 *
 * src/__tests__/auth-session.test.ts 已在单测层（fake adapter）覆盖 401 清理语义；
 * 本 spec 验证真实浏览器端到端：后端对无效 token 返回 401（curl 实测 `{"detail":"未认证"}`），
 * 前端必须自动跳回登录页且不白屏。
 */

const NAV_WAIT = { timeout: 15_000 }

/** 收集未捕获页面异常，测试末尾统一断言（白屏/崩溃守卫） */
function trackPageErrors(page: Page): Error[] {
  const errors: Error[] = []
  page.on('pageerror', (err) => errors.push(err))
  return errors
}

test.describe('会话过期守卫（F2-NEW-02）', () => {
  test('API 401 后自动清除会话并跳回登录页，不白屏', async ({ page }) => {
    const pageErrors = trackPageErrors(page)

    // ① UI 正常登录进入 /
    await login(page)

    // ② 篡改 token 模拟失效：保留 user/permissions（路由守卫与页面挂载照常），仅让鉴权请求必 401
    await page.evaluate(() => localStorage.setItem('token', 'e2e-expired-token'))

    // ③ 进入受保护列表页，挂载后触发 GET /api/v1/clusters → 401 → 拦截器跳 /login
    await page.goto('/clusters')
    // 失败时 Playwright 会附带当前 URL，若未跳转可据此定位卡在哪一页
    await page.waitForURL('**/login', NAV_WAIT)
    expect(new URL(page.url()).pathname).toBe('/login')

    // ④ 拦截器行为锚定：会话三键被 clearSession 清空（真实浏览器里的清理语义）
    const storage = await page.evaluate(() => ({
      token: localStorage.getItem('token'),
      user: localStorage.getItem('user'),
      permissions: localStorage.getItem('permissions'),
    }))
    expect(storage.token).toBeNull()
    expect(storage.user).toBeNull()
    expect(storage.permissions).toBeNull()

    // 用户可见反馈（非静默踢出）。注意：拦截器对每个 401 响应各弹一次 toast（无去重），
    // /clusters 页挂载期有多个鉴权请求并发失败，会叠 2+ 条相同提示 → 锚定"至少一条可见"。
    await expect(page.getByText('登录状态已失效，请重新登录').first()).toBeVisible()

    // 约定 #1：登录表单 id 选择器契约（Playwright 依赖 #username/#password）
    await expect(page.locator('input#username')).toBeVisible()
    await expect(page.locator('input#password')).toBeVisible()

    expect(pageErrors).toEqual([])
  })

  test('无 token 直接访问受保护页被路由守卫拦回 /login', async ({ page }) => {
    const pageErrors = trackPageErrors(page)

    // 全新 context 无任何 localStorage：守卫在路由解析期直接重定向，不发鉴权请求
    await page.goto('/clusters')
    await page.waitForURL('**/login', NAV_WAIT)
    expect(new URL(page.url()).pathname).toBe('/login')
    await expect(page.locator('input#username')).toBeVisible()
    await expect(page.locator('input#password')).toBeVisible()

    expect(pageErrors).toEqual([])
  })

  test('会话被 401 清理后可重新正常登录（反向对照）', async ({ page }) => {
    const pageErrors = trackPageErrors(page)

    // 复现过期路径：登录 → token 失效 → 401 踢回登录页
    await login(page)
    await page.evaluate(() => localStorage.setItem('token', 'e2e-expired-token'))
    await page.goto('/clusters')
    await page.waitForURL('**/login', NAV_WAIT)

    // 从被踢回的登录页立即用正确凭据恢复会话
    await page.fill('#username', 'admin')
    await page.fill('#password', 'panshi123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/', NAV_WAIT)

    // 正向控制：新 token 真实有效——同一受保护页的鉴权请求应 200，页面停留不被再踢回
    const clustersResp = page.waitForResponse(
      (resp) => resp.url().includes('/api/v1/clusters') && resp.request().method() === 'GET',
      NAV_WAIT,
    )
    await page.goto('/clusters')
    const resp = await clustersResp
    expect(resp.status()).toBe(200)
    await expect(page).toHaveURL(/\/clusters/, NAV_WAIT)

    expect(pageErrors).toEqual([])
  })
})
