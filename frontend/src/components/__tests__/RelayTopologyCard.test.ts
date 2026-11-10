import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RelayTopologyCard from '@/components/RelayTopologyCard.vue'
import { checklistOf, nextStepOf, sshHostOf, stageOf } from '@/composables/useRelayTopology'
import type { RelayGateway, RelayHealthResult, RelayTopologyRegion } from '@/api/relay'

// 组件的 a-dropdown/a-menu 系列沿用视图测试同款桩（#54：不挂真实 a-table 组件）
const stubs = {
  'a-dropdown': {
    template: '<div class="mock-dropdown"><slot /><slot name="overlay" /></div>',
    props: { trigger: Array },
  },
  'a-menu': { template: '<div class="mock-menu"><slot /></div>' },
  'a-menu-item': {
    props: { danger: Boolean, disabled: Boolean },
    template:
      '<button class="mock-menu-item" :class="{ \'mock-menu-disabled\': disabled }" @click="$emit(\'click\')"><slot /></button>',
    emits: ['click'],
  },
  'a-menu-divider': { template: '<hr class="mock-menu-divider" />', props: [] },
}

const BASE_GATEWAY: RelayGateway = {
  id: 1,
  code: 'jinan',
  name: '济南局',
  http_base_url: 'http://10.10.1.1:8443',
  ssh_jump: 'tunnel@10.10.1.1:22',
  openresty_prefix: '/work/openresty/nginx',
  status: 'enabled',
  ssh_user: 'jboss',
  ssh_port: 22,
  enabled_node_count: 2,
  total_node_count: 4,
  last_pushed_at: '2026-11-05T10:22:00',
  push_drift: { added: ['10.10.2.2:8080'], removed: ['10.10.2.3:8080'] },
}

const TOPO: RelayTopologyRegion = {
  id: 1,
  code: 'jinan',
  name: '济南局',
  status: 'enabled',
  http_base_url: 'http://10.10.1.1:8443',
  ssh_jump: 'tunnel@10.10.1.1:22',
  ssh_user: 'jboss',
  ssh_port: 22,
  openresty_prefix: '/work/openresty/nginx',
  last_pushed_at: '2026-11-05T10:22:00',
  clusters: [
    {
      id: 11,
      name: '胶济干线',
      display_name: null,
      nodes: [
        { ip: '10.10.2.1', management_port: 8080, status: 1, whitelist_state: 'synced' },
        { ip: '10.10.2.2', management_port: 8080, status: 1, whitelist_state: 'pending_add' },
        { ip: '10.10.2.3', management_port: 8080, status: 0, whitelist_state: 'pending_remove' },
        { ip: '10.10.2.4', management_port: 8080, status: 0, whitelist_state: 'off' },
      ],
    },
  ],
}

const HEALTH_OK = {
  checkedAt: '2026-11-06T01:12:00.000Z',
  result: {
    region: 'jinan',
    ok: true,
    segments: [
      { name: '网关HTTP腿', ok: true, elapsed_ms: 5 },
      { name: 'SSH跳板', ok: true, elapsed_ms: 6 },
      {
        name: '抽样节点两腿',
        ok: true,
        elapsed_ms: 9,
        nodes: [{ node: '10.10.2.1', ok: true, ssh_skipped: true, note: '网关机自身节点，走直连（不适用跳板）' }],
      },
    ],
  },
}

const HEALTH_FAIL: { checkedAt: string; result: RelayHealthResult } = {
  checkedAt: '2026-11-06T01:12:00.000Z',
  result: {
    region: 'jinan',
    ok: false,
    segments: [
      { name: '网关HTTP腿', ok: true, elapsed_ms: 5 },
      { name: 'SSH跳板', ok: true, elapsed_ms: 6 },
      {
        name: '抽样节点两腿',
        ok: false,
        error: 'SSH腿(经跳板): connection refused',
        nodes: [{ node: '10.10.2.2', ok: false, error: 'SSH腿(经跳板): connection refused' }],
      },
    ],
  },
}

