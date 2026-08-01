import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import PluginEditorDrawer from '../PluginEditorDrawer.vue'

vi.mock('json-editor-vue', () => ({
  default: { template: '<div class="mock-json-editor" />', props: ['modelValue', 'mode'] },
}))

const stubs = {
  ADrawer: {
    template: '<div class="mock-drawer" :class="{ open }"><slot /><slot name="extra" /><slot name="footer" /></div>',
    props: ['open', 'title', 'closable', 'width'],
  },
  AForm: { template: '<form><slot /></form>', props: ['layout'] },
  AInput: {
    template: '<input :value="value" @input="$emit(\'update:value\', $event.target.value)" />',
    props: ['value', 'placeholder'],
  },
  AInputNumber: {
    template: '<input type="number" :value="value" @input="$emit(\'update:value\', Number($event.target.value))" />',
    props: ['value'],
  },
  AButton: { template: '<button class="mock-btn" @click="$emit(\'click\')"><slot /></button>', props: ['type'] },
  ASelect: { template: '<select :value="value" @change="$emit(\'update:value\', $event.target.value)"><slot /></select>', props: ['value'] },
  ASelectOption: { template: '<option :value="value"><slot /></option>', props: ['value'] },
  ATextarea: {
    template: '<textarea :value="value" @input="$emit(\'update:value\', $event.target.value)" />',
    props: ['value', 'rows'],
  },
  InfoCircleOutlined: { template: '<span />' },
  DownOutlined: { template: '<span />' },
  RightOutlined: { template: '<span />' },
  DeleteOutlined: { template: '<span />' },
  PlusOutlined: { template: '<span />' },
}

const PROXY_REWRITE_SCHEMA = {
  uri: { type: 'string', description: '目标 URI' },
  headers: { type: 'object', description: '请求 Header' },
}

function mountDrawer() {
  const wrapper = mount(PluginEditorDrawer, {
    props: {
      open: true,
      plugin: { plugin_name: 'proxy_rewrite', config: '{}' },
      pluginInfo: { name: 'proxy_rewrite', schema: PROXY_REWRITE_SCHEMA },
    },
    global: { stubs },
  })
  return wrapper
}

describe('PluginEditorDrawer 表单模式序列化回归', () => {
  it('buildConfigFromForm 输出保持单层 JSON 字符串', async () => {
    const wrapper = mountDrawer()
    // 有 schema 字段 → 表单模式（isJsonMode=false）
    await wrapper.vm.$nextTick()

    // 填写 uri 字段
    const input = wrapper.find('input')
    await input.setValue('/api/new')

    // 点保存
    const saveBtn = wrapper.findAll('button').filter(w => w.text().includes('保存'))
    expect(saveBtn.length).toBeGreaterThan(0)
    await saveBtn[0].trigger('click')

    const emitted = wrapper.emitted('save')
    expect(emitted).toBeTruthy()
    const config = (emitted as unknown[][])[0][0] as string
    // 单层 JSON：一次 JSON.parse 得对象，而非字符串
    const parsed = JSON.parse(config)
    expect(typeof parsed).toBe('object')
    expect(parsed).toEqual({ uri: '/api/new' })
  })

  it('表单模式保存的 config 可被一次 JSON.parse 得到对象', async () => {
    const wrapper = mountDrawer()
    await wrapper.vm.$nextTick()

    const input = wrapper.find('input')
    await input.setValue('/v2/users')

    const saveBtn = wrapper.findAll('button').filter(w => w.text().includes('保存'))
    await saveBtn[0].trigger('click')

    const config = (wrapper.emitted('save') as unknown[][])[0][0] as string
    expect(typeof JSON.parse(config)).toBe('object')
    expect(JSON.parse(config)).toEqual({ uri: '/v2/users' })
  })
})
