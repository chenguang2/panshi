import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AxiosError } from 'axios'
import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setActivePinia, createPinia } from 'pinia'
import { message } from 'ant-design-vue'
import api from '@/api'
import router, { featureRouteMap } from '@/router'
import type { RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { buildCertZip, downloadBlob } from '@/utils/download'

// 仅 M4 用例需要本地打包（buildCertZip/downloadBlob）；mock 掉避免 jszip 真实打包
vi.mock('@/utils/download', () => ({
  sanitizeFilename: (s: string) => s,
  buildCertZip: vi.fn(),
  downloadBlob: vi.fn(),
  downloadPem: vi.fn(),
}))

// URL 感知 fake adapter（约定 #43：禁止 mockResolvedValueOnce 调用顺序链）：
// 按 config.url 返回预设状态码，401/5xx 以真实 AxiosError 抛出，走完整拦截器链。
const originalAdapter = api.defaults.adapter
function fakeApiAdapter(handler: (url: string | undefined) => { status: number; data?: unknown }) {
  api.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
    const outcome = handler(config.url)
    const response: AxiosResponse = {
      data: outcome.data ?? {},
      status: outcome.status,
      statusText: String(outcome.status),
      headers: {},
      config,
    }
    if (outcome.status >= 400) {
      throw new AxiosError(
        `Request failed with status code ${outcome.status}`,
        outcome.status < 500 ? AxiosError.ERR_BAD_REQUEST : AxiosError.ERR_BAD_RESPONSE,
        config,
        {},
        response,
      )
    }
    return response
  }) as AxiosAdapter
}

function seedSession() {
  localStorage.setItem('token', 'tok-1')
  localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role: 'admin', status: 1 }))
  localStorage.setItem('permissions', JSON.stringify(['clusters', 'routes']))
}

beforeEach(() => {
  setActivePinia(createPinia())
  localStorage.clear()
})

afterEach(() => {
  api.defaults.adapter = originalAdapter
  vi.restoreAllMocks()
})

describe('缺陷一：会话清理完整 + 登出容错', () => {
  it('① logout 服务端失败时本地会话仍被完整清理，且不向上抛错', async () => {
    seedSession()
    const store = useAuthStore()
    fakeApiAdapter(() => ({ status: 500 }))

    await expect(store.logout()).resolves.toBeUndefined()

    expect(store.token).toBeNull()
    expect(store.user).toBeNull()
    expect(store.permissions).toEqual([])
    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
    expect(localStorage.getItem('permissions')).toBeNull()
  })

  it('② 401 拦截器触发后清空 token/user/permissions 并复位 store、跳转 /login', async () => {
    seedSession()
    const store = useAuthStore()
    expect(store.permissions).toEqual(['clusters', 'routes'])
    const pushSpy = vi.spyOn(router, 'push').mockImplementation(() => Promise.resolve(undefined))
    const errorSpy = vi.spyOn(message, 'error')
    fakeApiAdapter((url) => (url === '/clusters' ? { status: 401 } : { status: 200 }))

    await expect(api.get('/clusters')).rejects.toThrow()

    expect(store.token).toBeNull()
    expect(store.user).toBeNull()
    expect(store.permissions).toEqual([])
    expect(localStorage.getItem('token')).toBeNull()
    expect(localStorage.getItem('user')).toBeNull()
    expect(localStorage.getItem('permissions')).toBeNull()
    expect(pushSpy).toHaveBeenCalledWith('/login')
    expect(errorSpy).toHaveBeenCalled()
  })

  it('②c 并发 401 只弹一次「登录状态已失效」（时间窗去重；清会话与跳转不受影响）', async () => {
    seedSession()
    const store = useAuthStore()
    const pushSpy = vi.spyOn(router, 'push').mockImplementation(() => Promise.resolve(undefined))
    const errorSpy = vi.spyOn(message, 'error')
    fakeApiAdapter((url) => (url === '/clusters' ? { status: 401 } : { status: 200 }))
    // 系统时间前推 60s，避开同文件前序 401 用例（②）在真实时间轴留下的去重窗
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 60_000)

    try {
      await Promise.allSettled([api.get('/clusters'), api.get('/clusters')])
      // 动态 import 已就绪，微任务一拍即可冲刷完两条拦截器链
      await Promise.resolve()
      await Promise.resolve()

      // 清会话与跳转逐次执行（幂等），toast 只弹一次
      expect(store.token).toBeNull()
      expect(pushSpy).toHaveBeenCalledTimes(2)
      expect(errorSpy).toHaveBeenCalledTimes(1)
      expect(errorSpy).toHaveBeenCalledWith('登录状态已失效，请重新登录')
    } finally {
      vi.useRealTimers()
    }
  })

  it('②b 非 401 错误不清本地会话', async () => {
    seedSession()
    const store = useAuthStore()
    fakeApiAdapter((url) => (url === '/clusters' ? { status: 500 } : { status: 200 }))

    await expect(api.get('/clusters')).rejects.toThrow()

    expect(store.token).toBe('tok-1')
    expect(store.permissions).toEqual(['clusters', 'routes'])
    expect(localStorage.getItem('permissions')).not.toBeNull()
  })
})