const HEALTH_SSHD_PROHIBITED: { checkedAt: string; result: RelayHealthResult } = {
  checkedAt: '2026-11-06T01:12:00.000Z',
  result: {
    region: 'jinan',
    ok: false,
    // 形状取自真实后端响应（2026-11-10 实测「bbb」局）：跳板本身可达（段 2 ✓），
    // sshd 禁转发证据在抽样节点段——经后端 _probe_node_ssh_via_jump stderr 标记
    segments: [
      { name: '网关HTTP腿', ok: true, elapsed_ms: 5 },
      { name: 'SSH跳板', ok: true, elapsed_ms: 6 },
      {
        name: '抽样节点两腿',
        ok: false,
        error: 'SSH腿(经跳板): 跳板转发建立失败 (rc=255)（网关 sshd 拒绝端口转发：administratively prohibited）',
        nodes: [
          {
            node: '10.10.2.2',
            ok: false,
            error: 'SSH腿(经跳板): 跳板转发建立失败 (rc=255)（网关 sshd 拒绝端口转发：administratively prohibited）',
          },
          {
            node: '10.10.2.3',
            ok: false,
            error: 'SSH腿(经跳板): 跳板转发建立失败 (rc=255)（网关 sshd 拒绝端口转发：administratively prohibited）',
          },
        ],
      },
    ],
  },
}

const HEALTH_JUMP_PLAIN_FAIL: { checkedAt: string; result: RelayHealthResult } = {
  checkedAt: '2026-11-06T01:12:00.000Z',
  result: {
    region: 'jinan',
    ok: false,
    // 裂「跳板转发建立失败 (rc=255)」但无精确标记 → 节点不可达歧义态，不出框
    segments: [
      { name: '网关HTTP腿', ok: true, elapsed_ms: 5 },
      { name: 'SSH跳板', ok: true, elapsed_ms: 6 },
      {
        name: '抽样节点两腿',
        ok: false,
        error: 'SSH腿(经跳板): 跳板转发建立失败 (rc=255)',
        nodes: [{ node: '10.10.2.2', ok: false, error: 'SSH腿(经跳板): 跳板转发建立失败 (rc=255)' }],
      },
    ],
  },
}

type HealthMeta = { result: RelayHealthResult; checkedAt: string }

function mountCard(gateway: RelayGateway, topo: RelayTopologyRegion | null, health: HealthMeta | null) {
  return mount(RelayTopologyCard, {
    props: { gateway, topo, health },
    global: { stubs },
  })
}

function findButton(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').find((b) => b.text().trim() === text)
}

