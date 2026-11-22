/**
 * 中继区域管理 · 「初始化网关」SSE 流呈现（批次 B6）。
 *
 * 初始化 = 首次装机写入 8443 server 块 + 白名单（幂等）。本 spec 只验前端呈现：
 * 抽屉标题 / 用时字段 / 逐行日志 / 进度终态 / 关键信息，以及「未填 OpenResty 前缀
 * 时前端拦住不发请求」。ansible 真实性由 backend/tests/test_relay_init*.py 负责。
 */
import { expect, test } from '@playwright/test'
import { login } from './helpers/navigation'
import {
  confirmModal,
  execDrawer,
  openRelayTable,
  openRowMenuItem,
  relayRegion,
  sseFailure,
  sseSuccess,
  stubRelayApis,
  stubSseStream,
  type RelayStub,
} from './helpers/sseStub'

const INIT_LINES = [
  'PLAY [relay_init] ***********************************************',
  'TASK [渲染 relay_8443.conf] *************************************',
  'changed: [gateway] => {"path": "conf/relay_8443.conf"}',
  'TASK [nginx -t 校验并 reload] ***********************************',
  'ok: [gateway] => {"rc": 0, "stderr": ""}',
]

test.describe('中继区域管理 · 初始化网关（SSE 桩）', () => {
  let stub: RelayStub

  test.beforeEach(async ({ page }) => {
    stub = await stubRelayApis(page, {
      regions: [
        relayRegion({ id: 1, code: 'e2e-a', name: 'E2E 甲局' }),
        // 未填 OpenResty 前缀：初始化前置应被前端拦下（region-registry 兜底）
        relayRegion({ id: 3, code: 'e2e-c', name: 'E2E 丙局', openresty_prefix: null }),
      ],
    })
    await login(page)
    await openRelayTable(page)
  })

  test.afterEach(() => {
    // 硬约束：页面发出的每个 relay 路径都必须被桩覆盖（未覆盖即 501，写请求绝不 fallback 到真实后端）
    expect(stub.unmatched, `未覆盖的 relay 请求：${stub.unmatched.join('、')}`).toEqual([])
  })

  test('成功流：确认弹窗 → 抽屉标题/用时字段 → 进度 100% → 完成高亮与提示', async ({ page }) => {
    await stubSseStream(page, '/relay/gateways/1/init', {
      events: sseSuccess({ lines: INIT_LINES, hostsPattern: 'gateways_e2e-a', listenPort: 8443 }),
      delayMs: 1200,
    })

    await openRowMenuItem(page, 'e2e-a', '初始化网关')
    const confirm = confirmModal(page, '初始化网关')
    await expect(confirm).toBeVisible()
    await expect(confirm).toContainText('将 8443 监听 server 块与当前白名单写入「E2E 甲局」网关机')
    await expect(confirm).toContainText('OpenResty 前缀：/opt/e2e/openresty/nginx')
    await confirm.locator('.btn-primary', { hasText: '开始初始化' }).click()

    const drawer = execDrawer(page)
    await expect(drawer).toBeVisible()
    await expect(drawer.locator('.modal-header h2'), '抽屉标题应带动作与区域名').toHaveText('初始化网关 - E2E 甲局')
    // 用时字段（startElapsedTimer 每秒刷新，显示「已用 N 秒」）
    await expect(drawer.getByText(/已用 \d+ 秒/)).toBeVisible({ timeout: 5000 })
    // 流开始前仍是 0%
    await expect(drawer.locator('.progress-bar')).toHaveAttribute('style', /width:\s*0%/)

    await expect(drawer.locator('.progress-bar')).toHaveAttribute('style', /width:\s*100%/, { timeout: 15000 })
    await expect(drawer.locator('.progress-bar')).toHaveClass(/progress-success/)
    for (const line of INIT_LINES) {
      await expect(drawer, `执行日志应包含「${line}」`).toContainText(line)
    }
    await expect(drawer).toContainText('初始化完成：gateways_e2e-a，监听 8443')
    await expect(page.locator('.ant-message')).toContainText('初始化完成（gateways_e2e-a，监听 8443）')
    // 请求落在 init 端点且空载荷（未透传任何危险参数）
    expect(stub.requests.filter((r) => r.path === '/relay/gateways/1/init')).toHaveLength(1)
  })

  test('失败流：异常态 + 初始化失败提示（rc 透出）', async ({ page }) => {
    await stubSseStream(page, '/relay/gateways/1/init', {
      events: sseFailure({
        lines: ['PLAY [relay_init] ***********************************************'],
        stderrLines: ['fatal: [gateway]: FAILED! => {"msg": "nginx -t 校验失败：duplicate listen 8443"}'],
      }),
    })

    await openRowMenuItem(page, 'e2e-a', '初始化网关')
    await confirmModal(page, '初始化网关').locator('.btn-primary', { hasText: '开始初始化' }).click()

    const drawer = execDrawer(page)
    await expect(drawer).toBeVisible()
    await expect(drawer.locator('.progress-bar')).toHaveClass(/progress-exception/)
    await expect(drawer).toContainText('执行失败（rc=2，failed）')
    await expect(drawer).toContainText('nginx -t 校验失败：duplicate listen 8443')
    await expect(page.locator('.ant-message')).toContainText('初始化失败（rc=2），详见执行日志')
  })

  test('未填 OpenResty 前缀：前端拦住并提示，不发任何流请求', async ({ page }) => {
    await openRowMenuItem(page, 'e2e-c', '初始化网关')
    await confirmModal(page, '初始化网关').locator('.btn-primary', { hasText: '开始初始化' }).click()

    await expect(page.locator('.ant-message')).toContainText('区域未配置 OpenResty 前缀，请先编辑区域填写')
    await expect(execDrawer(page)).toBeHidden()
    expect(stub.requests.filter((r) => r.path.includes('/init'))).toHaveLength(0)
  })
})