describe('缺陷三：adminOnly 路由注册', () => {
  it('③ /users 路由声明 adminOnly（非管理员被守卫重定向到 /）', () => {
    const usersRoute = router.getRoutes().find((r) => r.name === 'Users')
    expect(usersRoute).toBeDefined()
    expect(usersRoute?.meta.adminOnly).toBe(true)
  })

  it('③ ansible-inventory 功能路由声明 adminOnly', () => {
    const route = featureRouteMap.ansible_inventory as RouteRecordRaw
    expect(route.meta?.adminOnly).toBe(true)
  })
})

describe('缺陷四：features 加载重试上限', () => {
  it('④ 持续失败时最多尝试 1+5 次后放行（返回 false，不阻塞启动）', async () => {
    window.__PANSHI_BOOTSTRAPPED__ = true
    const { loadFeaturesWithRetry } = await import('@/main')
    vi.useFakeTimers()
    try {
      let calls = 0
      const load = vi.fn(async () => {
        calls += 1
        throw new Error('features down')
      })
      const pending = loadFeaturesWithRetry(load)
      const [ok] = await Promise.all([pending, vi.runAllTimersAsync()])
      expect(ok).toBe(false)
      expect(calls).toBe(6)
    } finally {
      vi.useRealTimers()
    }
  })

  it('④ 重试内成功返回 true 且不再继续重试', async () => {
    window.__PANSHI_BOOTSTRAPPED__ = true
    const { loadFeaturesWithRetry } = await import('@/main')
    vi.useFakeTimers()
    try {
      let calls = 0
      const load = vi.fn(async () => {
        calls += 1
        if (calls < 3) throw new Error('features down')
      })
      const pending = loadFeaturesWithRetry(load)
      const [ok] = await Promise.all([pending, vi.runAllTimersAsync()])
      expect(ok).toBe(true)
      expect(calls).toBe(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('④ 源码守卫：main.ts 不再有裸 while(true)，失败提示文案存在', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/main.ts'), 'utf-8')
    expect(src).not.toMatch(/while\s*\(\s*true\s*\)/)
    expect(src).toContain('系统功能配置加载失败，请刷新重试')
  })
})

describe('缺陷二：SSL 生成结果客户端证书包下载', () => {
  it('⑤ 点击下载走本地打包（buildCertZip + downloadBlob），不再 window.open 死链', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    vi.mocked(buildCertZip).mockResolvedValue(new Blob(['zip-bytes']))
    const { mount } = await import('@vue/test-utils')
    const { default: SslGenerateDialog } = await import('@/components/SslGenerateDialog.vue')
    const wrapper = mount(SslGenerateDialog, {
      props: { visible: true, clusters: [] },
      global: {
        stubs: {
          ASelect: { template: '<div><slot /></div>' },
          ASelectOption: { template: '<div><slot /></div>' },
          ATooltip: { template: '<span><slot /></span>' },
        },
      },
    })
    await wrapper.vm.$nextTick()
    wrapper.vm.resultData = {
      server: { id: 1, name: 'srv' },
      client: { id: 9, name: 'cli', cert: 'CERT-PEM', key: 'KEY-PEM' },
    }

    await wrapper.vm.downloadClientBundle(wrapper.vm.resultData.client)

    expect(openSpy).not.toHaveBeenCalled()
    expect(buildCertZip).toHaveBeenCalledTimes(1)
    expect(vi.mocked(buildCertZip).mock.calls[0][1]).toEqual(expect.arrayContaining(['cert', 'key']))
    expect(downloadBlob).toHaveBeenCalledTimes(1)
    expect(vi.mocked(downloadBlob).mock.calls[0][1]).toBe('cli_client_bundle.zip')
    wrapper.unmount()
  })
})
