import { describe, expect, it } from 'vitest'
import {
  buildStreamRoutePayload,
  emptyStreamRouteForm,
  formFromStreamRoute,
  validateStreamRouteForm,
  type StreamRouteForm,
} from '../edgeStreamRoute'

/** 线上真实路由样本（取自测试节点 192.168.0.13:16620，用于验证"编辑不丢字段"）。 */
const LIVE_TCP_ROUTE = {
  id: '398f2fae-f57f-4dbe-a115-d8cf598184f0',
  name: '8880-服务转发',
  server_port: 8880,
  protocol: 'TCP',
  create_time: 1787553801,
  update_time: 1787553801,
  upstream: {
    type: 'roundrobin',
    pass_host: 'node',
    checks: { active: { unhealthy: {} }, passive: {} },
    scheme: 'tcp',
    nodes: { '192.168.0.13:8112': 100, '192.168.0.13:8111': 100 },
  },
}

const LIVE_DNS_ROUTE = {
  id: 'ce6ea88d-49e7-43b5-8c22-e2c65e10e82d',
  name: 'test.com 解析',
  server_port: 53,
  protocol: 'UDP',
  create_time: 1787555276,
  update_time: 1788411602,
  plugins: { dns_upstream: { disable: false, hosts: { 'test.com': { type: 'chash' } } } },
}

function wrap(rows: unknown[]) {
  return rows.map((value) => ({ value }))
}

function form(overrides: Partial<StreamRouteForm> = {}): StreamRouteForm {
  return { ...emptyStreamRouteForm(), ...overrides }
}

describe('emptyStreamRouteForm', () => {
  it('默认协议 TCP、上游 roundrobin/tcp、一个空节点', () => {
    const f = emptyStreamRouteForm()
    expect(f.protocol).toBe('TCP')
    expect(f.upstream.type).toBe('roundrobin')
    expect(f.upstream.scheme).toBe('tcp')
    expect(f.server_port).toBeNull()
    expect(f.upstream.nodes).toEqual([{ host: '', weight: 100 }])
  })
})

describe('formFromStreamRoute', () => {
  it('回填线上 TCP 路由（含端口/名称/协议/上游节点）', () => {
    const f = formFromStreamRoute(LIVE_TCP_ROUTE as never)
    expect(f.server_port).toBe(8880)
    expect(f.name).toBe('8880-服务转发')
    expect(f.protocol).toBe('TCP')
    expect(f.upstream.type).toBe('roundrobin')
    expect(f.upstream.scheme).toBe('tcp')
    expect(f.upstream.nodes).toEqual([
      { host: '192.168.0.13:8112', weight: 100 },
      { host: '192.168.0.13:8111', weight: 100 },
    ])
  })

  it('回填无 upstream 的路由（DNS 型）时不炸，协议保留 UDP', () => {
    const f = formFromStreamRoute(LIVE_DNS_ROUTE as never)
    expect(f.server_port).toBe(53)
    expect(f.protocol).toBe('UDP')
    expect(f.upstream.nodes).toEqual([{ host: '', weight: 100 }])
  })

  it('非数值权重归一为 100（线上 DNS 路由的节点值是空数组）', () => {
    const f = formFromStreamRoute({
      server_port: 53,
      upstream: { nodes: { '10.0.0.1:80': [], '10.0.0.2:80': 5 } },
    } as never)
    expect(f.upstream.nodes).toEqual([
      { host: '10.0.0.1:80', weight: 100 },
      { host: '10.0.0.2:80', weight: 5 },
    ])
  })
})

describe('validateStreamRouteForm', () => {
  const base = form({ server_port: 9000 })

  it('缺监听端口', () => {
    expect(validateStreamRouteForm(form(), [])).toContain('请填写监听端口')
  })

  it('输入框清空（v-model.number 给出空字符串）按未填写处理', () => {
    const cleared = { ...form(), server_port: '' } as unknown as StreamRouteForm
    expect(validateStreamRouteForm(cleared, [])).toContain('请填写监听端口')
  })

  it('非整数端口被拦', () => {
    expect(validateStreamRouteForm(form({ server_port: 80.5 }), [])).toContain('监听端口需在 1–65535 之间')
  })

  it.each([0, 65536, -1])('端口越界 %i', (port) => {
    expect(validateStreamRouteForm(form({ server_port: port }), [])).toContain('监听端口需在 1–65535 之间')
  })

  it('无上游节点', () => {
    const f = form({ server_port: 9000, upstream: { ...base.upstream, nodes: [{ host: '   ', weight: 100 }] } })
    expect(validateStreamRouteForm(f, [])).toContain('至少填写一个上游节点')
  })

  it('节点缺端口号', () => {
    const f = form({ server_port: 9000, upstream: { ...base.upstream, nodes: [{ host: '10.0.0.1', weight: 100 }] } })
    expect(validateStreamRouteForm(f, []).join()).toContain('上游节点需为 地址:端口')
  })

  it('端口与列表内其它路由冲突', () => {
    const rows = wrap([LIVE_TCP_ROUTE])
    expect(validateStreamRouteForm(form({ server_port: 8880 }), rows).join()).toContain('已被其它四层代理占用')
  })

  it('编辑自身时端口不算冲突', () => {
    const rows = wrap([LIVE_TCP_ROUTE])
    const f = form({
      server_port: 8880,
      upstream: {
        type: 'roundrobin',
        scheme: 'tcp',
        hash_on: 'vars',
        key: 'remote_addr',
        nodes: [{ host: '10.0.0.1:80', weight: 100 }],
      },
    })
    expect(validateStreamRouteForm(f, rows, LIVE_TCP_ROUTE.id)).toEqual([])
  })

  it('合法表单无错误', () => {
    const f = form({
      server_port: 9000,
      upstream: {
        type: 'roundrobin',
        scheme: 'tcp',
        hash_on: 'vars',
        key: 'remote_addr',
        nodes: [{ host: '10.0.0.1:80', weight: 100 }],
      },
    })
    expect(validateStreamRouteForm(f, [])).toEqual([])
  })
})

