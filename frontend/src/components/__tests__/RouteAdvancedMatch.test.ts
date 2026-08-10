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
  setup(props: any, { slots }: any) {
    return () => h('select', {
      value: props.value,
      onChange: () => {}
    }, slots.default?.())
  }
}

const ASelectOption = {
  props: ['value'],
  setup(props: any, { slots }: any) {
    return () => h('option', { value: props.value }, slots.default?.())
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
      expect(vars).toEqual([['post_arg_user_id', '>', '100']])
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

    it('应该正确处理所有单值运算符', async () => {
      const operators = ['==', '!=', '>', '<', '~~', '~*']

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

describe('RouteAdvancedMatch ip~ operator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  const stubGlobals = {
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
  }

  it('buildVarsFromRules: ip~ 规则序列化为 3 元组数组', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    ;(wrapper.vm as any).rules = [{
      type: 'builtin',
      key: 'remote_addr',
      operator: 'ip~',
      value: ['10.158.40.51', '10.0.0.0/8']
    }]
    const vars = (wrapper.vm as any).buildVarsFromRules()
    expect(vars).toEqual([['remote_addr', 'ip~', ['10.158.40.51', '10.0.0.0/8']]])
    wrapper.unmount()
  })

  it('buildVarsFromRules: not_ip~ 规则序列化为 4 元组取反', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    ;(wrapper.vm as any).rules = [{
      type: 'builtin',
      key: 'remote_addr',
      operator: 'not_ip~',
      value: ['192.168.0.3', '127.0.0.1/8']
    }]
    const vars = (wrapper.vm as any).buildVarsFromRules()
    expect(vars).toEqual([['remote_addr', '!', 'ip~', ['192.168.0.3', '127.0.0.1/8']]])
    wrapper.unmount()
  })

  it('buildVarsFromRules: header 类型 + ip~ 序列化为 http_ 前缀 key', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    ;(wrapper.vm as any).rules = [{
      type: 'header',
      key: 'x-real-ip',
      operator: 'ip~',
      value: ['10.0.0.1']
    }]
    const vars = (wrapper.vm as any).buildVarsFromRules()
    expect(vars).toEqual([['http_x_real_ip', 'ip~', ['10.0.0.1']]])
    wrapper.unmount()
  })

  it('parseRulesFromVars: 3 元组 ip~ 解析为 ip~ 规则（value 数组）', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: { vars: [['remote_addr', 'ip~', ['10.158.40.51', '10.0.0.0/8']]] } },
      ...stubGlobals
    })
    await nextTick()
    expect((wrapper.vm as any).rules[0].operator).toBe('ip~')
    expect((wrapper.vm as any).rules[0].value).toEqual(['10.158.40.51', '10.0.0.0/8'])
    expect((wrapper.vm as any).rules[0].key).toBe('remote_addr')
    wrapper.unmount()
  })

  it('parseRulesFromVars: 4 元组取反解析为 not_ip~ 规则（前置判断不错解）', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: { vars: [['remote_addr', '!', 'ip~', ['192.168.0.3', '127.0.0.1/8']]] } },
      ...stubGlobals
    })
    await nextTick()
    const rule = (wrapper.vm as any).rules[0]
    expect(rule.operator).toBe('not_ip~')
    expect(rule.value).toEqual(['192.168.0.3', '127.0.0.1/8'])
    expect(rule.key).toBe('remote_addr')
    wrapper.unmount()
  })

  it('parseRulesFromVars: 旧数据兼容——3 元组 ip~ value 非数组按逗号拆分', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: { vars: [['remote_addr', 'ip~', '10.158.40.51,10.0.0.0/8']] } },
      ...stubGlobals
    })
    await nextTick()
    const rule = (wrapper.vm as any).rules[0]
    expect(rule.operator).toBe('ip~')
    expect(rule.value).toEqual(['10.158.40.51', '10.0.0.0/8'])
    wrapper.unmount()
  })

  it('parseRulesFromVars: 旧数据兼容——4 元组 v[3] 非数组拆分为单元素数组', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: { vars: [['remote_addr', '!', 'ip~', '127.0.0.1/8']] } },
      ...stubGlobals
    })
    await nextTick()
    const rule = (wrapper.vm as any).rules[0]
    expect(rule.operator).toBe('not_ip~')
    expect(rule.value).toEqual(['127.0.0.1/8'])
    wrapper.unmount()
  })
})


describe('RouteAdvancedMatch ip~ tag input', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  const stubGlobals = {
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
  }

  it('isIpOperator 识别 ip~ 与 not_ip~，其他操作符返回 false', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    expect((wrapper.vm as any).isIpOperator('ip~')).toBe(true)
    expect((wrapper.vm as any).isIpOperator('not_ip~')).toBe(true)
    expect((wrapper.vm as any).isIpOperator('==')).toBe(false)
    expect((wrapper.vm as any).isIpOperator('IN')).toBe(false)
    wrapper.unmount()
  })

  it('ip~ 规则的 value 为数组时标签输入显示数组值', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: { vars: [['remote_addr', 'ip~', ['10.158.40.51', '10.0.0.0/8']]] } },
      ...stubGlobals
    })
    await nextTick()
    const rule = (wrapper.vm as any).rules[0]
    expect(Array.isArray(rule.value)).toBe(true)
    expect(rule.value).toEqual(['10.158.40.51', '10.0.0.0/8'])
    wrapper.unmount()
  })

  it('ip~ 标签输入更新 value 为数组（添加多 IP/CIDR）', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    ;(wrapper.vm as any).rules = [{
      type: 'builtin',
      key: 'remote_addr',
      operator: 'ip~',
      value: []
    }]
    await nextTick()
    ;(wrapper.vm as any).rules[0].value = ['10.158.40.51', '10.0.0.0/8']
    await nextTick()
    const vars = (wrapper.vm as any).buildVarsFromRules()
    expect(vars).toEqual([['remote_addr', 'ip~', ['10.158.40.51', '10.0.0.0/8']]])
    wrapper.unmount()
  })
})

