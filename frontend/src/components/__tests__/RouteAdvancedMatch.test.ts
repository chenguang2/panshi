import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, h } from 'vue'
import RouteAdvancedMatch from '../RouteAdvancedMatch.vue'

const AButton = {
  props: ['htmlType', 'block', 'type'],
  emits: ['click'],
  setup(props: any, { slots }: any) {
    return () => h('button', {
      type: props.htmlType,
      class: props.type,
      onClick: () => {}
    }, slots.default?.())
  }
}

const ASelect = {
  props: ['value', 'style'],
  emits: ['change', 'update:value'],
  setup(props: any) {
    return () => h('select', {
      value: props.value,
      onChange: () => {}
    })
  }
}

const ASelectOption = {
  props: ['value'],
  setup(props: any) {
    return () => h('option', { value: props.value })
  }
}

const AInput = {
  props: ['value', 'placeholder', 'style', 'type'],
  emits: ['update:value', 'input'],
  setup(props: any) {
    return () => h('input', {
      value: props.value,
      placeholder: props.placeholder,
      style: props.style,
      type: props.type || 'text',
      onInput: () => {}
    })
  }
}

const ADivider = {
  setup() {
    return () => h('hr')
  }
}

const PlusOutlined = {
  setup() {
    return () => h('span', '+')
  }
}

const DeleteOutlined = {
  setup() {
    return () => h('span', 'x')
  }
}