describe('buildStreamRoutePayload', () => {
  it('新建：只发已填字段，upstream 结构完整', () => {
    const f = form({
      server_port: 9001,
      name: '新代理',
      protocol: 'TCP',
      upstream: {
        type: 'roundrobin',
        scheme: 'tcp',
        hash_on: 'vars',
        key: 'remote_addr',
        nodes: [{ host: '10.0.0.1:80', weight: 100 }],
      },
    })
    expect(buildStreamRoutePayload(f)).toEqual({
      server_port: 9001,
      name: '新代理',
      protocol: 'TCP',
      upstream: { type: 'roundrobin', scheme: 'tcp', nodes: { '10.0.0.1:80': 100 } },
    })
  })

  it('新建：可选字段留空则不出现在载荷里（协议有默认值故始终随载荷发出）', () => {
    const f = form({
      server_port: 9001,
      upstream: {
        type: 'roundrobin',
        scheme: 'tcp',
        hash_on: 'vars',
        key: 'remote_addr',
        nodes: [{ host: '10.0.0.1:80', weight: 100 }],
      },
    })
    const payload = buildStreamRoutePayload(f)
    expect(Object.keys(payload).sort()).toEqual(['protocol', 'server_port', 'upstream'])
    expect(payload.protocol).toBe('TCP')
  })

  it('编辑：保留 plugins 与 upstream.checks / pass_host', () => {
    const f = formFromStreamRoute(LIVE_TCP_ROUTE as never)
    f.name = '8880-改名'

    const payload = buildStreamRoutePayload(f, LIVE_TCP_ROUTE as never)

    expect(payload.name).toBe('8880-改名')
    expect((payload.upstream as Record<string, unknown>).checks).toEqual({
      active: { unhealthy: {} },
      passive: {},
    })
    expect((payload.upstream as Record<string, unknown>).pass_host).toBe('node')
  })

  it('编辑：节点由表单全权覆盖', () => {
    const f = formFromStreamRoute(LIVE_TCP_ROUTE as never)
    f.upstream.nodes = [{ host: '10.9.9.9:9999', weight: 7 }]

    const payload = buildStreamRoutePayload(f, LIVE_TCP_ROUTE as never)

    expect((payload.upstream as Record<string, unknown>).nodes).toEqual({ '10.9.9.9:9999': 7 })
  })

  it('编辑：不把服务端管理的元数据回写（id / create_time / update_time）', () => {
    const f = formFromStreamRoute(LIVE_TCP_ROUTE as never)

    const payload = buildStreamRoutePayload(f, LIVE_TCP_ROUTE as never)

    expect(payload).not.toHaveProperty('id')
    expect(payload).not.toHaveProperty('create_time')
    expect(payload).not.toHaveProperty('update_time')
  })

  it('编辑 DNS 型路由：plugins 保留且新增 upstream', () => {
    const f = formFromStreamRoute(LIVE_DNS_ROUTE as never)
    f.upstream.nodes = [{ host: '10.0.0.1:53', weight: 100 }]

    const payload = buildStreamRoutePayload(f, LIVE_DNS_ROUTE as never)

    expect(payload.plugins).toEqual({ dns_upstream: { disable: false, hosts: { 'test.com': { type: 'chash' } } } })
    expect((payload.upstream as Record<string, unknown>).nodes).toEqual({ '10.0.0.1:53': 100 })
  })

  it('chash：输出 hash_on/key', () => {
    const f = form({
      server_port: 9002,
      upstream: {
        type: 'chash',
        scheme: 'tcp',
        hash_on: 'vars',
        key: 'remote_addr',
        nodes: [{ host: '10.0.0.1:80', weight: 1 }],
      },
    })
    const upstream = buildStreamRoutePayload(f).upstream as Record<string, unknown>
    expect(upstream.hash_on).toBe('vars')
    expect(upstream.key).toBe('remote_addr')
  })

  it('非 chash：即便基底带 hash_on/key 也不输出', () => {
    const f = form({
      server_port: 9002,
      upstream: {
        type: 'roundrobin',
        scheme: 'tcp',
        hash_on: '',
        key: '',
        nodes: [{ host: '10.0.0.1:80', weight: 1 }],
      },
    })
    const base = { upstream: { hash_on: 'vars', key: 'remote_addr' } }
    const upstream = buildStreamRoutePayload(f, base as never).upstream as Record<string, unknown>
    expect(upstream).not.toHaveProperty('hash_on')
    expect(upstream).not.toHaveProperty('key')
  })

  it('编辑时清空可选字段 → 从载荷中移除该键', () => {
    const f = formFromStreamRoute(LIVE_TCP_ROUTE as never)
    f.name = ''
    f.sni = ''
    f.remote_addr = ''

    const payload = buildStreamRoutePayload(f, LIVE_TCP_ROUTE as never)

    expect(payload).not.toHaveProperty('name')
    expect(payload).not.toHaveProperty('sni')
    expect(payload).not.toHaveProperty('remote_addr')
  })
})