describe('RouteAdvancedMatch IN/NOT IN 序列化', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  const stubGlobals = {
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
  }

  it('buildVarsFromRules: IN 规则（value 数组）序列化为小写 in + 数组', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    ;(wrapper.vm as any).rules = [{
      type: 'query',
      key: 'user_name',
      operator: 'IN',
      value: ['user1', 'user2']
    }]
    const vars = (wrapper.vm as any).buildVarsFromRules()
    expect(vars).toEqual([['arg_user_name', 'in', ['user1', 'user2']]])
    wrapper.unmount()
  })

  it('buildVarsFromRules: NOT IN 规则（value 数组）序列化为 4 元组取反', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    ;(wrapper.vm as any).rules = [{
      type: 'query',
      key: 'user_name',
      operator: 'NOT IN',
      value: ['user1', 'user2']
    }]
    const vars = (wrapper.vm as any).buildVarsFromRules()
    expect(vars).toEqual([['arg_user_name', '!', 'in', ['user1', 'user2']]])
    wrapper.unmount()
  })

  it('buildVarsFromRules: IN value 非数组（旧 string 残留）逗号拆分后序列化', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    ;(wrapper.vm as any).rules = [{
      type: 'query',
      key: 'user_name',
      operator: 'IN',
      value: 'user1,user2'
    }]
    const vars = (wrapper.vm as any).buildVarsFromRules()
    expect(vars).toEqual([['arg_user_name', 'in', ['user1', 'user2']]])
    wrapper.unmount()
  })

  it('buildVarsFromRules: NOT IN value 非数组（旧 string 残留）逗号拆分后序列化', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    ;(wrapper.vm as any).rules = [{
      type: 'query',
      key: 'user_name',
      operator: 'NOT IN',
      value: 'user1,user2'
    }]
    const vars = (wrapper.vm as any).buildVarsFromRules()
    expect(vars).toEqual([['arg_user_name', '!', 'in', ['user1', 'user2']]])
    wrapper.unmount()
  })
})

describe('RouteAdvancedMatch IN/NOT IN 反序列化', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  const stubGlobals = {
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
  }

  it('parseRulesFromVars: 3 元组小写 in 数组解析为 IN 规则（type=query）', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: { vars: [['arg_user_name', 'in', ['user1', 'user2']]] } },
      ...stubGlobals
    })
    await nextTick()
    const rule = (wrapper.vm as any).rules[0]
    expect(rule.type).toBe('query')
    expect(rule.key).toBe('user_name')
    expect(rule.operator).toBe('IN')
    expect(rule.value).toEqual(['user1', 'user2'])
    wrapper.unmount()
  })

  it('parseRulesFromVars: 4 元组 !in 解析为 NOT IN 规则（前置判断不错解）', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: { vars: [['arg_user_name', '!', 'in', ['user1', 'user2']]] } },
      ...stubGlobals
    })
    await nextTick()
    const rule = (wrapper.vm as any).rules[0]
    expect(rule.type).toBe('query')
    expect(rule.key).toBe('user_name')
    expect(rule.operator).toBe('NOT IN')
    expect(rule.value).toEqual(['user1', 'user2'])
    wrapper.unmount()
  })

  it('parseRulesFromVars: 旧格式大写 IN 字符串解析为 IN 规则（逗号拆）', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: { vars: [['arg_user_name', 'IN', 'user1,user2']] } },
      ...stubGlobals
    })
    await nextTick()
    const rule = (wrapper.vm as any).rules[0]
    expect(rule.type).toBe('query')
    expect(rule.key).toBe('user_name')
    expect(rule.operator).toBe('IN')
    expect(rule.value).toEqual(['user1', 'user2'])
    wrapper.unmount()
  })

  it('parseRulesFromVars: 旧格式大写 NOT IN 字符串解析为 NOT IN 规则（逗号拆）', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: { vars: [['arg_user_name', 'NOT IN', 'user1,user2']] } },
      ...stubGlobals
    })
    await nextTick()
    const rule = (wrapper.vm as any).rules[0]
    expect(rule.type).toBe('query')
    expect(rule.key).toBe('user_name')
    expect(rule.operator).toBe('NOT IN')
    expect(rule.value).toEqual(['user1', 'user2'])
    wrapper.unmount()
  })
})