describe('useRelayTopology 阶段机派生（design D7 单点函数）', () => {
  it.each([
    { name: 'steady（last_pushed_at 非空）', source: { last_pushed_at: '2026-11-05T10:22:00' }, expected: 'steady' },
    {
      name: 'ready-init（ssh_jump + ssh_user，未下发）',
      source: { ssh_jump: 'tunnel@10.10.1.1:22', ssh_user: 'jboss' },
      expected: 'ready-init',
    },
    {
      name: 'init-blocked（ssh_jump 缺 ssh_user）',
      source: { ssh_jump: 'tunnel@10.10.1.1:22', ssh_user: null },
      expected: 'init-blocked',
    },
    {
      name: 'legs-partial（仅 HTTP 腿）',
      source: { http_base_url: 'http://10.10.1.1:8443' },
      expected: 'legs-partial',
    },
    { name: 'fresh（两腿均空）', source: {}, expected: 'fresh' },
  ])('stageOf: $name → $expected', ({ source, expected }) => {
    expect(stageOf(source)).toBe(expected)
  })

  it('nextStepOf 指引序列：登记 HTTP 腿→登记 SSH 跳板→补 SSH 账号→初始化网关→挂接集群→下发配置→已完成', () => {
    expect(nextStepOf({}, 0, null)).toBe('登记 HTTP 腿')
    expect(nextStepOf({ http_base_url: 'http://10.10.1.1:8443' }, 0, null)).toBe('登记 SSH 跳板')
    expect(nextStepOf({ ssh_jump: 'tunnel@10.10.1.1:22' }, 0, null)).toBe('补 SSH 账号')
    expect(nextStepOf({ ssh_jump: 'tunnel@10.10.1.1:22', ssh_user: 'jboss' }, 0, null)).toBe('初始化网关')
    // SSH-only 区域（有 ssh_jump 无 http）越过登记 HTTP 腿直达初始化
    expect(nextStepOf({ ssh_jump: 't@10.10.1.1:22', ssh_user: 'jboss' }, 0, null)).toBe('初始化网关')
    expect(nextStepOf({ last_pushed_at: '2026-11-05T10:22:00', ssh_jump: 't@h:22', ssh_user: 'j' }, 0, null)).toBe(
      '挂接集群',
    )
    expect(
      nextStepOf({ last_pushed_at: '2026-11-05T10:22:00', ssh_jump: 't@h:22', ssh_user: 'j' }, 2, {
        added: ['1.1.1.1:1'],
        removed: [],
      }),
    ).toBe('下发配置')
    expect(
      nextStepOf({ last_pushed_at: '2026-11-05T10:22:00', ssh_jump: 't@h:22', ssh_user: 'j' }, 2, {
        added: [],
        removed: [],
      }),
    ).toBe('已完成')
  })

  it('checklistOf 五步与 sshHostOf 主机提取', () => {
    const partial = checklistOf({ http_base_url: 'http://h:1' }, 0)
    expect(partial.map((s) => `${s.label}${s.done ? '✓' : '○'}`).join('')).toBe('区域✓两腿○初始化○挂接○下发○')
    expect(
      checklistOf({ http_base_url: 'http://h:1', ssh_jump: 't@h:22' }, 1).find((s) => s.label === '两腿')?.done,
    ).toBe(true)
    expect(sshHostOf('tunnel@10.10.1.1:22')).toBe('10.10.1.1')
    expect(sshHostOf('10.10.1.1')).toBe('10.10.1.1')
    expect(sshHostOf(null)).toBe('')
  })
})

