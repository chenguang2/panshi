import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

describe('NodeTaskLogViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  const baseProps = {
    logs: ['line one', 'line two'],
    stdout: 'stdout-content',
    stderr: 'stderr-content',
    command: 'ansible-playbook run',
  }

  it('renders stdout tab content by default', async () => {
    const LogViewer = (await import('../NodeTaskLogViewer.vue')).default
    const wrapper = mount(LogViewer, { props: { ...baseProps } })
    // when live logs exist, stdout tab shows them (real-time preference)
    expect(wrapper.text()).toContain('line one')
    expect(wrapper.text()).toContain('line two')
    wrapper.unmount()
  })

  it('switches to stderr tab and shows stderr', async () => {
    const LogViewer = (await import('../NodeTaskLogViewer.vue')).default
    const wrapper = mount(LogViewer, { props: { ...baseProps } })
    const stderrTab = wrapper.findAll('.ner-tab').find((t) => t.text().includes('stderr'))
    expect(stderrTab).toBeTruthy()
    await stderrTab!.trigger('click')
    expect(wrapper.text()).toContain('stderr-content')
    wrapper.unmount()
  })

  it('shows command tab', async () => {
    const LogViewer = (await import('../NodeTaskLogViewer.vue')).default
    const wrapper = mount(LogViewer, { props: { ...baseProps } })
    const cmdTab = wrapper.findAll('.ner-tab').find((t) => t.text().includes('命令'))
    await cmdTab!.trigger('click')
    expect(wrapper.text()).toContain('ansible-playbook run')
    wrapper.unmount()
  })

  it('shows live logs section when logs provided', async () => {
    const LogViewer = (await import('../NodeTaskLogViewer.vue')).default
    const wrapper = mount(LogViewer, { props: { ...baseProps } })
    expect(wrapper.text()).toContain('line one')
    wrapper.unmount()
  })

  it('shows empty state when no output at all', async () => {
    const LogViewer = (await import('../NodeTaskLogViewer.vue')).default
    const wrapper = mount(LogViewer, { props: { logs: [], stdout: '', stderr: '', command: '' } })
    expect(wrapper.text()).toContain('无输出')
    wrapper.unmount()
  })

  it('auto-scrolls the log box to the bottom when new lines arrive', async () => {
    const LogViewer = (await import('../NodeTaskLogViewer.vue')).default
    const wrapper = mount(LogViewer, { props: { logs: ['one'], stdout: '', stderr: '', command: '' } })
    const box = wrapper.find('.log-scroll').element as HTMLElement
    // simulate being scrolled up (user reading history)
    Object.defineProperty(box, 'scrollHeight', { value: 2000, configurable: true })
    Object.defineProperty(box, 'clientHeight', { value: 100, configurable: true })
    box.scrollTop = 0
    box.dispatchEvent(new Event('scroll'))
    await wrapper.setProps({ logs: ['one', 'two'] })
    await new Promise((r) => setTimeout(r, 10))
    // scrolled up => stays put, shows "回到最新"
    expect(wrapper.find('.back-to-latest').exists()).toBe(true)
    // click 回到最新 => scrolls to bottom and hides the button
    await wrapper.find('.back-to-latest').trigger('click')
    expect(box.scrollTop).toBe(2000)
    expect(wrapper.find('.back-to-latest').exists()).toBe(false)
    wrapper.unmount()
  })
})