describe('RouteAdvancedMatch deriveRuleType', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  const stubGlobals = {
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
  }

  it('deriveRuleType 对 arg_/http_/postarg_/cookie_/无前缀返回正确 type', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    expect((wrapper.vm as any).deriveRuleType('arg_version')).toBe('query')
    expect((wrapper.vm as any).deriveRuleType('http_host')).toBe('header')
    expect((wrapper.vm as any).deriveRuleType('http_x_real_ip')).toBe('header')
    expect((wrapper.vm as any).deriveRuleType('postarg_user_id')).toBe('postarg')
    expect((wrapper.vm as any).deriveRuleType('cookie_session_id')).toBe('cookie')
    expect((wrapper.vm as any).deriveRuleType('uri')).toBe('builtin')
    wrapper.unmount()
  })

  it('parseRulesFromVars: 4 元组 !ip~ header 类型修复为 header（非 builtin）', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: { vars: [['http_x_real_ip', '!', 'ip~', ['10.0.0.1']]] } },
      ...stubGlobals
    })
    await nextTick()
    const rule = (wrapper.vm as any).rules[0]
    expect(rule.type).toBe('header')
    expect(rule.key).toBe('x-real-ip')
    expect(rule.operator).toBe('not_ip~')
    expect(rule.value).toEqual(['10.0.0.1'])
    wrapper.unmount()
  })

  it('parseRulesFromVars: 4 元组 !in header 类型为 header（NOT IN 规则）', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: { vars: [['http_x_real_ip', '!', 'in', ['10.0.0.1', '10.0.0.2']]] } },
      ...stubGlobals
    })
    await nextTick()
    const rule = (wrapper.vm as any).rules[0]
    expect(rule.type).toBe('header')
    expect(rule.key).toBe('x-real-ip')
    expect(rule.operator).toBe('NOT IN')
    expect(rule.value).toEqual(['10.0.0.1', '10.0.0.2'])
    wrapper.unmount()
  })
})

describe('RouteAdvancedMatch isListOperator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  const stubGlobals = {
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
  }

  it('isListOperator 对 ip~/not_ip~/IN/NOT IN 返回 true，单值操作符返回 false', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    expect((wrapper.vm as any).isListOperator('ip~')).toBe(true)
    expect((wrapper.vm as any).isListOperator('not_ip~')).toBe(true)
    expect((wrapper.vm as any).isListOperator('IN')).toBe(true)
    expect((wrapper.vm as any).isListOperator('NOT IN')).toBe(true)
    expect((wrapper.vm as any).isListOperator('==')).toBe(false)
    expect((wrapper.vm as any).isListOperator('!=')).toBe(false)
    expect((wrapper.vm as any).isListOperator('>')).toBe(false)
    expect((wrapper.vm as any).isListOperator('<')).toBe(false)
    expect((wrapper.vm as any).isListOperator('~~')).toBe(false)
    expect((wrapper.vm as any).isListOperator('~*')).toBe(false)
    wrapper.unmount()
  })

  it('回归：isIpOperator 仅对 ip~/not_ip~ 返回 true，isIpOperator(IN) 为 false', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    expect((wrapper.vm as any).isIpOperator('ip~')).toBe(true)
    expect((wrapper.vm as any).isIpOperator('not_ip~')).toBe(true)
    expect((wrapper.vm as any).isIpOperator('IN')).toBe(false)
    expect((wrapper.vm as any).isIpOperator('==')).toBe(false)
    wrapper.unmount()
  })

  it('IN/NOT IN 规则 value 控件应使用标签输入（isListOperator 驱动模板）', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: { vars: [['arg_user_name', 'in', ['user1', 'user2']]] } },
      ...stubGlobals
    })
    await nextTick()
    // 标签输入（a-select mode=tags）渲染为 select 元素；单值输入渲染为 input 元素
    // IN 规则：type/operator/value 3 个 select + key 1 个 input
    expect(wrapper.findAll('select').length).toBe(3)
    expect(wrapper.findAll('input').length).toBe(1)
    wrapper.unmount()
  })

  it('单值操作符 == value 控件应使用单行输入（非标签）', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: { vars: [['arg_version', '==', 'v2']] } },
      ...stubGlobals
    })
    await nextTick()
    // == 规则：type/operator 2 个 select + key/value 2 个 input
    expect(wrapper.findAll('select').length).toBe(2)
    expect(wrapper.findAll('input').length).toBe(2)
    wrapper.unmount()
  })
})

describe('RouteAdvancedMatch IN/NOT IN 往返链路', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  const stubGlobals = {
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
  }

  it('往返：IN 规则 → 序列化为 in 数组 → 反序列化还原为 IN 规则', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    ;(wrapper.vm as any).rules = [{
      type: 'query',
      key: 'user_name',
      operator: 'IN',
      value: ['user1', 'user2']
    }]
    const vars = (wrapper.vm as any).buildVarsFromRules()
    expect(vars).toEqual([['arg_user_name', 'in', ['user1', 'user2']]])

    ;(wrapper.vm as any).parseRulesFromVars(vars)
    const rule = (wrapper.vm as any).rules[0]
    expect(rule.type).toBe('query')
    expect(rule.operator).toBe('IN')
    expect(rule.value).toEqual(['user1', 'user2'])
    wrapper.unmount()
  })

  it('往返：NOT IN 规则 → 序列化为 !in 4 元组 → 反序列化还原为 NOT IN 规则', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    ;(wrapper.vm as any).rules = [{
      type: 'query',
      key: 'user_name',
      operator: 'NOT IN',
      value: ['user1', 'user2']
    }]
    const vars = (wrapper.vm as any).buildVarsFromRules()
    expect(vars).toEqual([['arg_user_name', '!', 'in', ['user1', 'user2']]])

    ;(wrapper.vm as any).parseRulesFromVars(vars)
    const rule = (wrapper.vm as any).rules[0]
    expect(rule.type).toBe('query')
    expect(rule.operator).toBe('NOT IN')
    expect(rule.value).toEqual(['user1', 'user2'])
    wrapper.unmount()
  })

  it('升级：旧大写 IN 字符串数据反序列化后重新序列化为新 in 数组格式', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    // 模拟 DB 旧数据（route 42/71 格式）
    ;(wrapper.vm as any).parseRulesFromVars([['remote_addr', 'IN', '192.168.1.0/24']])
    const rule = (wrapper.vm as any).rules[0]
    expect(rule.type).toBe('builtin')
    expect(rule.key).toBe('remote_addr')
    expect(rule.operator).toBe('IN')
    expect(rule.value).toEqual(['192.168.1.0/24'])

    // 用户保存后自动升级为新格式
    const vars = (wrapper.vm as any).buildVarsFromRules()
    expect(vars).toEqual([['remote_addr', 'in', ['192.168.1.0/24']]])
    wrapper.unmount()
  })
})