describe('RelayTopologyCard 图元渲染', () => {
  it('steady 稳态：平台/两腿/实体网关机框/分发边/集群卡/节点行徽章四态/白名单统计条', () => {
    const wrapper = mountCard(BASE_GATEWAY, TOPO, HEALTH_OK)
    const text = wrapper.text()
    // 平台节点
    expect(text).toContain('中控平台')
    expect(text).toContain('发布 · 任务发起方')
    // 两腿 chip（HTTP 去协议展示；体检 ✓）
    expect(text).toContain('HTTP 腿')
    expect(text).toContain('10.10.1.1:8443')
    expect(text).toContain('SSH 跳板')
    expect(text).toContain('tunnel@10.10.1.1:22')
    // steady 实体网关机框：名称 + code + 连接摘要 + 前缀
    expect(text).toContain('网关机 · 济南局')
    expect(text).toContain('jboss@10.10.1.1:22')
    expect(text).toContain('/work/openresty/nginx')
    // 分发边
    expect(text).toContain('8443 白名单')
    expect(text).toContain('1 节点')
    expect(text).toContain('sshd PermitOpen')
    // 集群卡 + 节点行
    expect(text).toContain('胶济干线')
    expect(text).toContain('4 节点')
    expect(text).toContain('10.10.2.1:8080')
    const tags = wrapper.findAll('.nrow .tag').map((t) => t.text())
    expect(tags).toContain('未下发')
    expect(tags).toContain('待移除')
    expect(tags).toContain('已停用')
    expect(tags).toContain('自跳直连')
    // 白名单统计条（steady 已下发）
    expect(text).toContain('白名单')
    expect(text).toContain('2')
    expect(text).toContain('4')
    expect(text).toContain('已同步')
    expect(text).toContain('1 个未下发')
    expect(text).toContain('1 个待移除')
    expect(text).toContain('上次下发')
    // 清单条不出现
    expect(text).not.toContain('下一步：')
    // B″ 动作框：steady + 有漂移 → 白名单待下发框出现（卡头已无下发按钮）
    expect(findButton(wrapper, '下发配置')).toBeDefined()
    const pushBox = wrapper.find('.push-box')
    expect(pushBox.exists()).toBe(true)
    expect(pushBox.classes()).not.toContain('sshd')
    expect(pushBox.text()).toContain('白名单待下发')
    expect(pushBox.text()).toContain('1 个未下发')
    expect(pushBox.text()).toContain('1 个待移除')
  })

  it('steady 体检异常：节点行红 ✗ + 卡头失败摘要徽章', () => {
    const wrapper = mountCard(BASE_GATEWAY, TOPO, HEALTH_FAIL)
    const errTags = wrapper.findAll('.nrow .tag.gerr')
    expect(errTags.length).toBe(1)
    const failRow = wrapper.findAll('.nrow').find((r) => r.text().includes('10.10.2.2'))
    expect(failRow!.attributes('title')).toContain('connection refused')
    expect(wrapper.find('.hchip.fail').text()).toContain('✗ 抽样节点两腿不可达')
    // 两腿徽章 ✓
    expect(wrapper.find('.hchip.fail').text()).not.toContain('网关HTTP腿不可达')
  })

  it('steady + push_drift 为 null：白名单条显示「尚无成功下发记录」', () => {
    const wrapper = mountCard({ ...BASE_GATEWAY, push_drift: null }, TOPO, null)
    expect(wrapper.text()).toContain('尚无成功下发记录')
  })

  it('steady + 无漂移：白名单条不含未下发/待移除段', () => {
    const wrapper = mountCard({ ...BASE_GATEWAY, push_drift: { added: [], removed: [] } }, TOPO, null)
    const text = wrapper.text()
    expect(text).toContain('已同步')
    expect(text).not.toContain('个未下发')
    expect(text).not.toContain('个待移除')
  })

  it('B″ 下发动作框：steady + 无漂移 → 框不出现（完成即隐）', () => {
    const wrapper = mountCard({ ...BASE_GATEWAY, push_drift: { added: [], removed: [] } }, TOPO, null)
    expect(wrapper.find('.push-box').exists()).toBe(false)
  })

  it('B″ 下发动作框：点击下发配置按钮 emit push（接既有 handlePush 确认弹窗）', async () => {
    const wrapper = mountCard(BASE_GATEWAY, TOPO, null)
    await findButton(wrapper, '下发配置')!.trigger('click')
    expect(wrapper.emitted('push')).toHaveLength(1)
  })

  it('B″ 跳板转发框：体检报 administratively prohibited 精确标记 → 橙框出现，点击 emit sshd', async () => {
    const wrapper = mountCard(BASE_GATEWAY, TOPO, HEALTH_SSHD_PROHIBITED)
    const box = wrapper.find('.push-box.sshd')
    expect(box.exists()).toBe(true)
    expect(box.text()).toContain('跳板转发待配置')
    expect(box.text()).toContain('administratively prohibited')
    await box.find('button').trigger('click')
    expect(wrapper.emitted('sshd')).toHaveLength(1)
  })

  it('B″ 跳板转发框：无精确标记的裸 rc=255 / 网络不可达 / 体检正常 / 未体检 → 均不出现（证据驱动）', () => {
    expect(mountCard(BASE_GATEWAY, TOPO, HEALTH_JUMP_PLAIN_FAIL).find('.push-box.sshd').exists()).toBe(false)
    expect(mountCard(BASE_GATEWAY, TOPO, HEALTH_FAIL).find('.push-box.sshd').exists()).toBe(false)
    expect(mountCard(BASE_GATEWAY, TOPO, HEALTH_OK).find('.push-box.sshd').exists()).toBe(false)
    expect(mountCard(BASE_GATEWAY, TOPO, null).find('.push-box.sshd').exists()).toBe(false)
  })

  it('分发 chip ✓ 徽章：已同步零漂移 → 8443 chip ✓；体检抽样段通过 → sshd chip ✓', () => {
    const clean = mountCard({ ...BASE_GATEWAY, push_drift: { added: [], removed: [] } }, TOPO, HEALTH_OK)
    // .edge 有两列（两腿列 / 分发列），取分发列
    const distChips = clean.findAll('.edge')[1]!.findAll('.leg-chip')
    expect(distChips[0]!.text()).toContain('✓')
    expect(distChips[1]!.text()).toContain('✓')
  })

  it('分发 chip ✓ 徽章边界：有漂移 / 从未下发 → 8443 chip 无 ✓；抽样段失败/未体检 → sshd chip 无 ✗（不冤枉 PermitOpen）', () => {
    const distChipsOf = (w: ReturnType<typeof mountCard>) => w.findAll('.edge')[1]!.findAll('.leg-chip')
    const drifted = distChipsOf(mountCard(BASE_GATEWAY, TOPO, HEALTH_OK))
    expect(drifted[0]!.text()).not.toContain('✓')
    const neverPushed = distChipsOf(
      mountCard(
        { ...BASE_GATEWAY, push_drift: null, last_pushed_at: null },
        { ...TOPO, last_pushed_at: null },
        HEALTH_OK,
      ),
    )
    expect(neverPushed[0]!.text()).not.toContain('✓')
    const sampledFail = distChipsOf(mountCard(BASE_GATEWAY, TOPO, HEALTH_FAIL))
    expect(sampledFail[1]!.text()).not.toContain('✗')
    expect(distChipsOf(mountCard(BASE_GATEWAY, TOPO, null))[1]!.text()).not.toContain('✓')
  })

  it('ready-init 待初始化形态：虚线框 + 待初始化 tag + 前缀红字 + 初始化按钮 + 清单条', () => {
    const gateway = { ...BASE_GATEWAY, last_pushed_at: null, push_drift: null, openresty_prefix: null }
    const wrapper = mountCard(gateway, { ...TOPO, last_pushed_at: null, openresty_prefix: null }, null)
    const text = wrapper.text()
    expect(text).toContain('网关机 · 待初始化')
    expect(text).toContain('待初始化')
    expect(text).toContain('OpenResty 前缀未填 · 点此填写')
    expect(text).toContain('jboss@10.10.1.1')
    // 清单条：两腿 ✓、下一步：初始化网关
    expect(text).toContain('区域')
    expect(text).toContain('下一步：初始化网关')
    // B″：非 steady 无任何下发入口（卡头收敛；框只在 steady+漂移出现）
    expect(findButton(wrapper, '下发配置')).toBeUndefined()
    expect(wrapper.find('.push-box').exists()).toBe(false)
  })

  it('ready-init 前缀已填：不再显示红字提示', () => {
    const wrapper = mountCard(
      { ...BASE_GATEWAY, last_pushed_at: null, push_drift: null },
      { ...TOPO, last_pushed_at: null },
      null,
    )
    expect(wrapper.text()).not.toContain('OpenResty 前缀未填')
    expect(wrapper.text()).toContain('/work/openresty/nginx')
  })

  it('init-blocked 缺 SSH 账号形态：缺账号 tag + 补账号按钮 + 降级明细提示', () => {
    const gateway = {
      ...BASE_GATEWAY,
      last_pushed_at: null,
      push_drift: null,
      ssh_user: null,
      attached_cluster_count: 3,
    }
    const wrapper = mountCard(gateway, null, null)
    const text = wrapper.text()
    expect(text).toContain('缺 SSH 账号')
    expect(text).toContain('补 SSH 账号')
    expect(text).toContain('SSH 账号用于平台登录网关机执行初始化 / 下发')
    expect(text).toContain('下一步：补 SSH 账号')
    // topo 缺失降级：仅列表行计数提示
    expect(text).toContain('已挂接 3 个集群（节点明细加载中）')
  })

  it('legs-partial 形态：未配置网关机 ghost + SSH 腿未登记 + 下一步登记 SSH 跳板', () => {
    const gateway = { ...BASE_GATEWAY, last_pushed_at: null, push_drift: null, ssh_jump: null, ssh_user: null }
    const wrapper = mountCard(gateway, null, null)
    const text = wrapper.text()
    expect(text).toContain('未配置网关机')
    expect(text).toContain('SSH 腿未登记 · 初始化不可用')
    expect(text).toContain('下一步：登记 SSH 跳板')
    // HTTP 腿已登记、SSH 腿 dim
    expect(text).toContain('10.10.1.1:8443')
    expect(text).toContain('SSH 跳板 · 未配置')
  })

  it('fresh 直连形态：dim 双腿/直连 chip/ghost 直连路径/引导文案/直连徽章', () => {
    const gateway: RelayGateway = {
      id: 2,
      code: 'wuqing',
      name: '武清本地',
      http_base_url: null,
      ssh_jump: null,
      openresty_prefix: null,
      status: 'enabled',
    }
    const wrapper = mountCard(gateway, null, null)
    const text = wrapper.text()
    expect(text).toContain('HTTP 腿 · 未配置')
    expect(text).toContain('SSH 跳板 · 未配置')
    expect(text).toContain('直连路径')
    expect(text).toContain('直连')
    expect(text).toContain('登记网关机两腿后可经中继进局')
    expect(text).toContain('当前按直连执行')
    expect(text).toContain('直连 · 无网关机')
    expect(text).toContain('下一步：登记 HTTP 腿')
  })
})

