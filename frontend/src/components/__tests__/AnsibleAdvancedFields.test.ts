/**
 * AnsibleAdvancedFields · 行内校验错误标红（ansible-inventory-ux-review-fixes 批 2）。
 *
 * errors prop：{ [fieldKey]: message }，字段下方红字显示原因；未传/空对象不渲染。
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AnsibleAdvancedFields from '../AnsibleAdvancedFields.vue'

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