describe('RouteAdvancedMatch 运算符全集元数据', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  const stubGlobals = {
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
  }

  const OPERATOR_GROUPS = [
    { label: '等于', operators: [['==', '等于', '等于', '等于匹配：{var} == {val}'], ['==*', '等于*', '等于(忽略大小写)', '忽略大小写等于匹配：{var} ==* {val}']] },
    { label: '不等于', operators: [['!=', '不等于', '不等于', '不等于匹配：{var} != {val}'], ['!=*', '不等于*', '不等于(忽略大小写)', '忽略大小写不等于匹配：{var} !=* {val}']] },
    { label: '数值', operators: [['>', '大于', '大于', '数值大于：{var} > {val}'], ['>=', '大于等于', '大于等于', '数值大于等于：{var} >= {val}'], ['<', '小于', '小于', '数值小于：{var} < {val}'], ['<=', '小于等于', '小于等于', '数值小于等于：{var} <= {val}']] },
    { label: '版本号', operators: [['v>', '版本大于', '版本大于', '版本号比较：{var} v> {val}'], ['v>=', '版本大于等于', '版本大于等于', '版本号比较：{var} v>= {val}'], ['v<', '版本小于', '版本小于', '版本号比较：{var} v< {val}'], ['v<=', '版本小于等于', '版本小于等于', '版本号比较：{var} v<= {val}']] },
    { label: '正则', operators: [['~~', '正则匹配', '正则匹配', '正则匹配：{var} ~~ {val}'], ['~~*', '正则*', '正则匹配(忽略大小写)', '忽略大小写正则：{var} ~~* {val}']] },
    { label: 'IP', operators: [['ip~', 'IP 匹配', 'IP 匹配', '按 IP 段匹配：{var} ip~ {val}'], ['not_ip~', '非 IP 匹配', '非 IP 匹配', '按 IP 段反向匹配：{var} 不在列表内']] },
    { label: '包含(列表)', operators: [['has', '包含', '包含', '左值(数组)包含右值：{var} has {val}'], ['has*', '包含*', '包含(忽略大小写)', '忽略大小写左值数组包含：{var} has* {val}'], ['rx~', '路径存在', '路径存在', '路径匹配优化版 in：{var} rx~ {val}'], ['rx~*', '路径存在*', '路径存在(忽略大小写)', '忽略大小写路径存在：{var} rx~* {val}'], ['in*', '存在*', '存在(忽略大小写)', '忽略大小写右值数组存在：{var} in* {val}']] },
    { label: '组合', operators: [['IN', '包含(组合)', '包含(组合)', '右值(数组)包含左值：{var} in {val}'], ['NOT IN', '不包含(组合)', '不包含(组合)', '右值数组不包含左值：{var} !in {val}']] }
  ]

  it('OPERATOR_GROUPS 覆盖手册 1.1.1 全部运算符且分组正确', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    const groups = (wrapper.vm as any).OPERATOR_GROUPS
    expect(groups).toEqual(OPERATOR_GROUPS)

    // 收集全部运算符
    const allOps = groups.flatMap((g: any) => g.operators.map((o: any) => o[0]))
    // 手册全集（除 ipmatch 别名与 in 重复项）
    const expected = ['==', '==*', '!=', '!=*', '>', '>=', '<', '<=',
      'v>', 'v>=', 'v<', 'v<=', '~~', '~~*', 'ip~', 'not_ip~',
      'has', 'has*', 'rx~', 'rx~*', 'in*', 'IN', 'NOT IN']
    expect(allOps).toEqual(expect.arrayContaining(expected))
    expect(allOps).toHaveLength(expected.length)
    // 不包含 ipmatch 与 in
    expect(allOps).not.toContain('ipmatch')
    expect(allOps).not.toContain('in')
    // IP 分组含 not_ip~
    const ipGroup = groups.find((g: any) => g.label === 'IP')
    expect(ipGroup.operators.map((o: any) => o[0])).toEqual(['ip~', 'not_ip~'])
    wrapper.unmount()
  })

  it('运算符元数据含说明文案 desc，每个运算符均有说明', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    const groups = (wrapper.vm as any).OPERATOR_GROUPS
    for (const group of groups) {
      for (const [op, , , desc] of group.operators) {
        expect(typeof desc, `${op} 缺少 desc`).toBe('string')
        expect(desc.length).toBeGreaterThan(0)
      }
    }
    wrapper.unmount()
  })

  it('忽略大小写变体选项文本为短形式且不超过 10 字', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    const groups = (wrapper.vm as any).OPERATOR_GROUPS
    for (const group of groups) {
      for (const [op, shortLabel] of group.operators) {
        expect(shortLabel.length, `${op} 短标签过长`).toBeLessThanOrEqual(10)
      }
    }
    // 忽略大小写变体的短形式
    const allOps = groups.flatMap((g: any) => g.operators)
    expect(allOps.find((o: any) => o[0] === '==*')[1]).toBe('等于*')
    expect(allOps.find((o: any) => o[0] === '~~*')[1]).toBe('正则*')
    expect(allOps.find((o: any) => o[0] === 'rx~*')[1]).toBe('路径存在*')
    expect(allOps.find((o: any) => o[0] === 'in*')[1]).toBe('存在*')
    wrapper.unmount()
  })

  it('运算符元数据含 fullLabel 完整名，忽略大小写变体为完整中文名', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    const groups = (wrapper.vm as any).OPERATOR_GROUPS
    const allOps = groups.flatMap((g: any) => g.operators)
    expect(allOps.find((o: any) => o[0] === '==*')[2]).toBe('等于(忽略大小写)')
    expect(allOps.find((o: any) => o[0] === '~~*')[2]).toBe('正则匹配(忽略大小写)')
    expect(allOps.find((o: any) => o[0] === 'has*')[2]).toBe('包含(忽略大小写)')
    expect(allOps.find((o: any) => o[0] === 'rx~*')[2]).toBe('路径存在(忽略大小写)')
    expect(allOps.find((o: any) => o[0] === 'in*')[2]).toBe('存在(忽略大小写)')
    // 非忽略大小写变体 shortLabel === fullLabel
    expect(allOps.find((o: any) => o[0] === 'v>=')[1]).toBe(allOps.find((o: any) => o[0] === 'v>=')[2])
    wrapper.unmount()
  })

  it('模板选项渲染短 label + title 为完整名', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    ;(wrapper.vm as any).rules = [{
      type: 'query',
      key: 'test',
      operator: '==',
      value: 'v'
    }]
    await nextTick()

    const optionTexts = wrapper.findAll('option').map(o => o.text())
    expect(optionTexts).toContain('等于* ==*')
    expect(optionTexts).toContain('正则* ~~*')
    expect(optionTexts).toContain('路径存在* rx~*')

    const titleAttrs = wrapper.findAll('option').map(o => o.attributes('title'))
    expect(titleAttrs).toContain('等于(忽略大小写)')
    expect(titleAttrs).toContain('正则匹配(忽略大小写)')
    wrapper.unmount()
  })

  it('模板行内显示当前操作符说明（v>= 显示版本号比较提示）', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    ;(wrapper.vm as any).rules = [{
      type: 'query',
      key: 'appv',
      operator: 'v>=',
      value: '1.2.3'
    }]
    await nextTick()
    const hint = wrapper.find('.rule-hint')
    expect(hint.exists()).toBe(true)
    expect(hint.text()).toContain('版本号比较')
    expect(hint.text()).toContain('v>=')
    wrapper.unmount()
  })
})

