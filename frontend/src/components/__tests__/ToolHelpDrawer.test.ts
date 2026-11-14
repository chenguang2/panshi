/**
 * ToolHelpDrawer 组件测试（tools-help-drawer）。
 *
 * 覆盖：六段骨架渲染、示例 mono 块与注意警告块、文档跟随 toolKey、
 * 关闭事件、关闭态不渲染、480 宽度。a-drawer 桩成 v-if slot（站内惯例）。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ToolHelpDrawer from '../ToolHelpDrawer.vue'
import { TOOL_HELP } from '@/config/toolHelp'

const drawerStub = {
  props: ['open', 'title', 'width'],
  emits: ['close'],
  template:
    '<div class="th-drawer-stub" v-if="open" :data-width="width"><div class="th-title">{{ title }}</div><button class="th-close" @click="$emit(\'close\')" /><slot /></div>',
}

function mountDrawer(props: Partial<{ open: boolean; toolKey: string; toolLabel: string }> = {}) {
  return mount(ToolHelpDrawer, {
    props: { open: true, toolKey: 'lua', toolLabel: 'Lua 互转', ...props },
    global: { stubs: { 'a-drawer': drawerStub, teleport: true } },
  })
}

describe('ToolHelpDrawer：六段骨架渲染', () => {
  it('标题 = 工具名 · 帮助；宽度 480', () => {
    const wrapper = mountDrawer()
    expect(wrapper.find('.th-title').text()).toBe('Lua 互转 · 帮助')
    expect(wrapper.find('.th-drawer-stub').attributes('data-width')).toBe('480')
  })

  it('六段齐全：01-06 段落标题与内容', () => {
    const wrapper = mountDrawer()
    const heads = wrapper.findAll('.th-head').map((h) => h.text())
    expect(heads).toEqual(['01这是什么', '02为什么需要它', '03什么时候用', '04怎么用', '05示例', '06注意 / 坑'])
    const doc = TOOL_HELP['lua']
    expect(wrapper.find('.th-text').text()).toBe(doc.what)
    expect(wrapper.findAll('.th-ul li')).toHaveLength(doc.when.length)
    expect(wrapper.findAll('.th-ol li')).toHaveLength(doc.how.length)
  })

  it('示例段为输入/输出 mono 块，注意段为警告块', () => {
    const wrapper = mountDrawer()
    const ios = wrapper.findAll('.th-io-label').map((l) => l.text())
    expect(ios).toEqual(['输入', '输出'])
    expect(wrapper.find('.th-pre').text()).toContain('ngx.log(ngx.ERR')
    const cautions = wrapper.find('.th-cautions')
    expect(cautions.exists()).toBe(true)
    expect(wrapper.findAll('.th-cautions li')).toHaveLength(TOOL_HELP['lua'].cautions.length)
  })

  it('文档跟随 toolKey：切工具后内容与标题同步', async () => {
    const wrapper = mountDrawer({ toolKey: 'lua', toolLabel: 'Lua 互转' })
    await wrapper.setProps({ toolKey: 'timestamp', toolLabel: '时间戳转换' })
    expect(wrapper.find('.th-title').text()).toBe('时间戳转换 · 帮助')
    expect(wrapper.text()).toContain('naive UTC')
  })

  it('关闭事件与关闭态不渲染', async () => {
    const wrapper = mountDrawer()
    await wrapper.find('.th-close').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    const closed = mountDrawer({ open: false })
    expect(closed.find('.th-drawer-stub').exists()).toBe(false)
  })
})