describe('RelayTopologyCard 动作 emit', () => {
  it('卡头动作：测试/下发配置/更多菜单分发', async () => {
    const wrapper = mountCard(BASE_GATEWAY, TOPO, HEALTH_OK)
    await findButton(wrapper, '测试')!.trigger('click')
    expect(wrapper.emitted('test')).toHaveLength(1)
    await findButton(wrapper, '下发配置')!.trigger('click')
    expect(wrapper.emitted('push')).toHaveLength(1)

    await wrapper
      .findAll('.mock-menu-item')
      .find((b) => b.text().startsWith('编辑'))!
      .trigger('click')
    await wrapper
      .findAll('.mock-menu-item')
      .find((b) => b.text().startsWith('初始化网关'))!
      .trigger('click')
    await wrapper
      .findAll('.mock-menu-item')
      .find((b) => b.text().startsWith('配置跳板转发'))!
      .trigger('click')
    await wrapper
      .findAll('.mock-menu-item')
      .find((b) => b.text().startsWith('查看配置'))!
      .trigger('click')
    await wrapper
      .findAll('.mock-menu-item')
      .find((b) => b.text().startsWith('查看凭据'))!
      .trigger('click')
    await wrapper
      .findAll('.mock-menu-item')
      .find((b) => b.text().startsWith('禁用'))!
      .trigger('click')
    await wrapper
      .findAll('.mock-menu-item')
      .find((b) => b.text().startsWith('删除'))!
      .trigger('click')

    const menuEvents = wrapper.emitted('menu-action')!.map((args) => args[0])
    expect(menuEvents).toEqual(['edit', 'init', 'sshd', 'preview', 'cred', 'toggle', 'delete'])
  })

  it('节点行/集群卡/挂接入口 emit（节点行带节点与集群载荷；批次三集群卡/挂接入口随锚点元素供 popover 锚定）', async () => {
    const wrapper = mountCard(BASE_GATEWAY, TOPO, null)
    await wrapper.findAll('.nrow')[0]!.trigger('click')
    const nodeEvents = wrapper.emitted('node-click')!
    expect(nodeEvents).toHaveLength(1)
    expect(nodeEvents[0]![0]).toMatchObject({ ip: '10.10.2.1', whitelist_state: 'synced' })
    expect(nodeEvents[0]![1]).toMatchObject({ id: 11 })

    await wrapper.find('.cluster-card').trigger('click')
    const clusterEvents = wrapper.emitted('cluster-click')!
    expect(clusterEvents).toHaveLength(1)
    expect(clusterEvents[0]![0]).toMatchObject({ id: 11 })
    expect((clusterEvents[0]![1] as unknown) instanceof HTMLElement).toBe(true)

    await wrapper.find('.attach-dashed').trigger('click')
    expect(wrapper.emitted('attach-click')).toHaveLength(1)
    expect((wrapper.emitted('attach-click')![0]![0] as unknown) instanceof HTMLElement).toBe(true)
  })

  it('ready-init 初始化按钮 emit init（带锚点元素）；init-blocked 补账号按钮改开就地编辑 popover（批次三接线：不再走 menu-action edit）', async () => {
    const ready = mountCard(
      { ...BASE_GATEWAY, last_pushed_at: null, push_drift: null },
      { ...TOPO, last_pushed_at: null },
      null,
    )
    await findButton(ready, '初始化网关')!.trigger('click')
    expect(ready.emitted('init')).toHaveLength(1)
    expect((ready.emitted('init')![0]![0] as unknown) instanceof HTMLElement).toBe(true)

    const blocked = mountCard({ ...BASE_GATEWAY, last_pushed_at: null, push_drift: null, ssh_user: null }, null, null)
    await findButton(blocked, '补 SSH 账号')!.trigger('click')
    expect(blocked.emitted('node-box-click')).toHaveLength(1)
    expect(blocked.emitted('menu-action')).toBeUndefined()
  })
})

