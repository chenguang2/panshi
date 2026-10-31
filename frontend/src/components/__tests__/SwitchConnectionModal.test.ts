import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SwitchConnectionModal from '@/components/SwitchConnectionModal.vue'
import type { DbConnection } from '@/types/database'

const antStubs = {
  'a-alert': { props: ['message'], template: '<div class="ant-alert">{{ message }}</div>' },
  'a-tag': { template: '<span class="ant-tag"><slot /></span>' },
}

function conn(overrides: Partial<DbConnection> = {}): DbConnection {
  return {
    id: 'conn_2',
    type: 'postgres',
    name: '目标 PG',
    path: null,
    host: '10.0.0.5',
    port: 5432,
    database: 'panshi',
    username: 'postgres',
    password_set: true,
    ssl: false,
    display_address: '10.0.0.5:5432/panshi',
    ...overrides,
  }
}

function mountModal(props: Record<string, unknown> = {}) {
  return mount(SwitchConnectionModal, {
    props: {
      open: true,
      connection: conn(),
      ...props,
    },
    global: { stubs: antStubs },
  })
}

describe('SwitchConnectionModal（db-migration-ux-optimization 9.1 共享切换确认弹窗）', () => {
  it('open=true 渲染标题、警示文案、重启指引与目标连接信息', () => {
    const wrapper = mountModal()
    expect(wrapper.find('.modal-header h2').text()).toBe('切换数据库')
    expect(wrapper.text()).toContain('切换后需手动重启后端服务方可生效')
    expect(wrapper.text()).toContain('目标库为空时仅保留 admin 账号')
    expect(wrapper.text()).toContain('develop/linux/start.sh')
    expect(wrapper.find('.switch-target strong').text()).toBe('目标 PG')
    expect(wrapper.find('.switch-target .muted').text()).toBe('10.0.0.5:5432/panshi')
  })

  it('open=false 时弹窗隐藏（display: none），数据全走 props 不依赖页面状态', () => {
    const wrapper = mountModal({ open: false })
    expect(wrapper.find('.modal-overlay').attributes('style')).toContain('display: none')
  })

  it('点击取消按钮：emit cancel + update:open(false)', async () => {
    const wrapper = mountModal()
    const cancelBtn = wrapper.findAll('.modal-footer button').find((b) => b.text() === '取消')
    expect(cancelBtn).toBeTruthy()
    await cancelBtn!.trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('update:open')).toEqual([[false]])
    // 组件不自关状态：open 由父级控制
    expect(wrapper.props('open')).toBe(true)
  })

  it('点击右上角 ×：同样 emit cancel + update:open(false)', async () => {
    const wrapper = mountModal()
    await wrapper.find('.modal-close').trigger('click')
    expect(wrapper.emitted('cancel')).toHaveLength(1)
    expect(wrapper.emitted('update:open')).toEqual([[false]])
  })

  it('点击确认切换：只 emit confirm，不自行关闭（由父级在成功后关闭）', async () => {
    const wrapper = mountModal()
    const confirmBtn = wrapper.find('.switch-confirm-btn')
    expect(confirmBtn.text()).toBe('确认切换')
    await confirmBtn.trigger('click')
    expect(wrapper.emitted('confirm')).toHaveLength(1)
    expect(wrapper.emitted('update:open')).toBeUndefined()
    expect(wrapper.emitted('cancel')).toBeUndefined()
  })

  it('传入 activeName 时展示当前活动库名（迁移页复用场景）', () => {
    const wrapper = mountModal({ activeName: '本地库' })
    expect(wrapper.find('.switch-current').text()).toContain('当前活动库')
    expect(wrapper.find('.switch-current').text()).toContain('本地库')
  })

  it('不传 activeName 时不渲染当前活动库行（DatabaseManagement 既有形态零变化）', () => {
    const wrapper = mountModal()
    expect(wrapper.find('.switch-current').exists()).toBe(false)
  })

  it('connection=null 时弹窗可渲染不崩溃（目标行留空，由父级保证打开前置）', () => {
    const wrapper = mountModal({ connection: null })
    expect(wrapper.find('.modal-header h2').text()).toBe('切换数据库')
    expect(wrapper.find('.switch-target strong').text()).toBe('')
  })
})
