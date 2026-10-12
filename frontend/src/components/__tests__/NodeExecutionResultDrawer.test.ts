// NodeExecutionResultDrawer 摘要形态分流（node-management-ux-batch1 3.2 / design D5）：
// mode prop 显式声明抽屉摘要形态——install=安装摘要、action=动作摘要（不渲染 Nginx 进程卡）、
// auto（缺省）=按标题回退（「安装」前缀 → 安装摘要，其余 → nginx 操作摘要，兼容启动/停止/reload）。
// 背景：关联新OpenResty / 添加版本包 / 切换版本三类动作流按标题启发式落入 nginx 动作摘要
// 模板分支，一旦调用方显式传 show-nginx-status 就会渲染出与动作无关的「Nginx 进程」卡。
// 已知现状（保持不变）：showNginxStatus 为 Boolean 可选 prop，未传时经 Vue 布尔转换得 false，
// nginx 卡缺省不渲染（全仓仅 EdgeAutostart 显式传 false，无人传 true）。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

const baseProps = {
  visible: true,
  progress: { percent: 100, status: 'success' as const },
  logs: [] as string[],
  elapsed: 3,
  highlights: [] as string[],
  statistics: null,
}

function successResult() {
  return { stdout: 'nginx: running', stderr: '', command: 'cmd', rc: 0 }
}

async function mountDrawer(props: Record<string, unknown>) {
  const Drawer = (await import('../NodeExecutionResultDrawer.vue')).default
  document.body.innerHTML = ''
  const wrapper = mount(Drawer, { props: { ...baseProps, ...props } as never })
  await nextTick()
  return wrapper
}

function bodyText(): string {
  return document.body.textContent || ''
}

describe('NodeExecutionResultDrawer mode 分流', () => {
  it('mode="action"：动作类摘要只显示成功徽章与 rc，即使显式 show-nginx-status 也不渲染 Nginx 进程卡', async () => {
    await mountDrawer({
      title: '关联新OpenResty - 10.0.0.1',
      mode: 'action',
      result: successResult(),
      showNginxStatus: true,
    })
    const text = bodyText()
    expect(text).toContain('✅ 成功')
    expect(text).toContain('返回码 (rc): 0')
    expect(text).not.toContain('Nginx 进程')
  })

  it('mode="action"：失败时显示失败徽章与 stderr，不出现「Nginx 进程: 未查询到」误导', async () => {
    await mountDrawer({
      title: '添加版本包 - 10.0.0.2',
      mode: 'action',
      result: { stdout: '', stderr: '升级包校验失败', command: 'cmd', rc: 1 },
    })
    const text = bodyText()
    expect(text).toContain('❌ 失败 (rc: 1)')
    expect(text).toContain('升级包校验失败')
    expect(text).not.toContain('Nginx 进程')
  })

  it('缺省（auto）+ 启动类标题：保留 nginx 操作摘要分支（✅ 成功 + rc，非安装徽章）', async () => {
    await mountDrawer({ title: '节点 启动', result: successResult() })
    const text = bodyText()
    expect(text).toContain('✅ 成功')
    expect(text).toContain('返回码 (rc): 0')
    expect(text).not.toContain('安装成功')
  })

  it('缺省（auto）+ 启动类标题 + 显式 show-nginx-status：Nginx 进程卡照常渲染（现状门控不变）', async () => {
    await mountDrawer({ title: '节点 启动', result: successResult(), showNginxStatus: true })
    expect(bodyText()).toContain('Nginx 进程')
  })

  it('缺省（auto）+ 「安装」前缀标题：安装摘要（安装成功徽章）', async () => {
    await mountDrawer({ title: '安装 OpenResty - 10.0.0.1', mode: 'auto', result: successResult() })
    expect(bodyText()).toContain('✅ 安装成功')
  })

  it('mode="install"：显式声明安装摘要，不依赖标题前缀', async () => {
    await mountDrawer({ title: '节点 安装', mode: 'install', result: successResult() })
    expect(bodyText()).toContain('✅ 安装成功')
  })

  it('mode="action"：高亮与统计信息照常渲染（动作摘要不丢信息）', async () => {
    await mountDrawer({
      title: '切换版本 - 10.0.0.3',
      mode: 'action',
      result: successResult(),
      highlights: ['当前版本: 2.6.0'],
      statistics: { edge_version: '2.6.0' },
    })
    const text = bodyText()
    expect(text).toContain('关键信息')
    expect(text).toContain('当前版本: 2.6.0')
    expect(text).toContain('节点统计信息')
    expect(text).toContain('Edge 版本')
  })
})

// ── node-management-ux-batch2 5.1 / design D8：进度不确定态 ──────────────────
// indeterminate 是起始形态而非硬模式：执行中（status=active 且尚未收到任何服务端
// percent 事件，即 percent===0）渲染动画条 + 已耗时、无百分比数字；一旦 percent>0
// 自动切换真实百分比；终态（success/exception）回落常规条。
describe('NodeExecutionResultDrawer indeterminate 不确定态', () => {
  it('active + indeterminate + percent=0：动画条 + 已耗时，无百分比数字', async () => {
    await mountDrawer({
      title: '节点 启动',
      progress: { percent: 0, status: 'active' as const, indeterminate: true },
      elapsed: 4,
    })
    expect(document.querySelector('.progress-indeterminate'), '应渲染不确定态动画条').not.toBeNull()
    expect(bodyText()).toContain('已用 4 秒')
    expect(bodyText(), '不确定态不得渲染百分比数字').not.toContain('%')
  })

  it('收到首个服务端 percent 事件（percent>0）自动切换真实百分比', async () => {
    await mountDrawer({
      title: '安装 OpenResty - 10.0.0.1',
      progress: { percent: 40, status: 'active' as const, indeterminate: true },
      elapsed: 9,
    })
    expect(document.querySelector('.progress-indeterminate')).toBeNull()
    expect(bodyText()).toContain('40%')
  })

  it('终态（success）回落常规条：无动画类、百分比照常', async () => {
    await mountDrawer({
      title: '节点 启动',
      progress: { percent: 100, status: 'success' as const, indeterminate: true },
      elapsed: 12,
    })
    expect(document.querySelector('.progress-indeterminate')).toBeNull()
    expect(document.querySelector('.progress-bar.progress-success')).not.toBeNull()
    expect(bodyText()).toContain('100%')
  })

  it('未传 indeterminate：行为不变（active + percent=0 也渲染 0%）', async () => {
    await mountDrawer({ title: '节点 启动', progress: { percent: 0, status: 'active' as const }, elapsed: 1 })
    expect(document.querySelector('.progress-indeterminate')).toBeNull()
    expect(bodyText()).toContain('0%')
  })
})