describe('RelayTopologyCard 就地编辑入口 emit（批次三 popover 接线）', () => {
  it('两腿 chip 点击 emit leg-click（配置态与未配置 dim 态均可点，kind 区分 http/ssh）', async () => {
    const wrapper = mountCard(BASE_GATEWAY, TOPO, null)
    const chips = wrapper.findAll('.leg-chip')
    await chips.find((c) => c.text().includes('HTTP 腿'))!.trigger('click')
    await chips.find((c) => c.text().includes('SSH 跳板'))!.trigger('click')
    expect(wrapper.emitted('leg-click')!.map((a) => a[0])).toEqual(['http', 'ssh'])

    const dim = mountCard({ ...BASE_GATEWAY, ssh_jump: null }, { ...TOPO, ssh_jump: null, ssh_user: null }, null)
    const dimChip = dim.findAll('.leg-chip.dim').find((c) => c.text().includes('SSH 跳板'))!
    expect(dimChip.attributes('title')).toBe('点击登记 SSH 跳板')
    await dimChip.trigger('click')
    expect(dim.emitted('leg-click')!.map((a) => a[0])).toEqual(['ssh'])
  })

  it('卡头名称/状态徽章点击 emit name-click/badge-click；区域码 code-tag 不可点', async () => {
    const wrapper = mountCard(BASE_GATEWAY, TOPO, null)
    await wrapper.find('.editable-name').trigger('click')
    expect(wrapper.emitted('name-click')).toHaveLength(1)
    const badge = wrapper.find('.badge.clickable')
    expect(badge.text()).toContain('启用')
    await badge.trigger('click')
    expect(wrapper.emitted('badge-click')).toHaveLength(1)
    // 区域码不可点（不提供就地编辑）
    await wrapper.find('.th-left .code-tag').trigger('click')
    expect(wrapper.emitted('badge-click')).toHaveLength(1)
    expect(wrapper.emitted('name-click')).toHaveLength(1)
  })

  it('steady 实体网关机框整卡可点 emit node-box-click + ✎ 悬浮角标；init-blocked 整框可点', async () => {
    const steady = mountCard(BASE_GATEWAY, TOPO, null)
    const nodeBox = steady.find('.node.editable')
    expect(nodeBox.find('.pencil').exists()).toBe(true)
    await nodeBox.trigger('click')
    expect(steady.emitted('node-box-click')).toHaveLength(1)

    const blocked = mountCard({ ...BASE_GATEWAY, last_pushed_at: null, push_drift: null, ssh_user: null }, null, null)
    await blocked.find('.node.ghost.editable').trigger('click')
    expect(blocked.emitted('node-box-click')).toHaveLength(1)
  })

  it('fresh 直连引导「去登记」emit leg-click http（批次三接线：不再走 menu-action edit）', async () => {
    const gateway: RelayGateway = {
      id: 2,
      code: 'wuqing',
      name: '武清本地',
      http_base_url: null,
      ssh_jump: null,
      openresty_prefix: null,
      status: 'enabled',
    }
    const wrapper = mountCard(gateway, null, null)
    await wrapper.find('.direct-guide button').trigger('click')
    expect(wrapper.emitted('leg-click')!.map((a) => a[0])).toEqual(['http'])
    expect(wrapper.emitted('menu-action')).toBeUndefined()
  })

  it('section 携带 data-code（草稿卡创建成功后 scrollIntoView 定位用）', () => {
    const wrapper = mountCard(BASE_GATEWAY, TOPO, null)
    expect(wrapper.find('section.topo-card').attributes('data-code')).toBe('jinan')
  })
})
