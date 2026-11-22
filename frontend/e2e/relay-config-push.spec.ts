/**
 * 中继区域管理 · 「下发配置」SSE 流呈现（批次 B6）。
 *
 * 下发端点在浏览器内被 `stubSseStream` 接管：成功流（rc:0）/ 失败流（rc:2）/
 * 空白名单危险确认。**不连真实网关、不跑 ansible**——ansible 真实行为见
 * backend/tests/test_relay_push*.py。
 *
 * 观察口径（Playwright 无法分段推送响应体，整段事件一次到达）：
 * - 「流开始前」态：桩带 delayMs，抽屉已开、进度仍为 0%（`.progress-bar` 宽 0%）；
 * - 「终态」：进度 100% + `progress-success`/`progress-exception` + 关键信息高亮。
 */
import { expect, test } from '@playwright/test'
import { login } from './helpers/navigation'
import {
  confirmModal,
  execDrawer,
  openRelayTable,
  regionRow,
  relayRegion,
  sseFailure,
  sseSuccess,
  stubRelayApis,
  stubSseStream,
  type RelayStub,
} from './helpers/sseStub'

/** 下发 playbook 的典型 stdout 行（4 行，满足「≥3 行逐行追加」） */
const PUSH_LINES = [
  'PLAY [relay_push] ***********************************************',
  'TASK [渲染护城河白名单 edge_targets.conf] ***********************',
  'ok: [gateway] => {"changed": false, "mode": "0644"}',
  'TASK [reload nginx if changed] **********************************',
  'changed: [gateway] => {"reloaded": true}',
]

const REGIONS = [
  relayRegion({ id: 1, code: 'e2e-a', name: 'E2E 甲局', enabled_node_count: 3, total_node_count: 4 }),
  relayRegion({ id: 2, code: 'e2e-b', name: 'E2E 乙局', enabled_node_count: 0, total_node_count: 1 }),
]