describe('RouteAdvancedMatch 运算符下拉分组渲染', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  const AOptionGroup = {
    props: ['label'],
    setup(props: any, { slots }: any) {
      return () => h('optgroup', { label: props.label }, slots.default?.())
    }
  }

  const stubGlobals = {
    global: {
      components: {
        'a-button': AButton,
        'a-select': ASelect,
        'a-select-option': ASelectOption,
        'a-select-option-group': AOptionGroup,
        'a-input': AInput,
        'a-divider': ADivider,
        'PlusOutlined': PlusOutlined,
        'DeleteOutlined': DeleteOutlined
      }
    }
  }

  it('模板渲染全部运算符选项（中文 + 运算符），~~* 存在、~*/ipmatch/in 不存在', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    ;(wrapper.vm as any).rules = [{
      type: 'query',
      key: 'test',
      operator: '==',
      value: 'v'
    }]
    await nextTick()

    const allOptions = wrapper.findAll('option').map(o => o.attributes('value'))
    // 28 = type 选择器 5 个（header/query/postarg/cookie/builtin）+ 运算符 23 个
    expect(allOptions).toHaveLength(28)
    expect(allOptions).toContain('~~*')
    expect(allOptions).not.toContain('~*')
    expect(allOptions).not.toContain('ipmatch')
    expect(allOptions).not.toContain('in')
    expect(allOptions).toContain('v>=')
    expect(allOptions).toContain('has')
    expect(allOptions).toContain('rx~')
    expect(allOptions).toContain('in*')
    expect(allOptions).toContain('not_ip~')

    // 选项文本为「中文 + 运算符」
    const optionTexts = wrapper.findAll('option').map(o => o.text())
    expect(optionTexts).toContain('等于 ==')
    expect(optionTexts).toContain('版本大于等于 v>=')
    expect(optionTexts).toContain('非 IP 匹配 not_ip~')
    wrapper.unmount()
  })
})

