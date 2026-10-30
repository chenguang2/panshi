/**
 * Tools.vue 组件回归（tools-ux-review-fixes，2026-10-30 UX 评审，用户裁决全 A）。
 *
 * 覆盖：剪贴板 http 回退（execCommand）、面板复制按钮语义（YAML bug）、
 * 深链 ?tool=、SM4 短密钥警告、清空按钮、Lua 按钮文案、错误文案指引。
 *
 * jsdom 无 navigator.clipboard（天然等价 http insecure context）——复制回退
 * 路径即真实内网路径；execCommand 由 stub 提供。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'

const mockMessage = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }
vi.mock('ant-design-vue', () => ({ message: mockMessage }))

const stubs = {
  'a-layout': { template: '<div class="tools-layout"><slot /></div>' },
  'a-layout-sider': { template: '<div class="tools-sider"><slot /></div>', props: ['width'] },
  'a-layout-content': { template: '<div class="tools-content"><slot /></div>' },
  'a-tooltip': { template: '<span class="tt"><slot /></span>', props: ['title', 'placement'] },
  'a-textarea': {
    props: ['value', 'placeholder', 'rows', 'readonly'],
    emits: ['update:value'],
    template:
      '<textarea class="a-textarea" :value="value" :readonly="readonly" @input="$emit(\'update:value\', $event.target.value)" />',
  },
  'a-button': {
    template: '<button class="a-btn" :disabled="disabled || undefined" @click="$emit(\'click\')"><slot /></button>',
    props: ['type', 'size', 'disabled'],
  },
  'a-input-password': {
    props: ['value', 'placeholder'],
    emits: ['update:value'],
    template:
      '<input class="a-input-password" type="password" :value="value" @input="$emit(\'update:value\', $event.target.value)" />',
  },
}

function makeRouter(initial = '/tools') {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/tools', component: { template: '<div />' } }],
  })
}

async function mountTools(router = makeRouter(), initial = '/tools') {
  const Tools = (await import('../Tools.vue')).default
  await router.push(initial)
  await router.isReady()
  const wrapper = mount(Tools, { global: { plugins: [router], stubs } })
  await flushPromises()
  return wrapper
}

function navItems(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('.nav-item')
}

function textareas(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('textarea')
}

beforeEach(() => {
  vi.clearAllMocks()
  // jsdom 默认无 navigator.clipboard —— 天然 http 形态
  const doc = document as Document & { execCommand?: unknown }
  doc.execCommand = vi.fn(() => true)
})

describe('Tools 批 1：剪贴板回退与复制语义', () => {
  it('http（无 clipboard API）下复制走 execCommand 回退并提示已复制', async () => {
    expect(navigator.clipboard, 'jsdom 应无 clipboard API').toBeUndefined()
    const wrapper = await mountTools()
    const ta = textareas(wrapper)[0]
    await ta.setValue('hello world')
    const copyBtn = wrapper.findAll('.copy-row .a-btn').find((b) => b.text() === '复制')!
    await copyBtn.trigger('click')
    await flushPromises()
    const doc = document as Document & { execCommand: ReturnType<typeof vi.fn> }
    expect(doc.execCommand).toHaveBeenCalledWith('copy')
    expect(mockMessage.success).toHaveBeenCalledWith('已复制到剪贴板')
    expect(mockMessage.error).not.toHaveBeenCalled()
  })

  it('复制空内容提示「没有可复制的内容」且不触发 execCommand', async () => {
    const wrapper = await mountTools()
    const copyBtn = wrapper.findAll('.copy-row .a-btn').find((b) => b.text() === '复制')!
    await copyBtn.trigger('click')
    await flushPromises()
    expect(mockMessage.warning).toHaveBeenCalledWith('没有可复制的内容')
    const doc = document as Document & { execCommand: ReturnType<typeof vi.fn> }
    expect(doc.execCommand).not.toHaveBeenCalled()
  })

  it('http 下粘贴聚焦输入框并明示 Ctrl+V 引导（不报错）', async () => {
    const wrapper = await mountTools()
    const pasteBtn = wrapper.findAll('.copy-row .a-btn').find((b) => b.text() === '粘贴')!
    await pasteBtn.trigger('click')
    await flushPromises()
    expect(mockMessage.info).toHaveBeenCalledWith('浏览器限制剪贴板读取，请点击输入框后按 Ctrl+V 粘贴')
    expect(mockMessage.error).not.toHaveBeenCalled()
  })

  it('YAML 输入框旁复制复制的是输入（bug 修复：原复制输出）', async () => {
    const router = makeRouter()
    const wrapper = await mountTools(router, '/tools?tool=yaml')
    await flushPromises()
    const tas = textareas(wrapper)
    await tas[0].setValue('YAML_INPUT_MARKER: 1')
    // 伪造输出不同值：直接改组件状态不必要——输入 ≠ 输出（输出初始为空）即可区分
    const inputCopy = wrapper.findAll('.copy-row .a-btn').find((b) => b.text() === '复制')!
    await inputCopy.trigger('click')
    await flushPromises()
    const doc = document as Document & { execCommand: ReturnType<typeof vi.fn> }
    expect(doc.execCommand).toHaveBeenCalled()
    // execCommand 无法捕获复制内容——改为断言组件行为：临时钩子读 textarea 选中值
    // （jsdom select() 作用于 stub textarea；这里断言复制前组件未改写输入即可，
    //  内容正确性由「复制调用时读取的 ref」单点保证：源码 grep 防回归见 1.2 守卫）
    expect(mockMessage.success).toHaveBeenCalledWith('已复制到剪贴板')
  })
})

describe('Tools 批 2：深链 / 短密钥警告 / 清空 / 导航文字', () => {
  it('导航栏每项同时含图标与文字标签（13 个工具）', async () => {
    const wrapper = await mountTools()
    const items = navItems(wrapper)
    expect(items).toHaveLength(13)
    for (const item of items) {
      expect(item.text().trim().length, '导航项应有文字').toBeGreaterThan(0)
    }
  })

  it('进页读 ?tool= 恢复对应工具；非法值回退 lua', async () => {
    const wrapper = await mountTools(makeRouter(), '/tools?tool=sm4')
    expect(wrapper.find('.tool-header').text()).toContain('SM4')
    const bad = await mountTools(makeRouter(), '/tools?tool=unknown')
    expect(bad.find('.tool-header').text()).toContain('Lua')
  })

  it('切换工具更新 URL query（不刷新）', async () => {
    const router = makeRouter()
    const wrapper = await mountTools(router, '/tools')
    await navItems(wrapper)[2].trigger('click') // JSON 格式化
    await flushPromises()
    expect(router.currentRoute.value.query.tool).toBe('json')
    expect(router.currentRoute.value.fullPath).toBe('/tools?tool=json')
  })

  it('SM4 短密钥显示黄条警告（含实际字节数，不阻断）', async () => {
    const wrapper = await mountTools(makeRouter(), '/tools?tool=sm4')
    const keyInput = wrapper.find('.a-input-password')
    await keyInput.setValue('short')
    const tas = textareas(wrapper)
    await tas[0].setValue('secret data')
    const encBtn = wrapper.findAll('.panel-actions .a-btn').find((b) => b.text().includes('加密'))!
    await encBtn.trigger('click')
    await flushPromises()
    const warn = wrapper.find('.sm4-warn')
    expect(warn.exists()).toBe(true)
    expect(warn.text()).toContain('5 字节')
    expect(warn.text()).toContain('可能不一致')
    // 往返一致不阻断
    const decBtn = wrapper.findAll('.panel-actions .a-btn').find((b) => b.text().includes('解密'))!
    await decBtn.trigger('click')
    await flushPromises()
    expect(textareas(wrapper)[0].element.value).toBe('secret data')
  })

  it('SM4 16 字节密钥无警告', async () => {
    const wrapper = await mountTools(makeRouter(), '/tools?tool=sm4')
    const tas = textareas(wrapper)
    await tas[0].setValue('secret data')
    const encBtn = wrapper.findAll('.panel-actions .a-btn').find((b) => b.text().includes('加密'))!
    await encBtn.trigger('click')
    await flushPromises()
    expect(wrapper.find('.sm4-warn').exists()).toBe(false)
  })

  it('清空按钮：清当前工具输入与输出', async () => {
    const wrapper = await mountTools(makeRouter(), '/tools?tool=sm4')
    const tas = textareas(wrapper)
    await tas[0].setValue('abc')
    await tas[1].setValue('xyz==')
    const clearBtn = wrapper.findAll('button').find((b) => b.text() === '清空')!
    await clearBtn.trigger('click')
    await flushPromises()
    expect(textareas(wrapper)[0].element.value).toBe('')
    expect(textareas(wrapper)[1].element.value).toBe('')
  })

  it('diff 清空同时清 A/B/结果', async () => {
    const wrapper = await mountTools(makeRouter(), '/tools?tool=diff')
    const tas = textareas(wrapper)
    expect(tas.length).toBe(2)
    await tas[0].setValue('{"a":1}')
    await tas[1].setValue('{"b":2}')
    const clearBtn = wrapper.findAll('button').find((b) => b.text() === '清空')!
    await clearBtn.trigger('click')
    await flushPromises()
    expect(textareas(wrapper)[0].element.value).toBe('')
    expect(textareas(wrapper)[1].element.value).toBe('')
  })
})

describe('Tools 新工具（tools-new-utilities）', () => {
  it('时间戳：epoch 秒输入即算，展示北京时间对照（无后缀按 UTC）', async () => {
    const wrapper = await mountTools(makeRouter(), '/tools?tool=timestamp')
    await textareas(wrapper)[0].setValue('2026-10-30 08:00:00')
    await flushPromises()
    const grid = wrapper.find('.result-grid')
    expect(grid.exists()).toBe(true)
    expect(grid.text()).toContain('2026-10-30 16:00:00') // UTC+8
    expect(grid.text()).toContain('按 UTC 解析')
  })

  it('时间戳：13 位毫秒与非法输入', async () => {
    const wrapper = await mountTools(makeRouter(), '/tools?tool=timestamp')
    await textareas(wrapper)[0].setValue('1793331059000')
    await flushPromises()
    expect(wrapper.find('.result-grid').text()).toContain('毫秒')
    await textareas(wrapper)[0].setValue('hello')
    await flushPromises()
    expect(wrapper.find('.diff-error').text()).toContain('无法识别的时间格式')
  })

  it('时间戳「当前时间」按钮填充毫秒并出结果', async () => {
    const wrapper = await mountTools(makeRouter(), '/tools?tool=timestamp')
    const nowBtn = wrapper.findAll('button').find((b) => b.text() === '当前时间')!
    await nowBtn.trigger('click')
    await flushPromises()
    expect(textareas(wrapper)[0].element.value).toMatch(/^\d{13}$/)
    expect(wrapper.find('.result-grid').exists()).toBe(true)
  })

  it('JWT：合法 token 解出 header/payload 与 exp 状态', async () => {
    const b64url = (o: object): string =>
      btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const token = `${b64url({ alg: 'HS256' })}.${b64url({ sub: 'admin', exp: Math.floor(Date.now() / 1000) + 600 })}.sig`
    const wrapper = await mountTools(makeRouter(), '/tools?tool=jwt')
    await textareas(wrapper)[0].setValue(token)
    await flushPromises()
    expect(wrapper.find('.jwt-pre').text()).toContain('"alg": "HS256"')
    const expRow = wrapper.find('.exp-tag')
    expect(expRow.classes()).toContain('is-alive')
    expect(expRow.text()).toContain('分钟')
  })

  it('JWT：过期 token 显示「已过期」；非法输入报错', async () => {
    const b64url = (o: object): string =>
      btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const token = `${b64url({ alg: 'HS256' })}.${b64url({ sub: 'a', exp: 1000 })}.sig`
    const wrapper = await mountTools(makeRouter(), '/tools?tool=jwt')
    await textareas(wrapper)[0].setValue(token)
    await flushPromises()
    expect(wrapper.find('.exp-tag').classes()).toContain('is-expired')
    await textareas(wrapper)[0].setValue('not-a-jwt')
    await flushPromises()
    expect(wrapper.find('.diff-error').text()).toContain('三段')
  })

  it('YAML↔JSON 互转：双向转换与错误', async () => {
    const wrapper = await mountTools(makeRouter(), '/tools?tool=convert')
    const tas = textareas(wrapper)
    expect(tas).toHaveLength(2)
    await tas[0].setValue('key: value')
    const toJson = wrapper.findAll('.panel-actions .a-btn').find((b) => b.text() === 'YAML → JSON')!
    await toJson.trigger('click')
    await flushPromises()
    expect(JSON.parse(tas[1].element.value)).toEqual({ key: 'value' })
    await tas[0].setValue('{"k2":"v2"}')
    const toYaml = wrapper.findAll('.panel-actions .a-btn').find((b) => b.text() === 'JSON → YAML')!
    await toYaml.trigger('click')
    await flushPromises()
    expect(tas[1].element.value).toContain('k2: v2')
    // 错误路径
    await tas[0].setValue('a: [unclosed')
    await toJson.trigger('click')
    await flushPromises()
    expect(tas[1].element.value).toContain('YAML 解析失败')
  })

  it('深链支持新工具 key（timestamp/jwt/convert）', async () => {
    for (const key of ['timestamp', 'jwt', 'convert']) {
      const wrapper = await mountTools(makeRouter(), `/tools?tool=${key}`)
      expect(wrapper.find('.tool-panel').exists()).toBe(true)
    }
  })

  it('文本 Diff：行差异渲染与一致提示', async () => {
    const wrapper = await mountTools(makeRouter(), '/tools?tool=textdiff')
    const tas = textareas(wrapper)
    expect(tas).toHaveLength(2)
    await tas[0].setValue('line1\nline2')
    await tas[1].setValue('line1\nline2-changed')
    const btn = wrapper.findAll('.panel-actions .a-btn').find((b) => b.text() === '对比 →')!
    await btn.trigger('click')
    await flushPromises()
    expect(wrapper.find('.diff-result-box').text()).toContain('处差异')
    // 一致
    await tas[1].setValue('line1\nline2')
    await btn.trigger('click')
    await flushPromises()
    expect(wrapper.find('.diff-result-box').text()).toContain('完全一致')
  })

  it('文本 Diff：空输入校验', async () => {
    const wrapper = await mountTools(makeRouter(), '/tools?tool=textdiff')
    const btn = wrapper.findAll('.panel-actions .a-btn').find((b) => b.text() === '对比 →')!
    expect(btn.attributes('disabled')).toBeDefined()
  })

  it('IPv4/CIDR：/24 全字段与私网标注', async () => {
    const wrapper = await mountTools(makeRouter(), '/tools?tool=ipcalc')
    await textareas(wrapper)[0].setValue('192.168.1.10/24')
    await flushPromises()
    const grid = wrapper.find('.result-grid')
    expect(grid.text()).toContain('255.255.255.0')
    expect(grid.text()).toContain('192.168.1.1 - 192.168.1.254')
    expect(grid.text()).toContain('254')
    expect(grid.text()).toContain('私网段')
  })

  it('IPv4/CIDR：非法输入报错', async () => {
    const wrapper = await mountTools(makeRouter(), '/tools?tool=ipcalc')
    await textareas(wrapper)[0].setValue('300.1.1.1/24')
    await flushPromises()
    expect(wrapper.find('.diff-error').text()).toContain('IP')
  })

  it('哈希：MD5 输入即算', async () => {
    const wrapper = await mountTools(makeRouter(), '/tools?tool=hash')
    await textareas(wrapper)[0].setValue('abc')
    await flushPromises()
    await new Promise((r) => setTimeout(r, 50))
    await flushPromises()
    const grid = wrapper.find('.result-grid')
    expect(grid.exists()).toBe(true)
    expect(grid.text()).toContain('900150983cd24fb0d6963f7d28e17f72')
  })

  it('哈希：空输入无结果表', async () => {
    const wrapper = await mountTools(makeRouter(), '/tools?tool=hash')
    expect(wrapper.find('.result-grid').exists()).toBe(false)
  })
})

describe('Tools 批 3：文案', () => {
  it('Lua 按钮新文案「转换为字符串 →」/「→ 转换为函数」', async () => {
    const wrapper = await mountTools()
    const texts = wrapper.findAll('.panel-actions .a-btn').map((b) => b.text())
    expect(texts).toContain('转换为字符串 →')
    expect(texts).toContain('→ 转换为函数')
  })

  it('JSON 错误文案含中文修复指引', async () => {
    const { format } = await import('@/utils/tools/json')
    const out = format('{bad')
    expect(out).toContain('JSON 解析失败')
    expect(out).toContain('请检查')
  })

  it('Base64 解码错误文案含常见原因', async () => {
    const { decode } = await import('@/utils/tools/base64')
    expect(decode('not-base64!!')).toContain('常见原因')
  })

  it('diff 对比按钮文案「两边格式化」', async () => {
    const wrapper = await mountTools(makeRouter(), '/tools?tool=diff')
    const texts = wrapper.findAll('.panel-actions .a-btn').map((b) => b.text())
    expect(texts).toContain('两边格式化')
  })

  it('SM4 恢复默认按钮带用途 tooltip（title 属性）', async () => {
    const wrapper = await mountTools(makeRouter(), '/tools?tool=sm4')
    const resetBtn = wrapper.findAll('button').find((b) => b.text() === '恢复默认')!
    expect(resetBtn.attributes('title')).toContain('Edge 通道默认')
  })
})
