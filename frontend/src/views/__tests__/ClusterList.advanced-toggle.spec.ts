import { describe, it, expect, beforeEach } from 'vitest'
import { reactive, watch, nextTick } from 'vue'

const defaultChecksJson = JSON.stringify({
  passive: {},
  active: { unhealthy: {} }
}, null, 2)

const defaultTimeout = { connect: 6, send: 6, read: 6 }

interface KeepalivePool {
  size: number | undefined
  idle_timeout: number | undefined
  requests: number | undefined
}

interface UpstreamForm {
  checks: Record<string, any>
  retries: number | undefined
  retry_timeout: number
  timeout: { connect: number | undefined; send: number | undefined; read: number | undefined }
  pass_host: string
  upstream_host: string
  scheme: string
  keepalive_pool: KeepalivePool
  advancedEnabled: boolean
}

interface RouteForm {
  advancedMatchEnabled: boolean
  advancedMatch: { vars: [string, string, string][] }
}

function createUpstreamForm() {
  const form = reactive<UpstreamForm>({
    checks: JSON.parse(defaultChecksJson),
    retries: undefined,
    retry_timeout: 0,
    timeout: { ...defaultTimeout },
    pass_host: 'pass',
    upstream_host: '',
    scheme: 'http',
    keepalive_pool: { size: undefined, idle_timeout: undefined, requests: undefined },
    advancedEnabled: false,
  })

  watch(() => form.advancedEnabled, (newVal) => {
    if (!newVal) {
      form.checks = JSON.parse(defaultChecksJson)
      form.retries = undefined
      form.retry_timeout = 0
      form.timeout = { ...defaultTimeout }
      form.pass_host = 'pass'
      form.upstream_host = ''
      form.scheme = 'http'
      form.keepalive_pool = { size: undefined, idle_timeout: undefined, requests: undefined }
    }
  })

  return form
}

function createRouteForm() {
  const form = reactive<RouteForm>({
    advancedMatchEnabled: false,
    advancedMatch: { vars: [] },
  })

  watch(() => form.advancedMatchEnabled, (newVal) => {
    if (!newVal) {
      form.advancedMatch = { vars: [] }
    }
  })

  return form
}

describe('Upstream 高级配置开关', () => {
  let form: UpstreamForm

  beforeEach(() => {
    form = createUpstreamForm()
  })

  it('初始状态为关闭，所有高级字段为默认值', () => {
    expect(form.advancedEnabled).toBe(false)
    expect(form.retries).toBeUndefined()
    expect(form.retry_timeout).toBe(0)
    expect(form.timeout).toEqual(defaultTimeout)
    expect(form.pass_host).toBe('pass')
    expect(form.upstream_host).toBe('')
    expect(form.scheme).toBe('http')
    expect(form.keepalive_pool).toEqual({ size: undefined, idle_timeout: undefined, requests: undefined })
  })

  it('开启后填入自定义值，字段保留', async () => {
    form.advancedEnabled = true
    await nextTick()

    form.checks = { custom: 'value' }
    form.retries = 5
    form.retry_timeout = 10
    form.timeout = { connect: 1, send: 2, read: 3 }
    form.pass_host = 'rewrite'
    form.upstream_host = 'myhost.com'
    form.scheme = 'https'
    form.keepalive_pool = { size: 64, idle_timeout: 30, requests: 1000 }

    expect(form.retries).toBe(5)
    expect(form.retry_timeout).toBe(10)
    expect(form.pass_host).toBe('rewrite')
    expect(form.upstream_host).toBe('myhost.com')
    expect(form.scheme).toBe('https')
  })

  it('关闭开关时重置所有高级字段为默认值', async () => {
    form.advancedEnabled = true
    await nextTick()
    form.retries = 5
    form.retry_timeout = 10
    form.timeout = { connect: 1, send: 2, read: 3 }
    form.pass_host = 'rewrite'
    form.upstream_host = 'myhost.com'
    form.scheme = 'https'
    form.keepalive_pool = { size: 64, idle_timeout: 30, requests: 1000 }

    form.advancedEnabled = false
    await nextTick()

    expect(form.retries).toBeUndefined()
    expect(form.retry_timeout).toBe(0)
    expect(form.timeout).toEqual(defaultTimeout)
    expect(form.pass_host).toBe('pass')
    expect(form.upstream_host).toBe('')
    expect(form.scheme).toBe('http')
    expect(form.keepalive_pool).toEqual({ size: undefined, idle_timeout: undefined, requests: undefined })
  })

  it('关闭后再次开启，字段为空默认状态', async () => {
    form.advancedEnabled = true
    await nextTick()
    form.retries = 5
    form.retry_timeout = 10

    form.advancedEnabled = false
    await nextTick()
    expect(form.retries).toBeUndefined()
    expect(form.retry_timeout).toBe(0)

    form.advancedEnabled = true
    await nextTick()
    // 再次开启时应该还是默认值（不是之前的值）
    expect(form.retries).toBeUndefined()
    expect(form.retry_timeout).toBe(0)
  })

  it('多次关闭重置不会抛出异常', async () => {
    form.advancedEnabled = true
    await nextTick()
    form.retries = 99

    form.advancedEnabled = false
    await nextTick()
    form.advancedEnabled = true
    await nextTick()
    form.retries = 88
    form.advancedEnabled = false
    await nextTick()

    expect(form.retries).toBeUndefined()
    expect(form.retry_timeout).toBe(0)
  })
})

describe('Route 高级匹配开关', () => {
  let form: RouteForm

  beforeEach(() => {
    form = createRouteForm()
  })

  it('初始状态为关闭，vars 为空', () => {
    expect(form.advancedMatchEnabled).toBe(false)
    expect(form.advancedMatch.vars).toEqual([])
  })

  it('开启后填入匹配规则，字段保留', async () => {
    form.advancedMatchEnabled = true
    await nextTick()

    form.advancedMatch.vars.push(['arg_name', '==', 'test'])
    expect(form.advancedMatch.vars).toHaveLength(1)
  })

  it('关闭开关时重置 vars 为空数组', async () => {
    form.advancedMatchEnabled = true
    await nextTick()
    form.advancedMatch.vars.push(['arg_name', '==', 'test'])
    form.advancedMatch.vars.push(['remote_addr', '~~', '192\\.168\\.'])

    form.advancedMatchEnabled = false
    await nextTick()

    expect(form.advancedMatch.vars).toEqual([])
  })

  it('关闭后再次开启，vars 为空', async () => {
    form.advancedMatchEnabled = true
    await nextTick()
    form.advancedMatch.vars.push(['arg_name', '==', 'test'])

    form.advancedMatchEnabled = false
    await nextTick()
    expect(form.advancedMatch.vars).toEqual([])

    form.advancedMatchEnabled = true
    await nextTick()
    expect(form.advancedMatch.vars).toEqual([])
  })
})