describe('RouteAdvancedMatch isListOperator 全集', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  const stubGlobals = {
    global: {
      components: {
        'a-button': AButton,
        'a-select': ASelect,
        'a-select-option': ASelectOption,
        'a-select-option-group': { props: ['label'], setup(props: any, { slots }: any) { return () => h('optgroup', { label: props.label }, slots.default?.()) } },
        'a-input': AInput,
        'a-divider': ADivider,
        'PlusOutlined': PlusOutlined,
        'DeleteOutlined': DeleteOutlined
      }
    }
  }

  it('isListOperator: in*/rx~/rx~* 返回 true；has/has* 返回 false（单行输入）', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    expect((wrapper.vm as any).isListOperator('in*')).toBe(true)
    expect((wrapper.vm as any).isListOperator('rx~')).toBe(true)
    expect((wrapper.vm as any).isListOperator('rx~*')).toBe(true)
    expect((wrapper.vm as any).isListOperator('ip~')).toBe(true)
    expect((wrapper.vm as any).isListOperator('IN')).toBe(true)
    expect((wrapper.vm as any).isListOperator('NOT IN')).toBe(true)
    expect((wrapper.vm as any).isListOperator('not_ip~')).toBe(true)
    expect((wrapper.vm as any).isListOperator('has')).toBe(false)
    expect((wrapper.vm as any).isListOperator('has*')).toBe(false)
    expect((wrapper.vm as any).isListOperator('==')).toBe(false)
    expect((wrapper.vm as any).isListOperator('v>=')).toBe(false)
    expect((wrapper.vm as any).isListOperator('~~*')).toBe(false)
    wrapper.unmount()
  })

  it('has 规则使用单行输入（非标签）', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: { vars: [['custom_names', 'has', 'user1']] } },
      ...stubGlobals
    })
    await nextTick()
    // has 规则：type/operator 2 select + key/value 2 input
    expect(wrapper.findAll('select').length).toBe(2)
    expect(wrapper.findAll('input').length).toBe(2)
    wrapper.unmount()
  })

  it('rx~ 规则使用标签输入（value 数组）', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: { vars: [['req_uri', 'rx~', ['/path/to/1', '/path/to/2']]] } },
      ...stubGlobals
    })
    await nextTick()
    // rx~ 规则：type/operator/value 3 select + key 1 input
    expect(wrapper.findAll('select').length).toBe(3)
    expect(wrapper.findAll('input').length).toBe(1)
    const rule = (wrapper.vm as any).rules[0]
    expect(rule.operator).toBe('rx~')
    expect(rule.value).toEqual(['/path/to/1', '/path/to/2'])
    wrapper.unmount()
  })
})

describe('RouteAdvancedMatch 序列化扩展', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  const stubGlobals = {
    global: {
      components: {
        'a-button': AButton,
        'a-select': ASelect,
        'a-select-option': ASelectOption,
        'a-select-option-group': { props: ['label'], setup(props: any, { slots }: any) { return () => h('optgroup', { label: props.label }, slots.default?.()) } },
        'a-input': AInput,
        'a-divider': ADivider,
        'PlusOutlined': PlusOutlined,
        'DeleteOutlined': DeleteOutlined
      }
    }
  }

  const mountWithRules = async (rules: any[]) => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    ;(wrapper.vm as any).rules = rules
    await nextTick()
    return wrapper
  }

  it('buildVarsFromRules: 单值运算符原样序列化', async () => {
    const wrapper = await mountWithRules([
      { type: 'query', key: 'rank', operator: '>=', value: '10' },
      { type: 'query', key: 'appv', operator: 'v>=', value: '1.2.3' },
      { type: 'query', key: 'name', operator: '==*', value: 'user' },
      { type: 'query', key: 'pattern', operator: '~~*', value: 'user[12]' },
      { type: 'builtin', key: 'custom_names', operator: 'has', value: 'user1' },
      { type: 'builtin', key: 'custom_names', operator: 'has*', value: 'user1' }
    ])
    const vars = (wrapper.vm as any).buildVarsFromRules()
    expect(vars).toEqual([
      ['arg_rank', '>=', '10'],
      ['arg_appv', 'v>=', '1.2.3'],
      ['arg_name', '==*', 'user'],
      ['arg_pattern', '~~*', 'user[12]'],
      ['custom_names', 'has', 'user1'],
      ['custom_names', 'has*', 'user1']
    ])
    wrapper.unmount()
  })

  it('buildVarsFromRules: 数组运算符 in*/rx~/rx~* 序列化为 value 数组，非数组逗号拆分', async () => {
    const wrapper = await mountWithRules([
      { type: 'query', key: 'name', operator: 'in*', value: ['u1', 'u2'] },
      { type: 'builtin', key: 'req_uri', operator: 'rx~', value: ['/path/to/1', '/path/to/2'] },
      { type: 'builtin', key: 'req_uri', operator: 'rx~*', value: '/a,/b' }
    ])
    const vars = (wrapper.vm as any).buildVarsFromRules()
    expect(vars).toEqual([
      ['arg_name', 'in*', ['u1', 'u2']],
      ['req_uri', 'rx~', ['/path/to/1', '/path/to/2']],
      ['req_uri', 'rx~*', ['/a', '/b']]
    ])
    wrapper.unmount()
  })

  it('buildVarsFromRules: POST 参数规则序列化为 post_arg_ 前缀', async () => {
    const wrapper = await mountWithRules([
      { type: 'postarg', key: 'user_id', operator: '>', value: '100' }
    ])
    const vars = (wrapper.vm as any).buildVarsFromRules()
    expect(vars).toEqual([['post_arg_user_id', '>', '100']])
    wrapper.unmount()
  })
})