test.describe('中继区域管理 · 下发配置（SSE 桩）', () => {
  let stub: RelayStub

  test.beforeEach(async ({ page }) => {
    stub = await stubRelayApis(page, { regions: REGIONS })
    await login(page)
    await openRelayTable(page)
  })

  test.afterEach(() => {
    // 硬约束：页面发出的每个 relay 路径都必须被桩覆盖（未覆盖即 501，写请求绝不 fallback 到真实后端）
    expect(stub.unmatched, `未覆盖的 relay 请求：${stub.unmatched.join('、')}`).toEqual([])
  })

  test('成功流：确认弹窗 → 抽屉逐行追加 → 进度 0%→100% → 终态高亮 → 关闭复位', async ({ page }) => {
    await stubSseStream(page, '/relay/gateways/1/push-config', {
      events: sseSuccess({ lines: PUSH_LINES, hostsPattern: 'gateways_e2e-a' }),
      // 延迟窗口用于断言「流开始前」仍是 0%（真实流式时逐帧推进，此处只能抓两端）
      delayMs: 1500,
    })

    await regionRow(page, 'e2e-a').locator('button', { hasText: '下发配置' }).click()
    const confirm = confirmModal(page, '下发网关配置')
    await expect(confirm).toBeVisible()
    await expect(confirm).toContainText('本次将下发 3 个启用节点（共 4 个节点；全量替换')
    await expect(confirm).toContainText('该区域尚无成功下发记录，本次为首次写入白名单')
    // 范围说明（relay-push-scope-hint）：下发只写 nginx 白名单，sshd 另走「配置跳板转发」
    await expect(confirm).toContainText('本次下发仅更新流量白名单（nginx）。SSH 跳板转发需另行使用「配置跳板转发」。')
    await confirm.locator('.btn-primary', { hasText: '开始下发' }).click()

    const drawer = execDrawer(page)
    await expect(drawer).toBeVisible()
    await expect(drawer.locator('.modal-header h2')).toHaveText('下发配置 - E2E 甲局')

    // 流开始前：进度条宽度 0%（未跳到终态）
    await expect(drawer.locator('.progress-bar')).toHaveAttribute('style', /width:\s*0%/)
    await expect(drawer).not.toContainText('100%')

    // 终态：100% + success 类 + 逐行 stdout
    await expect(drawer.locator('.progress-bar')).toHaveAttribute('style', /width:\s*100%/, { timeout: 15000 })
    await expect(drawer.locator('.progress-bar')).toHaveClass(/progress-success/)
    for (const line of PUSH_LINES) {
      await expect(drawer, `执行日志应逐行包含「${line}」`).toContainText(line)
    }
    await expect(drawer, '终态关键信息应带区域清单分组名').toContainText('下发配置完成：gateways_e2e-a')
    await expect(page.locator('.ant-message')).toContainText('下发配置完成（gateways_e2e-a）')
    // 执行结束后行内按钮复位（不再停留在「下发中…」）
    await expect(regionRow(page, 'e2e-a').locator('button', { hasText: '下发配置' })).toBeEnabled()

    // 关闭 → 抽屉隐藏；再开一次应为空白复位态（无上次日志、进度归零）
    await drawer.locator('.modal-footer button', { hasText: '关闭' }).click()
    await expect(drawer).toBeHidden()

    await stubSseStream(page, '/relay/gateways/1/push-config', {
      events: sseSuccess({ lines: PUSH_LINES, hostsPattern: 'gateways_e2e-a' }),
      delayMs: 4000,
    })
    await regionRow(page, 'e2e-a').locator('button', { hasText: '下发配置' }).click()
    await confirmModal(page, '下发网关配置').locator('.btn-primary', { hasText: '开始下发' }).click()
    await expect(drawer).toBeVisible()
    await expect(drawer.locator('.progress-bar')).toHaveAttribute('style', /width:\s*0%/)
    await expect(drawer, '重开抽屉不应残留上一次的日志').not.toContainText('PLAY [relay_push]')
    // 执行中可取消（不影响后续操作）
    await drawer.locator('.modal-footer button', { hasText: '取消安装' }).click()
    await expect(drawer.locator('.modal-footer button', { hasText: '关闭' })).toBeVisible()
  })

  test('失败流：异常态 + 失败提示，关闭后重试成功', async ({ page }) => {
    const sse = await stubSseStream(page, '/relay/gateways/1/push-config', {
      events: sseFailure({
        lines: ['PLAY [relay_push] ***********************************************'],
        stderrLines: ['fatal: [gateway]: FAILED! => {"msg": "写入 edge_targets.conf 失败：Permission denied"}'],
      }),
    })

    await regionRow(page, 'e2e-a').locator('button', { hasText: '下发配置' }).click()
    await confirmModal(page, '下发网关配置').locator('.btn-primary', { hasText: '开始下发' }).click()

    const drawer = execDrawer(page)
    await expect(drawer).toBeVisible()
    await expect(drawer.locator('.progress-bar')).toHaveClass(/progress-exception/)
    await expect(drawer).toContainText('下发配置失败（rc=2，failed）')
    await expect(drawer).toContainText('写入 edge_targets.conf 失败：Permission denied')
    await expect(page.locator('.ant-message')).toContainText('下发配置失败（rc=2），详见执行日志')
    expect(sse.requests).toHaveLength(1)

    // 非流式态：可关闭，行内按钮已复位
    await drawer.locator('.modal-footer button', { hasText: '关闭' }).click()
    await expect(drawer).toBeHidden()
    await expect(regionRow(page, 'e2e-a').locator('button', { hasText: '下发配置' })).toBeEnabled()

    // 重试：重新桩为成功流（后注册优先）
    await stubSseStream(page, '/relay/gateways/1/push-config', {
      events: sseSuccess({ lines: PUSH_LINES, hostsPattern: 'gateways_e2e-a' }),
    })
    await regionRow(page, 'e2e-a').locator('button', { hasText: '下发配置' }).click()
    await confirmModal(page, '下发网关配置').locator('.btn-primary', { hasText: '开始下发' }).click()
    await expect(drawer.locator('.progress-bar')).toHaveClass(/progress-success/, { timeout: 15000 })
    await expect(drawer).toContainText('下发配置完成：gateways_e2e-a')
  })

  test('空白名单危险确认：0 启用节点时显式带 allow_empty 载荷才下发', async ({ page }) => {
    const sse = await stubSseStream(page, '/relay/gateways/2/push-config', {
      events: sseSuccess({ lines: PUSH_LINES, hostsPattern: 'gateways_e2e-b' }),
    })

    await regionRow(page, 'e2e-b').locator('button', { hasText: '下发配置' }).click()
    const confirm = confirmModal(page, '下发网关配置')
    await expect(confirm).toBeVisible()
    await expect(confirm).toContainText('该区域当前没有启用节点，下发将把该局网关白名单清空')
    // 范围说明仍在，且排在危险提示之前（危险提示保持为最后一句）
    const bodyText = await confirm.locator('.modal-body').innerText()
    const hintAt = bodyText.indexOf('本次下发仅更新流量白名单（nginx）')
    expect(hintAt, '空白名单确认应保留下发范围说明').toBeGreaterThanOrEqual(0)
    expect(hintAt, '范围说明须排在危险提示之前').toBeLessThan(bodyText.indexOf('该区域当前没有启用节点'))
    expect(bodyText.trimEnd(), '危险提示须是最后一句').toMatch(/再继续。$/)
    const okDanger = confirm.locator('.btn-danger', { hasText: '仍要下发（白名单为空）' })
    await expect(okDanger).toBeVisible()

    await okDanger.click()
    await expect(execDrawer(page)).toBeVisible()
    // 危险确认路径必须显式携带 allow_empty（后端 openspec: relay-push-empty-whitelist-guard）
    expect(sse.requests).toHaveLength(1)
    expect(sse.requests[0].body).toMatchObject({ allow_empty: true })
  })
})
