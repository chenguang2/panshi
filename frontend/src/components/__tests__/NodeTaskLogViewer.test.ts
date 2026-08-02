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
})
