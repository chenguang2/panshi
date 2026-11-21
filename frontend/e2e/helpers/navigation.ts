import { expect, type Page } from '@playwright/test'

/** 标准登录（#username/#password id 为关键契约，勿改） */
export async function login(page: Page): Promise<void> {
  await page.goto('/login')
  await page.fill('#username', 'admin')
  await page.fill('#password', 'panshi123')
  await page.click('button[type="submit"]')
  await page.waitForURL('/')
}

/**
 * 资源标签 → 独立资源页路径（AGENTS #80①：造数/导航一律直连
 * `/{page}?cluster_id=<id>` 深链，不点集群卡片——卡片统计格 `.stat-cell` 已改
 * `@click` 进入统一管理并最大化，不再跳独立资源页，`.cl-stat-link` 已退场）。
 */
const RESOURCE_PATHS: Record<string, string> = {
  节点: '/nodes',
  上游: '/upstreams',
  路由: '/routes',
  插件组: '/plugin-configs',
  插件元数据: '/plugin-metadata',
  全局规则: '/global-rules',
  静态资源: '/static-resources',
}

/**
 * 取用于深链的集群 id：显式传参优先（造数场景指定集群），否则经 API 取列表首个集群
 * （与原实现「进入首张集群卡片」的语义等价）。
 *
 * 选型说明：应用鉴权走 localStorage token（非 cookie），故 `page.request` 不能裸用——
 * 从 page 上下文读出 token 后以 Authorization 头显式请求。`page.request` 继承
 * playwright.config 的 `use.baseURL`，因此相对路径 `/api/v1/...` 直接可用。
 */
async function resolveClusterId(page: Page, explicitClusterId?: number): Promise<number> {
  if (explicitClusterId !== undefined) return explicitClusterId

  const token = await page.evaluate(() => localStorage.getItem('token'))
  expect(token, '深链导航需要已登录会话（localStorage.token 缺失，请先 login(page)）').toBeTruthy()

  const res = await page.request.get('/api/v1/clusters?page=1&page_size=1', {
    headers: { Authorization: `Bearer ${token ?? ''}` },
  })
  expect(res.ok(), `GET /api/v1/clusters 应成功，实际 ${res.status()}`).toBeTruthy()
  const body = (await res.json()) as { items?: Array<{ id: number }> }
  const first = body.items?.[0]
  if (!first) throw new Error('环境中无任何集群，无法深链进入资源页（E2E 环境守卫应先行 skip）')
  return first.id
}

/**
 * 进入资源页（节点/上游/路由/插件组/插件元数据/全局规则/静态资源）。
 *
 * 实现口径（AGENTS #80①）：API 取集群 id → `page.goto('/xxx?cluster_id=<id>')` →
 * 等页面共享工具条 `.l5-toolbar` 可见（七页共用 `TableToolbar`，不用具体卡片/表格 DOM，
 * 避免再次被卡片改造带走）。
 *
 * @param statLabel 资源中文名（见 RESOURCE_PATHS）
 * @param clusterId 可选：指定集群（依赖特定集群数据的用例传造数集群 id）
 */
export async function gotoResourcePage(page: Page, statLabel: string, clusterId?: number): Promise<void> {
  const path = RESOURCE_PATHS[statLabel]
  expect(path, `未知资源标签「${statLabel}」（支持：${Object.keys(RESOURCE_PATHS).join('、')}）`).toBeTruthy()

  const id = await resolveClusterId(page, clusterId)
  await page.goto(`${path}?cluster_id=${id}`)
  await expect(
    page.locator('.l5-toolbar').first(),
    `「${statLabel}」页工具条应可见（深链 ${path}?cluster_id=${id}）`,
  ).toBeVisible({ timeout: 15000 })
  // 等首屏列表请求落定（这些列表页无轮询/SSE，networkidle 安全）：否则 helper 会在数据到达前返回，
  // 调用方对「AntD 空表占位行」的判断会把加载中误读成「无数据」而误 skip
  await page.waitForLoadState('networkidle').catch(() => {})
}
