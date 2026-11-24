/**
 * AnsibleAdvancedFields · 行内校验错误标红（ansible-inventory-ux-review-fixes 批 2）。
 *
 * errors prop：{ [fieldKey]: message }，字段下方红字显示原因；未传/空对象不渲染。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import AnsibleAdvancedFields from '../AnsibleAdvancedFields.vue'
import { ADVANCED_FIELDS } from '@/utils/ansibleInventory'

function mountFields(errors?: Record<string, string>) {
  return mount(AnsibleAdvancedFields, {
    props: { values: { ansible_port: 99999 }, ...(errors ? { errors } : {}) },
    global: {
      stubs: {
        'a-tooltip': { template: '<span><slot /></span>' },
        'a-popover': { template: '<span><slot /></span>' },
        'a-input-number': {
          props: ['value'],
          template: '<input class="port-input" :value="value ?? \'\'" />',
        },
        'a-switch': { template: '<span />' },
        'a-auto-complete': { template: '<span />' },
        'a-input-password': { template: '<span />' },
        'a-input': { template: '<span />' },
      },
    },
  })
}

describe('AnsibleAdvancedFields 行内校验错误', () => {
  it('errors 命中字段：字段容器带错误态 + 下方红字原因', () => {
    const w = mountFields({ ansible_port: 'SSH 端口必须为 1-65535 的整数' })
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

/**
 * 两枚图标各司其职（2026-11-24 用户裁决）：
 * `?` = 字段含义（tooltip），`list` = 常用参数值速查（popover + 行可点复制）。
 * 速查图标必须是线稿 StrokeIcon，不得再用 emoji 📋（与全站图标语言一致）。
 */
describe('AnsibleAdvancedFields 字段提示图标', () => {
  it('每个字段一枚 ?；配了速查清单的字段再多一枚线稿速查图标', () => {
    const w = mountFields()
    const refs = w.findAll('.hint-mark.ref')
    const hintsOnly = w.findAll('.hint-mark').length - refs.length
    expect(w.findAll('.advanced-label').length).toBe(ADVANCED_FIELDS.length)
    expect(hintsOnly, '? 图标数应等于声明了 hint 的字段数').toBe(ADVANCED_FIELDS.filter((f) => f.hint).length)
    expect(refs.length, '速查图标数应等于声明了 helpRef 的字段数').toBe(
      ADVANCED_FIELDS.filter((f) => f.helpRef?.length).length,
    )
    for (const ref of refs) expect(ref.find('svg').exists(), '速查图标必须是 StrokeIcon 线稿').toBe(true)
    expect(w.html()).not.toContain('📋')
  })

  it('源码里不再出现 emoji 速查图标', () => {
    const source = readFileSync(resolve(__dirname, '../AnsibleAdvancedFields.vue'), 'utf8')
    expect(source).not.toContain('📋')
    expect(source).toContain('StrokeIcon')
  })
})