describe('RouteAdvancedMatch 反序列化扩展', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  const stubGlobals = {
    global: {
      components: {
        'a-button': AButton,
        'a-select': ASelect,
        'a-select-option': ASelectOption,
        'a-select-option-group': { props: ['label'], setup(props: any, { slots }: any) { return () => h('optgroup', { label: props.label }, slots.default?.()) } },
        'a-input': AInput,
        'a-divider': ADivider,
        'PlusOutlined': PlusOutlined,
        'DeleteOutlined': DeleteOutlined
      }
    }
  }

  const parse = async (vars: any[]) => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: { vars } },
      ...stubGlobals
    })
    await nextTick()
    return wrapper
  }

  it('parseRulesFromVars: post_arg_ 前缀解析为 postarg 规则', async () => {
    const wrapper = await parse([['post_arg_user_id', '>', '100']])
    const rule = (wrapper.vm as any).rules[0]
    expect(rule.type).toBe('postarg')
    expect(rule.key).toBe('user_id')
    expect(rule.operator).toBe('>')
    expect(rule.value).toBe('100')
    wrapper.unmount()
  })

  it('parseRulesFromVars: 旧 postarg_ 前缀兼容解析为 postarg 规则', async () => {
    const wrapper = await parse([['postarg_user_id', '>', '100']])
    const rule = (wrapper.vm as any).rules[0]
    expect(rule.type).toBe('postarg')
    expect(rule.key).toBe('user_id')
    wrapper.unmount()
  })

  it('parseRulesFromVars: 旧 ~* 运算符映射为 ~~* 规则', async () => {
    const wrapper = await parse([['arg_name', '~*', 'user[12]']])
    const rule = (wrapper.vm as any).rules[0]
    expect(rule.operator).toBe('~~*')
    expect(rule.value).toBe('user[12]')
    wrapper.unmount()
  })

  it('parseRulesFromVars: ipmatch 别名归一化为 ip~ 规则', async () => {
    const wrapper = await parse([['remote_addr', 'ipmatch', ['10.0.0.1', '10.0.0.0/8']]])
    const rule = (wrapper.vm as any).rules[0]
    expect(rule.operator).toBe('ip~')
    expect(rule.value).toEqual(['10.0.0.1', '10.0.0.0/8'])
    wrapper.unmount()
  })

  it('parseRulesFromVars: rx~ 数组运算符 value 数组还原', async () => {
    const wrapper = await parse([['req_uri', 'rx~', ['/path/to/1', '/path/to/2']]])
    const rule = (wrapper.vm as any).rules[0]
    expect(rule.operator).toBe('rx~')
    expect(rule.value).toEqual(['/path/to/1', '/path/to/2'])
    wrapper.unmount()
  })

  it('parseRulesFromVars: in* 数组运算符逗号拆分', async () => {
    const wrapper = await parse([['arg_name', 'in*', 'u1,u2']])
    const rule = (wrapper.vm as any).rules[0]
    expect(rule.operator).toBe('in*')
    expect(rule.value).toEqual(['u1', 'u2'])
    wrapper.unmount()
  })

  it('parseRulesFromVars: rx~* 数组运算符逗号拆分', async () => {
    const wrapper = await parse([['req_uri', 'rx~*', '/a,/b']])
    const rule = (wrapper.vm as any).rules[0]
    expect(rule.operator).toBe('rx~*')
    expect(rule.value).toEqual(['/a', '/b'])
    wrapper.unmount()
  })
})

describe('RouteAdvancedMatch JSON 编辑双模式', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  const stubGlobals = {
    global: {
      components: {
        'a-button': AButton,
        'a-select': ASelect,
        'a-select-option': ASelectOption,
        'a-select-option-group': { props: ['label'], setup(props: any, { slots }: any) { return () => h('optgroup', { label: props.label }, slots.default?.()) } },
        'a-input': AInput,
        'a-divider': ADivider,
        'PlusOutlined': PlusOutlined,
        'DeleteOutlined': DeleteOutlined
      }
    }
  }

  const mountWithRules = async (rules: any[]) => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    ;(wrapper.vm as any).rules = rules
    await nextTick()
    return wrapper
  }

  it('开启 JSON 模式 → jsonText 为当前规则序列化 JSON（格式化）', async () => {
    const wrapper = await mountWithRules([
      { type: 'query', key: 'appv', operator: 'v>=', value: '1.2.3' },
      { type: 'builtin', key: 'req_uri', operator: 'rx~', value: ['/a', '/b'] }
    ])
    ;(wrapper.vm as any).jsonMode = true
    ;(wrapper.vm as any).ruleToJson()
    expect((wrapper.vm as any).jsonText).toBe(JSON.stringify(
      [['arg_appv', 'v>=', '1.2.3'], ['req_uri', 'rx~', ['/a', '/b']]], null, 2
    ))
    wrapper.unmount()
  })

  it('关闭 JSON 模式且 JSON 合法 → 解析还原规则列表（含数组 value 运算符）', async () => {
    const wrapper = await mountWithRules([
      { type: 'query', key: 'appv', operator: 'v>=', value: '1.2.3' }
    ])
    ;(wrapper.vm as any).jsonMode = true
    ;(wrapper.vm as any).ruleToJson()
    ;(wrapper.vm as any).jsonText = JSON.stringify([['req_uri', 'rx~', ['/a', '/b']], ['arg_appv', 'v>=', '1.2.3']])
    const ok = (wrapper.vm as any).jsonToRules()
    expect(ok).toBe(true)
    const rules = (wrapper.vm as any).rules
    expect(rules.length).toBe(2)
    expect(rules[0].operator).toBe('rx~')
    expect(rules[0].value).toEqual(['/a', '/b'])
    expect(rules[1].operator).toBe('v>=')
    wrapper.unmount()
  })

  it('JSON 非法（非数组/非 3/4 元组）→ 返回 false 且不改变规则', async () => {
    const wrapper = await mountWithRules([
      { type: 'query', key: 'appv', operator: 'v>=', value: '1.2.3' }
    ])
    ;(wrapper.vm as any).jsonMode = true
    ;(wrapper.vm as any).ruleToJson()
    ;(wrapper.vm as any).jsonText = '{ not valid json'
    expect((wrapper.vm as any).jsonToRules()).toBe(false)

    ;(wrapper.vm as any).jsonText = '{"a": 1}'
    expect((wrapper.vm as any).jsonToRules()).toBe(false)

    ;(wrapper.vm as any).jsonText = '[["arg_appv", "v>=", "1.2.3", "extra", "more"]]'
    expect((wrapper.vm as any).jsonToRules()).toBe(false)

    // 规则未被破坏
    expect((wrapper.vm as any).rules.length).toBe(1)
    expect((wrapper.vm as any).rules[0].operator).toBe('v>=')
    wrapper.unmount()
  })

  it('模板：jsonMode 开启时显示 JSON 文本区，关闭时显示表单', async () => {
    const wrapper = await mountWithRules([
      { type: 'query', key: 'appv', operator: 'v>=', value: '1.2.3' }
    ])
    expect(wrapper.find('.json-editor').exists()).toBe(false)
    ;(wrapper.vm as any).jsonMode = true
    ;(wrapper.vm as any).ruleToJson()
    await nextTick()
    expect(wrapper.find('.json-editor').exists()).toBe(true)
    expect(wrapper.find('.json-editor textarea').exists()).toBe(true)
    wrapper.unmount()
  })
})

