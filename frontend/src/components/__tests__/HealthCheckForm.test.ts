import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import HealthCheckForm from '../HealthCheckForm.vue'
import type { HealthCheckConfig } from '@/types'

type Mode = 'active' | 'passive'

function mountForm(mode: Mode) {
  return mount(HealthCheckForm, {
    props: { checks: null, enabled: true, modelMode: mode },
  })
}

type FormWrapper = ReturnType<typeof mountForm>

/** 按字段标签文本定位其表单输入控件（每个 .form-field 内 label.field-label 与控件一一对应） */
function fieldInput(wrapper: FormWrapper, label: string) {
  const field = wrapper.findAll('.form-field').find((f) => f.find('label.field-label').text() === label)
  expect(field, `form field not rendered: ${label}`).toBeTruthy()
  return field!.find('input')
}

/** active/passive 模式各自真实渲染的 section/字段，以及提交载荷差异——差异全部由参数表达 */
const MODE_CASES: {
  mode: Mode
  sectionTitle: string
  collapsibles: string[]
  fieldLabels: string[]
  otherModeOnlyLabels: string[]
  edit: { label: string; value: string }
  expectPayload: (payload: HealthCheckConfig) => void
}[] = [
  {
    mode: 'active',
    sectionTitle: '主动检查配置',
    collapsibles: ['健康判断', '不健康判断'],
    fieldLabels: [
      '检查类型',
      '检查路径',
      '超时(秒)',
      '间隔(秒)',
      '并发数',
      '连续成功次数',
      '健康 HTTP 状态码',
      '连续失败次数',
      'TCP 失败次数',
      '超时次数',
      '不健康间隔(秒)',
      '不健康 HTTP 状态码',
    ],
    otherModeOnlyLabels: [],
    edit: { label: '超时(秒)', value: '3' },
    expectPayload: (payload) => {
      expect(payload.active?.timeout).toBe(3)
      expect(payload.passive).toBeUndefined()
    },
  },
  {
    mode: 'passive',
    sectionTitle: '被动检查配置',
    collapsibles: ['被动健康判断', '被动不健康判断'],
    fieldLabels: [
      '检查类型',
      '连续成功次数',
      '健康 HTTP 状态码',
      '连续失败次数',
      'TCP 失败次数',
      '超时次数',
      '不健康 HTTP 状态码',
    ],
    otherModeOnlyLabels: ['检查路径', '超时(秒)', '间隔(秒)', '并发数', 'HTTPS 验证证书', '不健康间隔(秒)'],
    edit: { label: '超时次数', value: '9' },
    expectPayload: (payload) => {
      expect(payload.passive?.unhealthy.timeouts).toBe(9)
      expect(payload.active).toBeUndefined()
    },
  },
]

describe('HealthCheckForm.vue', () => {
  it('renders mode radio buttons when enabled', () => {
    const wrapper = mountForm('active')
    expect(wrapper.text()).toContain('仅主动检查')
    expect(wrapper.text()).toContain('仅被动检查')
    expect(wrapper.text()).toContain('主动+被动')
  })

  it('disables all inputs when not enabled', () => {
    const wrapper = mount(HealthCheckForm, {
      props: { checks: null, enabled: false },
    })
    const inputs = wrapper.findAll('input')
    expect(inputs.length).toBeGreaterThan(0)
    inputs.forEach((input) => {
      expect(input.attributes('disabled')).toBeDefined()
    })
  })

  it('mode radio change emits update:modelMode and defers section switch to parent', async () => {
    const wrapper = mountForm('active')
    const passiveRadio = wrapper.findAll('input[type="radio"]').find((r) => r.attributes('value') === 'passive')
    expect(passiveRadio, 'passive mode radio').toBeTruthy()
    await passiveRadio!.setValue()
    expect(wrapper.emitted('update:modelMode')![0]).toEqual(['passive'])
    // 父组件未回写 props 时 UI 不自行切换（mode 计算属性读 props.modelMode）
    expect(wrapper.text()).not.toContain('被动检查配置')
  })

  it('defaults check type select to http', () => {
    const wrapper = mountForm('active')
    const selects = wrapper.findAll('select')
    expect(selects).toHaveLength(1)
    expect((selects[0].element as HTMLSelectElement).value).toBe('http')
  })

  it('renders reset button when enabled', () => {
    const wrapper = mountForm('active')
    expect(wrapper.find('button.reset-btn').text()).toContain('重置为默认')
  })

  it('opens JSON editor modal on button click', async () => {
    const wrapper = mountForm('active')
    await wrapper.find('button.json-edit-btn').trigger('click')
    expect(wrapper.text()).toContain('健康检查 JSON')
    expect(wrapper.find('textarea.json-textarea').exists()).toBe(true)
  })

  describe.each(MODE_CASES)('$mode mode', (c) => {
    it('renders only its own check section with exact title and collapsible headers', () => {
      const wrapper = mountForm(c.mode)
      const sections = wrapper.findAll('.check-section')
      expect(sections).toHaveLength(1)
      expect(sections[0].find('.section-title').text()).toBe(c.sectionTitle)
      const headers = sections[0].findAll('.collapse-header').map((h) => h.text())
      expect(headers).toEqual(c.collapsibles)
    })

    it('renders its field labels and hides the other mode exclusive fields', () => {
      const wrapper = mountForm(c.mode)
      for (const label of c.fieldLabels) expect(wrapper.text()).toContain(label)
      for (const label of c.otherModeOnlyLabels) expect(wrapper.text()).not.toContain(label)
    })

    it('JSON editor dumps the form state of the current mode only', async () => {
      const wrapper = mountForm(c.mode)
      await wrapper.find('button.json-edit-btn').trigger('click')
      const textarea = wrapper.find('textarea.json-textarea')
      expect(textarea.exists()).toBe(true)
      const json = JSON.parse(textarea.element.value) as HealthCheckConfig
      if (c.mode === 'active') {
        expect(json.active?.type).toBe('http')
        expect(json.passive).toBeUndefined()
      } else {
        expect(json.passive?.type).toBe('http')
        expect(json.active).toBeUndefined()
      }
    })

    it('editing a field emits update:checks containing only its own block', async () => {
      const wrapper = mountForm(c.mode)
      await fieldInput(wrapper, c.edit.label).setValue(c.edit.value)
      const events = wrapper.emitted('update:checks')
      expect(events, 'form edit should emit update:checks').toBeTruthy()
      const payload = events![events!.length - 1][0] as HealthCheckConfig
      c.expectPayload(payload)
    })
  })
})
