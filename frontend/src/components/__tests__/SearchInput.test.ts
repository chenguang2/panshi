import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SearchInput from '../SearchInput.vue'

describe('SearchInput（全站统一搜索框）', () => {
  it('空值时右侧显示放大镜、无清空按钮', () => {
    const w = mount(SearchInput)
    expect(w.find('.search-icon').exists()).toBe(true)
    expect(w.find('.search-clear').exists()).toBe(false)
  })

  it('有值时放大镜换成清空按钮（allow-clear 语义）', () => {
    const w = mount(SearchInput, { props: { modelValue: 'abc' } })
    expect(w.find('.search-icon').exists()).toBe(false)
    expect(w.find('.search-clear').exists()).toBe(true)
  })

  it('输入触发 update:modelValue 与 input（消费方防抖/请求挂 input）', async () => {
    const w = mount(SearchInput)
    await w.find('input').setValue('route')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual(['route'])
    expect(w.emitted('input')?.at(-1)).toEqual(['route'])
  })

  it('回车触发 search（对齐 antd a-input-search 的 @search）', async () => {
    const w = mount(SearchInput, { props: { modelValue: 'kw' } })
    await w.find('input').trigger('keyup.enter')
    expect(w.emitted('search')?.at(-1)).toEqual(['kw'])
  })

  it('点击清空：清回空串并触发 input + clear', async () => {
    const w = mount(SearchInput, { props: { modelValue: 'abc' } })
    await w.find('.search-clear').trigger('click')
    expect(w.emitted('update:modelValue')?.at(-1)).toEqual([''])
    expect(w.emitted('input')?.at(-1)).toEqual([''])
    expect(w.emitted('clear')).toBeTruthy()
  })

  it('width 属性作用于内层 input；data-test 透传', () => {
    const w = mount(SearchInput, { props: { width: 240, dataTest: 'task-search' } })
    expect((w.find('input').element as HTMLInputElement).style.width).toBe('240px')
    expect(w.find('input').attributes('data-test')).toBe('task-search')
  })
})