describe('RouteAdvancedMatch Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('parseRulesFromVars', () => {
    it('应该正确解析 header 类型的 vars', () => {
      const wrapper = mount(RouteAdvancedMatch, {
        props: {
          enabled: true,
          modelValue: {
            vars: [['http_host', '==', 'example.com']]
          }
        },
        global: {
          components: {
            'a-button': AButton,
            'a-select': ASelect,
            'a-select-option': ASelectOption,
            'a-input': AInput,
            'a-divider': ADivider,
            'PlusOutlined': PlusOutlined,
            'DeleteOutlined': DeleteOutlined
          }
        }
      })

      const rules = (wrapper.vm as any).rules
      expect(rules[0].type).toBe('header')
      expect(rules[0].key).toBe('host')
      expect(rules[0].operator).toBe('==')
      expect(rules[0].value).toBe('example.com')
    })

    it('应该正确解析 query 类型的 vars', () => {
      const wrapper = mount(RouteAdvancedMatch, {
        props: {
          enabled: true,
          modelValue: {
            vars: [['arg_version', '==', 'v2']]
          }
        },
        global: {
          components: {
            'a-button': AButton,
            'a-select': ASelect,
            'a-select-option': ASelectOption,
            'a-input': AInput,
            'a-divider': ADivider,
            'PlusOutlined': PlusOutlined,
            'DeleteOutlined': DeleteOutlined
          }
        }
      })

      const rules = (wrapper.vm as any).rules
      expect(rules[0].type).toBe('query')
      expect(rules[0].key).toBe('version')
      expect(rules[0].operator).toBe('==')
    })

    it('应该正确解析 postarg 类型的 vars', () => {
      const wrapper = mount(RouteAdvancedMatch, {
        props: {
          enabled: true,
          modelValue: {
            vars: [['postarg_user_id', '>', '100']]
          }
        },
        global: {
          components: {
            'a-button': AButton,
            'a-select': ASelect,
            'a-select-option': ASelectOption,
            'a-input': AInput,
            'a-divider': ADivider,
            'PlusOutlined': PlusOutlined,
            'DeleteOutlined': DeleteOutlined
          }
        }
      })

      const rules = (wrapper.vm as any).rules
      expect(rules[0].type).toBe('postarg')
      expect(rules[0].key).toBe('user_id')
      expect(rules[0].operator).toBe('>')
    })

    it('应该正确解析 cookie 类型的 vars', () => {
      const wrapper = mount(RouteAdvancedMatch, {
        props: {
          enabled: true,
          modelValue: {
            vars: [['cookie_session_id', '==', 'abc123']]
          }
        },
        global: {
          components: {
            'a-button': AButton,
            'a-select': ASelect,
            'a-select-option': ASelectOption,
            'a-input': AInput,
            'a-divider': ADivider,
            'PlusOutlined': PlusOutlined,
            'DeleteOutlined': DeleteOutlined
          }
        }
      })

      const rules = (wrapper.vm as any).rules
      expect(rules[0].type).toBe('cookie')
      expect(rules[0].key).toBe('session_id')
    })

    it('应该正确解析 builtin 类型的 vars（无前缀）', () => {
      const wrapper = mount(RouteAdvancedMatch, {
        props: {
          enabled: true,
          modelValue: {
            vars: [['uri', '~~', '/api/v1']]
          }
        },
        global: {
          components: {
            'a-button': AButton,
            'a-select': ASelect,
            'a-select-option': ASelectOption,
            'a-input': AInput,
            'a-divider': ADivider,
            'PlusOutlined': PlusOutlined,
            'DeleteOutlined': DeleteOutlined
          }
        }
      })

      const rules = (wrapper.vm as any).rules
      expect(rules[0].type).toBe('builtin')
      expect(rules[0].key).toBe('uri')
      expect(rules[0].operator).toBe('~~')
    })

    it('应该正确解析多个规则', () => {
      const wrapper = mount(RouteAdvancedMatch, {
        props: {
          enabled: true,
          modelValue: {
            vars: [
              ['http_host', '==', 'example.com'],
              ['arg_version', '==', 'v2'],
              ['postarg_user_id', '>', '100'],
              ['cookie_session_id', '==', 'abc123'],
              ['uri', '~~', '/api/v1']
            ]
          }
        },
        global: {
          components: {
            'a-button': AButton,
            'a-select': ASelect,
            'a-select-option': ASelectOption,
            'a-input': AInput,
            'a-divider': ADivider,
            'PlusOutlined': PlusOutlined,
            'DeleteOutlined': DeleteOutlined
          }
        }
      })

      const rules = (wrapper.vm as any).rules
      expect(rules.length).toBe(5)
      expect(rules[0].type).toBe('header')
      expect(rules[1].type).toBe('query')
      expect(rules[2].type).toBe('postarg')
      expect(rules[3].type).toBe('cookie')
      expect(rules[4].type).toBe('builtin')
    })
  })

  describe('getKeyPlaceholder', () => {
    it('header 类型应返回正确的 placeholder', () => {
      const wrapper = mount(RouteAdvancedMatch, {
        props: {
          enabled: true,
          modelValue: {}
        },
        global: {
          components: {
            'a-button': AButton,
            'a-select': ASelect,
            'a-select-option': ASelectOption,
            'a-input': AInput,
            'a-divider': ADivider,
            'PlusOutlined': PlusOutlined,
            'DeleteOutlined': DeleteOutlined
          }
        }
      })

      expect((wrapper.vm as any).getKeyPlaceholder('header')).toBe('header 名称')
      expect((wrapper.vm as any).getKeyPlaceholder('query')).toBe('参数名称')
      expect((wrapper.vm as any).getKeyPlaceholder('postarg')).toBe('POST 参数名称')
      expect((wrapper.vm as any).getKeyPlaceholder('cookie')).toBe('cookie 名称')
      expect((wrapper.vm as any).getKeyPlaceholder('builtin')).toBe('内置参数名称')
    })
  })

  describe('addRule', () => {
    it('应该正确添加新规则', async () => {
      const wrapper = mount(RouteAdvancedMatch, {
        props: {
          enabled: true,
          modelValue: {}
        },
        global: {
          components: {
            'a-button': AButton,
            'a-select': ASelect,
            'a-select-option': ASelectOption,
            'a-input': AInput,
            'a-divider': ADivider,
            'PlusOutlined': PlusOutlined,
            'DeleteOutlined': DeleteOutlined
          }
        }
      })

      ;(wrapper.vm as any).addRule()
      await nextTick()

      const rules = (wrapper.vm as any).rules
      expect(rules.length).toBe(1)
      expect(rules[0].type).toBe('header')
      expect(rules[0].key).toBe('')
      expect(rules[0].operator).toBe('==')
      expect(rules[0].value).toBe('')
    })
  })

  describe('removeRule', () => {
    it('应该正确删除规则', async () => {
      const wrapper = mount(RouteAdvancedMatch, {
        props: {
          enabled: true,
          modelValue: {
            vars: [
              ['http_host', '==', 'example.com'],
              ['arg_version', '==', 'v2']
            ]
          }
        },
        global: {
          components: {
            'a-button': AButton,
            'a-select': ASelect,
            'a-select-option': ASelectOption,
            'a-input': AInput,
            'a-divider': ADivider,
            'PlusOutlined': PlusOutlined,
            'DeleteOutlined': DeleteOutlined
          }
        }
      })

      let rules = (wrapper.vm as any).rules
      expect(rules.length).toBe(2)

      ;(wrapper.vm as any).removeRule(0)
      await nextTick()

      rules = (wrapper.vm as any).rules
      expect(rules.length).toBe(1)
      expect(rules[0].key).toBe('version')
    })
  })

  describe('handleTypeChange', () => {
    it('切换类型应该重置 key 和 value', async () => {
      const wrapper = mount(RouteAdvancedMatch, {
        props: {
          enabled: true,
          modelValue: {}
        },
        global: {
          components: {
            'a-button': AButton,
            'a-select': ASelect,
            'a-select-option': ASelectOption,
            'a-input': AInput,
            'a-divider': ADivider,
            'PlusOutlined': PlusOutlined,
            'DeleteOutlined': DeleteOutlined
          }
        }
      })

      ;(wrapper.vm as any).addRule()
      await nextTick()

      const rule = (wrapper.vm as any).rules[0]
      rule.type = 'query'
      rule.key = 'version'
      rule.value = 'v2'

      ;(wrapper.vm as any).handleTypeChange(rule)

      expect(rule.key).toBe('')
      expect(rule.value).toBe('')
      expect(rule.operator).toBe('==')
    })
  })

  describe('buildVarsFromRules', () => {
    it('应该正确构建 header 类型的 vars', async () => {
      const wrapper = mount(RouteAdvancedMatch, {
        props: {
          enabled: true,
          modelValue: {}
        },
        global: {
          components: {
            'a-button': AButton,
            'a-select': ASelect,
            'a-select-option': ASelectOption,
            'a-input': AInput,
            'a-divider': ADivider,
            'PlusOutlined': PlusOutlined,
            'DeleteOutlined': DeleteOutlined
          }
        }
      })

      ;(wrapper.vm as any).rules = [{
        type: 'header',
        key: 'Host',
        operator: '==',
        value: 'example.com'
      }]

      const vars = (wrapper.vm as any).buildVarsFromRules()
      expect(vars).toEqual([['http_host', '==', 'example.com']])
    })

    it('应该正确构建 query 类型的 vars', async () => {
      const wrapper = mount(RouteAdvancedMatch, {
        props: {
          enabled: true,
          modelValue: {}
        },
        global: {
          components: {
            'a-button': AButton,
            'a-select': ASelect,
            'a-select-option': ASelectOption,
            'a-input': AInput,
            'a-divider': ADivider,
            'PlusOutlined': PlusOutlined,
            'DeleteOutlined': DeleteOutlined
          }
        }
      })

      ;(wrapper.vm as any).rules = [{
        type: 'query',
        key: 'version',
        operator: '==',
        value: 'v2'
      }]

      const vars = (wrapper.vm as any).buildVarsFromRules()
      expect(vars).toEqual([['arg_version', '==', 'v2']])
    })

    it('应该正确构建 postarg 类型的 vars', async () => {
      const wrapper = mount(RouteAdvancedMatch, {
        props: {
          enabled: true,
          modelValue: {}
        },
        global: {
          components: {
            'a-button': AButton,
            'a-select': ASelect,
            'a-select-option': ASelectOption,
            'a-input': AInput,
            'a-divider': ADivider,
            'PlusOutlined': PlusOutlined,
            'DeleteOutlined': DeleteOutlined
          }
        }
      })

      ;(wrapper.vm as any).rules = [{
        type: 'postarg',
        key: 'user_id',
        operator: '>',
        value: '100'
      }]

      const vars = (wrapper.vm as any).buildVarsFromRules()
      expect(vars).toEqual([['postarg_user_id', '>', '100']])
    })

    it('应该正确构建 cookie 类型的 vars', async () => {
      const wrapper = mount(RouteAdvancedMatch, {
        props: {
          enabled: true,
          modelValue: {}
        },
        global: {
          components: {
            'a-button': AButton,
            'a-select': ASelect,
            'a-select-option': ASelectOption,
            'a-input': AInput,
            'a-divider': ADivider,
            'PlusOutlined': PlusOutlined,
            'DeleteOutlined': DeleteOutlined
          }
        }
      })

      ;(wrapper.vm as any).rules = [{
        type: 'cookie',
        key: 'session_id',
        operator: '==',
        value: 'abc123'
      }]

      const vars = (wrapper.vm as any).buildVarsFromRules()
      expect(vars).toEqual([['cookie_session_id', '==', 'abc123']])
    })

    it('应该正确构建 builtin 类型的 vars（无前缀）', async () => {
      const wrapper = mount(RouteAdvancedMatch, {
        props: {
          enabled: true,
          modelValue: {}
        },
        global: {
          components: {
            'a-button': AButton,
            'a-select': ASelect,
            'a-select-option': ASelectOption,
            'a-input': AInput,
            'a-divider': ADivider,
            'PlusOutlined': PlusOutlined,
            'DeleteOutlined': DeleteOutlined
          }
        }
      })

      ;(wrapper.vm as any).rules = [{
        type: 'builtin',
        key: 'uri',
        operator: '~~',
        value: '/api/v1'
      }]

      const vars = (wrapper.vm as any).buildVarsFromRules()
      expect(vars).toEqual([['uri', '~~', '/api/v1']])
    })

    it('应该正确跳过空 key 的规则', async () => {
      const wrapper = mount(RouteAdvancedMatch, {
        props: {
          enabled: true,
          modelValue: {}
        },
        global: {
          components: {
            'a-button': AButton,
            'a-select': ASelect,
            'a-select-option': ASelectOption,
            'a-input': AInput,
            'a-divider': ADivider,
            'PlusOutlined': PlusOutlined,
            'DeleteOutlined': DeleteOutlined
          }
        }
      })

      ;(wrapper.vm as any).rules = [{
        type: 'header',
        key: '',
        operator: '==',
        value: 'test'
      }]

      const vars = (wrapper.vm as any).buildVarsFromRules()
      expect(vars).toEqual([])
    })

    it('应该正确跳过空 value 的规则', async () => {
      const wrapper = mount(RouteAdvancedMatch, {
        props: {
          enabled: true,
          modelValue: {}
        },
        global: {
          components: {
            'a-button': AButton,
            'a-select': ASelect,
            'a-select-option': ASelectOption,
            'a-input': AInput,
            'a-divider': ADivider,
            'PlusOutlined': PlusOutlined,
            'DeleteOutlined': DeleteOutlined
          }
        }
      })

      ;(wrapper.vm as any).rules = [{
        type: 'header',
        key: 'Host',
        operator: '==',
        value: ''
      }]

      const vars = (wrapper.vm as any).buildVarsFromRules()
      expect(vars).toEqual([])
    })

    it('应该正确处理所有运算符', async () => {
      const operators = ['==', '!=', '>', '<', '~~', '~*', 'IN', 'NOT IN']

      for (const operator of operators) {
        const wrapper = mount(RouteAdvancedMatch, {
          props: {
            enabled: true,
            modelValue: {}
          },
          global: {
            components: {
              'a-button': AButton,
              'a-select': ASelect,
              'a-select-option': ASelectOption,
              'a-input': AInput,
              'a-divider': ADivider,
              'PlusOutlined': PlusOutlined,
              'DeleteOutlined': DeleteOutlined
            }
          }
        })

        ;(wrapper.vm as any).rules = [{
          type: 'query',
          key: 'test',
          operator,
          value: 'value'
        }]

        const vars = (wrapper.vm as any).buildVarsFromRules()
        expect(vars[0][1]).toBe(operator)
      }
    })
  })
})