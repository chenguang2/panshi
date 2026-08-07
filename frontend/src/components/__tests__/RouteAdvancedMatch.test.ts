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
