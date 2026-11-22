/**
 * 中继区域管理 · 「配置跳板转发」SSE 流呈现（批次 B6）。
 *
 * 该动作以 root 在网关机写 sshd drop-in（`sshd -t` 校验 + 失败自动回滚），属于
 * **真实 SSH 写操作**——UI e2e 全部桩掉，永不触网；回滚/降级/校验逻辑由
 * backend/tests/test_relay_sshd*.py 覆盖，本 spec 只验前端：
 * root 凭据仅本次提交、流式进度与终态提示、成功后自动复检、失败提示文案。
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

const ROOT_PASSWORD = 'root-secret-e2e'

const SSHD_LINES = [
  'PLAY [relay_sshd] ***********************************************',
  'TASK [备份现有 drop-in 并写入 relay-tunnel.conf] ****************',
  'changed: [gateway] => {"backup": "relay-tunnel.conf.bak"}',
  'TASK [sshd -t 语法校验] *****************************************',
  'ok: [gateway] => {"rc": 0}',
  'TASK [reload sshd] **********************************************',
  'changed: [gateway] => {"reloaded": true}',
]

test.describe('中继区域管理 · 配置跳板转发（SSE 桩）', () => {
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

  test('成功流：root 凭据仅本次提交 → 抽屉终态高亮 → 自动复检 → 凭据不保留', async ({ page }) => {
    const sse = await stubSseStream(page, '/relay/gateways/1/sshd-setup', {
      events: sseSuccess({ lines: SSHD_LINES, hostsPattern: 'gateways_e2e-a' }),
    })

    await openRowMenuItem(page, 'e2e-a', '配置跳板转发')
    const modal = confirmModal(page, '配置跳板转发')
    await expect(modal).toBeVisible()
    await expect(modal.locator('.modal-header h2')).toHaveText('配置跳板转发 · E2E 甲局')
    await expect(modal).toContainText('sshd_config.d/relay-tunnel.conf')
    // 未填 root 密码时「开始配置」禁用
    const start = modal.locator('.btn-primary', { hasText: '开始配置' })
    await expect(start).toBeDisabled()
    await expect(modal.locator('input[type="text"]')).toHaveValue('root')
    await modal.locator('input[type="password"]').fill(ROOT_PASSWORD)
    await expect(start).toBeEnabled()

    await start.click()

    const drawer = execDrawer(page)
    await expect(drawer).toBeVisible()
    await expect(drawer.locator('.modal-header h2')).toHaveText('配置跳板转发 - E2E 甲局')
    await expect(drawer.locator('.progress-bar')).toHaveClass(/progress-success/, { timeout: 15000 })
    await expect(drawer).toContainText('配置跳板转发完成：gateways_e2e-a')
    await expect(page.locator('.ant-message')).toContainText('配置跳板转发完成（gateways_e2e-a）')

    // 载荷：root 凭据随本次请求提交（不落库、不进命令行）
    expect(sse.requests).toHaveLength(1)
    expect(sse.requests[0].body).toMatchObject({ root_user: 'root', root_password: ROOT_PASSWORD })
    // 成功后自动复检（recheckAfterSshd → GET /relay/health-check?region=e2e-a）
    expect(stub.requests.some((r) => r.path.startsWith('/relay/health-check?region=e2e-a'))).toBe(true)

    // 口令不留存：关闭抽屉后重开弹窗，密码框为空
    await drawer.locator('.modal-footer button', { hasText: '关闭' }).click()
    await expect(drawer).toBeHidden()
    await openRowMenuItem(page, 'e2e-a', '配置跳板转发')
    await expect(confirmModal(page, '配置跳板转发').locator('input[type="password"]')).toHaveValue('')
  })

  test('失败流：校验失败文案透出，且不触发自动复检', async ({ page }) => {
    await stubSseStream(page, '/relay/gateways/1/sshd-setup', {
      events: sseFailure({
        lines: ['PLAY [relay_sshd] ***********************************************'],
        stderrLines: [
          'fatal: [gateway]: FAILED! => {"msg": "sshd -t 校验失败（bad port number in permitopen），已回滚 drop-in"}',
        ],
      }),
    })

    await openRowMenuItem(page, 'e2e-a', '配置跳板转发')
    const modal = confirmModal(page, '配置跳板转发')
    await modal.locator('input[type="password"]').fill(ROOT_PASSWORD)
    await modal.locator('.btn-primary', { hasText: '开始配置' }).click()

    const drawer = execDrawer(page)
    await expect(drawer).toBeVisible()
    await expect(drawer.locator('.progress-bar')).toHaveClass(/progress-exception/)
    await expect(drawer).toContainText('配置跳板转发失败（rc=2，failed）')
    await expect(drawer, 'stderr 行应出现在执行日志中').toContainText('已回滚 drop-in')
    // 动作名三态（utils/relayActions）：sshd 失败须报「配置跳板转发失败」，不得沿用「下发失败」
    await expect(page.locator('.ant-message')).toContainText('配置跳板转发失败（rc=2），详见执行日志')

    // 失败不自动复检（只有 rc=0 才 recheckAfterSshd）
    expect(stub.requests.filter((r) => r.path.startsWith('/relay/health-check'))).toHaveLength(0)
    await drawer.locator('.modal-footer button', { hasText: '关闭' }).click()
    await expect(drawer).toBeHidden()
  })
})
