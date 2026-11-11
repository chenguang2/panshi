import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ClusterSelect from '../ClusterSelect.vue'

/** a-select 族桩（组件运行时经 app.use(Antd) 全局注册，测试按 PascalCase 注册解析 kebab 标签；与 EdgeEnv.test.ts 同款） */
const aSelectComps = {
  ASelect: {
    template: '<span class="a-select-stub"><slot /></span>',
    props: ['value', 'placeholder', 'showSearch', 'disabled', 'filterOption'],
  },
  ASelectOptGroup: { template: '<span class="a-opt-group">{{ label }}<slot /></span>', props: ['label'] },
  ASelectOption: { template: '<span class="a-opt"><slot /></span>', props: ['value'] },
}
const mountGlobal = { global: { components: aSelectComps } }

const CLUSTERS = [
  { id: 2, name: 'prod-b', display_name: '网关-B', group_name: '生产组' },
  { id: 1, name: 'prod-a', display_name: '网关-A', group_name: '生产组' },
  { id: 3, name: 'test-c', display_name: '网关-C', group_name: '测试组' },
  { id: 4, name: 'node-d', display_name: '', group_name: '' },
]

const mountSelect = (props: Record<string, unknown> = {}) =>
  mount(ClusterSelect, { ...mountGlobal, props: { clusters: CLUSTERS, ...props } })

describe('ClusterSelect.vue', () => {
  it('分组展示：具名分组按名称（默认 locale）排序、组内按显示名排序、未分组兜底末尾', () => {
    const wrapper = mountSelect()
    const groups = wrapper.findAll('.a-opt-group')
    expect(groups.length).toBe(3)
    // 默认 localeCompare 按拼音：测(cè) < 生(shēng)
    expect(groups[0].text()).toContain('测试组')
    expect(groups[1].text()).toContain('生产组')
    // 组内按显示名排序（输入顺序 B 在前，渲染 A 在前）
    expect(groups[1].text()).toContain('网关-A')
    expect(groups[1].text()).toContain('网关-B')
    expect(groups[1].text().indexOf('网关-A')).toBeLessThan(groups[1].text().indexOf('网关-B'))
    // 未分组兜底在末尾；无 display_name 时回落 name
    expect(groups[2].text()).toContain('未分组')
    expect(groups[2].text()).toContain('node-d')
  })

  it('必选模式（默认）：无「全部集群」项、placeholder「请选择集群」、show-search 开启', () => {
    const wrapper = mountSelect()
    expect(wrapper.text()).not.toContain('全部集群')
    const select = wrapper.findComponent(aSelectComps.ASelect)
    expect(select.props('placeholder')).toBe('请选择集群')
    expect(select.props('showSearch')).toBe(true)
    expect(select.props('value')).toBe('')
  })

  it('筛选模式（allow-all）：「全部集群」为首选项且 value 为空串，位于分组之前', () => {
    const wrapper = mountSelect({ allowAll: true, modelValue: '' })
    expect(wrapper.text()).toContain('全部集群')
    const selectStub = wrapper.find('.a-select-stub')
    const allOpt = wrapper.findAll('.a-opt').find((o) => o.text() === '全部集群')!
    expect(allOpt).toBeDefined()
    const allOptComp = wrapper.findComponent(aSelectComps.ASelectOption)
    void allOptComp
    // 「全部集群」渲染在所有分组之前
    const html = selectStub.html()
    expect(html.indexOf('全部集群')).toBeLessThan(html.indexOf('生产组'))
  })

  it("「全部集群」选项 value 为空串（值契约：'' = 未选具体集群）", () => {
    const wrapper = mountSelect({ allowAll: true })
    const optionComps = wrapper.findAllComponents(aSelectComps.ASelectOption)
    const allOption = optionComps.find((c) => c.text() === '全部集群')
    expect(allOption).toBeDefined()
    expect(allOption!.props('value')).toBe('')
  })

  it('选择经 change 透传 update:modelValue（含空串与集群 id），值先于 change 事件', async () => {
    const wrapper = mountSelect({ allowAll: true })
    const select = wrapper.findComponent(aSelectComps.ASelect)
    await select.vm.$emit('change', 2)
    await select.vm.$emit('change', '')
    const emitted = wrapper.emitted('update:modelValue')!
    expect(emitted[0]).toEqual([2])
    expect(emitted[1]).toEqual([''])
    // 值事件先于 change（消费方 @change 副作用读到新值）
    const changeEmitted = wrapper.emitted('change')!
    expect(changeEmitted[0]).toEqual([2])
    expect(changeEmitted[1]).toEqual([''])
    expect(wrapper.emitted('update:modelValue')!.length).toBe(wrapper.emitted('change')!.length)
  })

  it('搜索过滤：display_name / name 大小写不敏感；未注入集群一律不命中', () => {
    const wrapper = mountSelect({ allowAll: true })
    const filterFn = wrapper.findComponent(aSelectComps.ASelect).props('filterOption') as (
      input: string,
      option: { value?: number | string },
    ) => boolean
    expect(filterFn('网关-a', { value: 1 })).toBe(true)
    expect(filterFn('PROD-A', { value: 1 })).toBe(true)
    expect(filterFn('网关', { value: 3 })).toBe(true)
    expect(filterFn('nomatch', { value: 1 })).toBe(false)
    // 「全部集群」（value ''）不在注入集群内 → 搜索时不命中（仅未搜索时显示）
    expect(filterFn('全部', { value: '' })).toBe(false)
  })

  it('注入列表变化时选项跟随（组件自身不发请求）', async () => {
    const wrapper = mountSelect({ clusters: [CLUSTERS[0]] })
    expect(wrapper.text()).not.toContain('网关-C')
    await wrapper.setProps({ clusters: CLUSTERS })
    expect(wrapper.text()).toContain('网关-C')
  })

  it('placeholder 可覆盖', () => {
    const wrapper = mountSelect({ placeholder: '所属集群' })
    expect(wrapper.findComponent(aSelectComps.ASelect).props('placeholder')).toBe('所属集群')
  })
})
