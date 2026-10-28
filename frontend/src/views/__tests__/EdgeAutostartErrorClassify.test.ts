/**
 * autostart-ux-review-fixes 批 2 · 任务 2.5/2.6
 *
 * 终态失败归类守卫（design D6 / proposal P3-12）：后端终态事件只带 status:"failed"，
 * 归类必须读流日志真实标记——root 认证失败 / 无法连接 / 其他固定指引；
 * root 模式查询认证失败不得把节点状态误标为「查询受限」。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import NodeExecutionResultDrawer from '@/components/NodeExecutionResultDrawer.vue'

// 流回放：先注 lines 再发终态（模拟 SSE onLine → onComplete 次序）
const state = vi.hoisted(() => ({
  lines: [] as string[],
  terminal: { rc: 0, status: 'successful' } as { rc: number; status: string },
}))

vi.mock('@/composables/useInstallStream', () => ({
  useInstallStream: () => ({
    installing: { value: false },
    start: async (_url: string, _body: unknown, options: Record<string, any>) => {
      for (const line of state.lines) options?.onLine?.(line)
      options?.onComplete?.(state.terminal.rc, state.terminal.status)
    },
  }),
}))

vi.mock('@/api/edgeAutostart', () => ({
  autostartUrl: (nodeId: number) => `/nodes/${nodeId}/autostart`,
  listAutostartRecords: vi.fn(() => Promise.resolve({ data: { items: [] } })),
  listAutostartDefaults: vi.fn(() => Promise.resolve({ data: {} })),
  getNodeAutostartDefaults: vi.fn(() => Promise.resolve({ data: {} })),
}))
vi.mock('@/api/clusters', () => ({
  listClusters: vi.fn(() => Promise.resolve({ data: { items: [] } })),
}))
vi.mock('@/api/nodes', () => ({
  listNodes: vi.fn(() => Promise.resolve({ data: { items: [] } })),
}))

async function mountAutostart() {
  const EdgeAutostart = (await import('@/views/EdgeAutostart.vue')).default
  const wrapper = mount(EdgeAutostart, {
    global: {
      components: {
        ATable: { name: 'ATable', template: '<div class="table-stub" />' },
      },
    },
  })
  await flushPromises()
  const vm = wrapper.vm as any
  vm.selectedNode = { id: 7, ip: '192.168.0.14', edge_path: '/opt/edge' }
  return wrapper
}

const AUTH_LOGS = [
  '正在连接远程主机并执行 systemctl...',
  '免密登录失败: ssh: connect ... Permission denied (publickey,password).',
  '--- 密码认证也失败 ---',
  'ssh: Permission denied (publickey,password).',
]

describe('EdgeAutostart 终态失败归类（按流日志而非 status 字面量）', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    state.lines = []
    state.terminal = { rc: 0, status: 'successful' }
  })

  it('启用 + root 密码错误（日志含「密码认证也失败」）→ 归类 root 认证失败进抽屉横幅', async () => {
    state.lines = AUTH_LOGS
    state.terminal = { rc: 255, status: 'failed' }
    const wrapper = await mountAutostart()
    const vm = wrapper.vm as any
    vm.action = 'enable'
    vm.actionForm.root_password = 'wrong-pass'
    await vm.confirmAction()
    await flushPromises()

    const drawer = wrapper.findComponent(NodeExecutionResultDrawer)
    expect(drawer.props('streamError')).toBe('root 认证失败：请核对 root 账号密码')
    expect(drawer.props('progress')).toMatchObject({ status: 'exception', percent: 100 })
  })

  it('启用 + 连接拒绝 → 归类无法连接节点（含 IP，不含整段日志）', async () => {
    state.lines = ['ssh: connect to host 192.168.0.14 port 22: Connection refused']
    state.terminal = { rc: 255, status: 'failed' }
    const wrapper = await mountAutostart()
    const vm = wrapper.vm as any
    vm.action = 'enable'
    vm.actionForm.root_password = 'secret'
    await vm.confirmAction()
    await flushPromises()

    const drawer = wrapper.findComponent(NodeExecutionResultDrawer)
    const err = String(drawer.props('streamError'))
    expect(err).toContain('无法连接节点 192.168.0.14')
    expect(err).not.toContain('Connection refused')
  })

  it('启用 + 未归类失败 → 固定指引文案（不回显 "failed" 字面量）', async () => {
    state.lines = ['systemctl: some unexpected failure']
    state.terminal = { rc: 1, status: 'failed' }
    const wrapper = await mountAutostart()
    const vm = wrapper.vm as any
    vm.action = 'disable'
    vm.actionForm.root_password = 'secret'
    await vm.confirmAction()
    await flushPromises()

    const drawer = wrapper.findComponent(NodeExecutionResultDrawer)
    expect(drawer.props('streamError')).toBe('操作失败，可查看执行日志定位')
  })

  it('root 模式查询认证失败 → 归类认证失败，节点状态不被改写为「查询受限」', async () => {
    state.lines = AUTH_LOGS
    state.terminal = { rc: 255, status: 'failed' }
    const wrapper = await mountAutostart()
    const vm = wrapper.vm as any
    vm.selectedNode = { id: 7, ip: '192.168.0.14', edge_path: '/opt/edge', autostart_status: 'disabled' }
    vm.action = 'status'
    vm.statusQueryMode = 'root'
    vm.actionForm.root_password = 'wrong-pass'
    await vm.confirmAction()
    await flushPromises()

    const drawer = wrapper.findComponent(NodeExecutionResultDrawer)
    expect(drawer.props('streamError')).toBe('root 认证失败：请核对 root 账号密码')
    expect(vm.selectedNode.autostart_status).toBe('disabled')
  })

  it('root 模式查询成功（免密失败后密码腿成功）→ 正常解析状态，不误报认证失败', async () => {
    state.lines = [
      '免密登录失败: Permission denied', // round-1 预期失败（密钥腿）
      'disabled', // round-2 密码腿成功输出
    ]
    state.terminal = { rc: 1, status: 'successful' }
    const wrapper = await mountAutostart()
    const vm = wrapper.vm as any
    vm.selectedNode = { id: 7, ip: '192.168.0.14', edge_path: '/opt/edge' }
    vm.action = 'status'
    vm.statusQueryMode = 'root'
    vm.actionForm.root_password = 'right-pass'
    await vm.confirmAction()
    await flushPromises()

    const drawer = wrapper.findComponent(NodeExecutionResultDrawer)
    expect(drawer.props('streamError')).toBeNull()
    expect(vm.selectedNode.autostart_status).toBe('disabled')
  })

  it('直连查询无权限 → 保持「查询受限」语义（回归守卫，不并入认证失败）', async () => {
    state.lines = ['systemctl: 权限不够']
    state.terminal = { rc: 126, status: 'failed' }
    const wrapper = await mountAutostart()
    const vm = wrapper.vm as any
    vm.selectedNode = { id: 7, ip: '192.168.0.14', edge_path: '/opt/edge' }
    vm.action = 'status'
    vm.statusQueryMode = 'direct'
    await vm.confirmAction()
    await flushPromises()

    const drawer = wrapper.findComponent(NodeExecutionResultDrawer)
    expect(drawer.props('streamError')).toBeNull()
    expect(vm.selectedNode.autostart_status).toBe('permission_denied')
    const stats = drawer.props('statistics') as Record<string, string> | null
    expect(stats?.['自启动状态']).toBe('查询受限')
  })

  it('真实日志格式（12 小时制时间戳 + 命令回显）→ 回显行 is-enabled 子串不得误判「已启用」', async () => {
    // 浏览器 toLocaleTimeString() 产出 [3:55:32 PM] 形态前缀，
    // 剥离正则若只认 24 小时制，命令回显行不被跳过 → is-enabled 命中 /enabled/ → 误报已启用
    state.lines = [
      '[3:55:30 PM] 正在连接远程主机并执行 systemctl...',
      "[3:55:32 PM] Warning: Permanently added '192.168.0.13' (RSA) to the list of known hosts.",
      '[3:55:32 PM] bash: /usr/bin/systemctl: 权限不够',
      '[3:55:32 PM] 手工执行命令: sshpass -e ssh jboss@192.168.0.13 systemctl is-enabled edge',
      '[3:55:32 PM] bash: /usr/bin/systemctl: 权限不够',
    ]
    state.terminal = { rc: 126, status: 'failed' }
    const wrapper = await mountAutostart()
    const vm = wrapper.vm as any
    vm.selectedNode = { id: 7, ip: '192.168.0.13', edge_path: '/opt/edge' }
    vm.action = 'status'
    vm.statusQueryMode = 'direct'
    await vm.confirmAction()
    await flushPromises()

    expect(vm.selectedNode.autostart_status).toBe('permission_denied')
  })
})
