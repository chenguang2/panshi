/**
 * AnsibleAdvancedFields · 高级连接变量（A+C 解剖，2026-11-24 用户裁决）。
 *
 * 覆盖三件事：
 * ① 行内校验错误标红（ansible-inventory-ux-review-fixes 批 2）；
 * ② 分区解剖：连接 4 项 + 认证 2 项常显，提权两项由子面板开关控制；
 * ③ 两枚提示图标（? 含义 / 线稿三横线速查），速查不得回退 emoji。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import AnsibleAdvancedFields from '../AnsibleAdvancedFields.vue'
import { ADVANCED_FIELDS } from '@/utils/ansibleInventory'

const STUBS = {
  'a-tooltip': { template: '<span><slot /></span>' },
  'a-popover': { template: '<span><slot /></span>' },
  'a-input-number': {
    props: ['value'],
    template: '<input class="port-input" :value="value ?? \'\'" />',
  },
  'a-switch': { template: '<span class="switch-stub" />' },
  'a-auto-complete': { template: '<span />' },
  'a-input-password': { template: '<span />' },
  'a-input': { template: '<span />' },
}

function mountFields(values: Record<string, unknown> = { ansible_port: 99999 }, errors?: Record<string, string>) {
  return mount(AnsibleAdvancedFields, {
    props: { values, ...(errors ? { errors } : {}) },
    global: { stubs: STUBS },
  })
}

/** 提权关闭时必须常显的字段（连接 4 + 认证 2） */
const VISIBLE_KEYS = [
  'ansible_port',
  'ansible_host',
  'ansible_connection',
  'ansible_python_interpreter',
  'ansible_ssh_private_key_file',
  'ansible_ssh_common_args',
]

describe('AnsibleAdvancedFields 行内校验错误', () => {
  it('errors 命中字段：字段容器带错误态 + 下方红字原因', () => {
    const w = mountFields({ ansible_port: 99999 }, { ansible_port: 'SSH 端口必须为 1-65535 的整数' })
    const field = w.findAll('.advanced-field').find((f) => f.find('.field-error').exists())
    expect(field).toBeTruthy()
    expect(field!.find('.field-error').text()).toBe('SSH 端口必须为 1-65535 的整数')
    expect(field!.classes()).toContain('has-error')
  })

  it('未传 errors：不渲染任何错误文案', () => {
    const w = mountFields()
    expect(w.find('.field-error').exists()).toBe(false)
  })
})

describe('AnsibleAdvancedFields A+C 分区解剖', () => {
  it('常显两个分区标题：连接 4 / 认证 2', () => {
    const w = mountFields()
    const heads = w.findAll('.adv-sec-head').map((h) => h.text().replace(/\s+/g, ' ').trim())
    expect(heads).toEqual(['连接 4', '认证 2'])
  })

  it('提权关闭：面板收起，只留一行说明，不渲染提权用户/密码控件', () => {
    const w = mountFields()
    expect(w.find('.adv-panel').exists()).toBe(true)
    expect(w.find('.adv-collapsed').text()).toContain('未启用提权')
    expect(w.find('.adv-panel-body').exists()).toBe(false)
    const labels = w.findAll('.advanced-label').map((l) => l.text())
    expect(labels.some((t) => t.includes('提权用户'))).toBe(false)
    expect(w.findAll('.advanced-field').length).toBe(VISIBLE_KEYS.length)
  })

  it('提权开启：面板体展开，出现提权用户/提权密码两个字段', () => {
    const w = mountFields({ ansible_become: true })
    expect(w.find('.adv-collapsed').exists()).toBe(false)
    expect(w.find('.adv-panel-body').exists()).toBe(true)
    const labels = w.findAll('.advanced-label').map((l) => l.text())
    expect(labels.some((t) => t.includes('提权用户'))).toBe(true)
    expect(labels.some((t) => t.includes('提权密码'))).toBe(true)
    expect(w.findAll('.advanced-field').length).toBe(VISIBLE_KEYS.length + 2)
  })

  it('字符串形态的 become（yes）同样视为开启', () => {
    const w = mountFields({ ansible_become: 'yes' })
    expect(w.find('.adv-panel-body').exists()).toBe(true)
  })
})

/**
 * 两枚图标各司其职：`?` = 字段含义（tooltip），`list` = 常用参数值速查（popover + 行可点复制）。
 * 速查图标必须是线稿 StrokeIcon，不得再用 emoji 📋（与全站图标语言一致）。
 */
describe('AnsibleAdvancedFields 字段提示图标', () => {
  it('每个可见字段一枚 ?；配了速查清单的再多一枚线稿速查图标', () => {
    const w = mountFields()
    const visibleDefs = ADVANCED_FIELDS.filter((f) => VISIBLE_KEYS.includes(f.key))
    const refs = w.findAll('.hint-mark.ref')
    const hintsOnly = w.findAll('.hint-mark').length - refs.length
    expect(w.findAll('.advanced-label').length).toBe(visibleDefs.length)
    expect(hintsOnly, '? 图标数应等于可见字段里声明了 hint 的数量').toBe(visibleDefs.filter((f) => f.hint).length)
    expect(refs.length, '速查图标数应等于可见字段里声明了 helpRef 的数量').toBe(
      visibleDefs.filter((f) => f.helpRef?.length).length,
    )
    for (const ref of refs) expect(ref.find('svg').exists(), '速查图标必须是 StrokeIcon 线稿').toBe(true)
    expect(w.html()).not.toContain('📋')
  })

  it('字段组件源码不再出现 emoji 速查图标（图标下沉到 AnsibleAdvancedField）', () => {
    for (const file of ['../AnsibleAdvancedFields.vue', '../AnsibleAdvancedField.vue']) {
      const source = readFileSync(resolve(__dirname, file), 'utf8')
      expect(source, `${file} 仍含 emoji 速查图标`).not.toContain('📋')
    }
    expect(readFileSync(resolve(__dirname, '../AnsibleAdvancedField.vue'), 'utf8')).toContain('StrokeIcon')
  })
})