describe('RouteAdvancedMatch 动态行内提示', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  const stubGlobals = {
    global: {
      components: {
        'a-button': AButton,
        'a-select': ASelect,
        'a-select-option': ASelectOption,
        'a-select-option-group': { props: ['label'], setup(props: any, { slots }: any) { return () => h('optgroup', { label: props.label }, slots.default?.()) } },
        'a-input': AInput,
        'a-divider': ADivider,
        'PlusOutlined': PlusOutlined,
        'DeleteOutlined': DeleteOutlined
      }
    }
  }

  it('getRuleHint: query 类型用 arg_ 前缀 + 实际 key 生成提示', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    const hint = (wrapper.vm as any).getRuleHint({
      type: 'query', key: 'version', operator: '==', value: 'v2'
    })
    expect(hint).toContain('arg_version')
    expect(hint).toContain('==')
    expect(hint).not.toContain('arg_name')
    wrapper.unmount()
  })

  it('getRuleHint: header 类型用 http_ 前缀 + 短横线转下划线', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    const hint = (wrapper.vm as any).getRuleHint({
      type: 'header', key: 'X-Real-IP', operator: '==', value: '1.2.3.4'
    })
    expect(hint).toContain('http_x_real_ip')
    wrapper.unmount()
  })

  it('getRuleHint: builtin 类型直接用 key，无前缀', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    const hint = (wrapper.vm as any).getRuleHint({
      type: 'builtin', key: 'remote_addr', operator: 'ip~', value: ['10.0.0.1']
    })
    expect(hint).toContain('remote_addr')
    wrapper.unmount()
  })

  it('模板行内提示随 key 变化（query + version → arg_version）', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    ;(wrapper.vm as any).rules = [{
      type: 'query', key: 'version', operator: '==', value: 'v2'
    }]
    await nextTick()
    const hint = wrapper.find('.rule-hint').text()
    expect(hint).toContain('arg_version')
    expect(hint).not.toContain('arg_name')
    wrapper.unmount()
  })
})

describe('RouteAdvancedMatch 动态行内提示（值替换）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  const stubGlobals = {
    global: {
      components: {
        'a-button': AButton,
        'a-select': ASelect,
        'a-select-option': ASelectOption,
        'a-select-option-group': { props: ['label'], setup(props: any, { slots }: any) { return () => h('optgroup', { label: props.label }, slots.default?.()) } },
        'a-input': AInput,
        'a-divider': ADivider,
        'PlusOutlined': PlusOutlined,
        'DeleteOutlined': DeleteOutlined
      }
    }
  }

  it('getRuleHint: 单值运算符用实际 value 替换示例值', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    const hint = (wrapper.vm as any).getRuleHint({
      type: 'query', key: 'name', operator: '==', value: 'alice'
    })
    expect(hint).toContain('arg_name == alice')
    expect(hint).not.toContain('== user')
    wrapper.unmount()
  })

  it('getRuleHint: 版本号运算符用实际 value', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    const hint = (wrapper.vm as any).getRuleHint({
      type: 'header', key: 'appv', operator: 'v>=', value: '9.9.9'
    })
    expect(hint).toContain('http_appv v>= 9.9.9')
    expect(hint).not.toContain('1.2.3')
    wrapper.unmount()
  })

  it('getRuleHint: 数组运算符用实际 value 数组', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    const hint = (wrapper.vm as any).getRuleHint({
      type: 'builtin', key: 'req_uri', operator: 'rx~', value: ['/a', '/b']
    })
    expect(hint).toContain('req_uri rx~ [/a, /b]')
    wrapper.unmount()
  })

  it('getRuleHint: IN 运算符用实际 value 数组', async () => {
    const wrapper = mount(RouteAdvancedMatch, {
      props: { enabled: true, modelValue: {} },
      ...stubGlobals
    })
    const hint = (wrapper.vm as any).getRuleHint({
      type: 'query', key: 'name', operator: 'IN', value: ['u1', 'u2']
    })
    expect(hint).toContain('arg_name in [u1, u2]')
    wrapper.unmount()
  })
})
