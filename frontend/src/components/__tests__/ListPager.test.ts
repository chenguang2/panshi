// 外置分页条（mockup-parity-standard r4-④⑤）：机制 + 交互锚点。
// 存在理由：a-table 内置分页对 dataSource 做客户端切片，组标记行会吃掉页容量（越后页丢得越多），
// 故三张列表页统一 `:pagination="false"` + 本组件。这里同时钉住「每页条数」下拉的初值匹配（约定 #56）。
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ListPager from '../ListPager.vue'

function mountPager(props: Record<string, unknown> = {}) {
  return mount(ListPager, {
    props: { page: 1, pageSize: 20, total: 27, unit: '个节点', ...props },
  })
}

describe('ListPager.vue', () => {
  it('左簇「共 N 单位 · 每页 [下拉]」、右簇页码', () => {
    const w = mountPager()
    expect(w.find('.p-info').text().replace(/\s+/g, ' ')).toContain('共 27 个节点')
    expect(w.find('.p-info b').text()).toBe('27')
    // 每页下拉初值精确匹配 pageSize（value 匹配失败会让下拉整块空白，约定 #56）
    const select = w.find('select.pager-select')
    expect((select.element as HTMLSelectElement).value).toBe('20')
    expect(w.findAll('.p-btn').length).toBeGreaterThanOrEqual(3)
  })

  it('页码按钮 = 页数；当前页带 active；点其他页 emit change(page, pageSize)', async () => {
    const w = mountPager({ total: 45 })
    const pages = w.findAll('.p-btn').filter((b) => /^\d+$/.test(b.text()))
    expect(pages.map((p) => p.text())).toEqual(['1', '2', '3'])
    expect(pages[0].classes()).toContain('active')
    await pages[1].trigger('click')
    expect(w.emitted('change')?.[0]).toEqual([2, 20])
  })

  it('首/末页时 prev/next 禁用；点 prev 回退一页', async () => {
    const first = mountPager()
    const [prev] = first.findAll('.p-btn')
    expect(prev.attributes('disabled')).toBeDefined()

    const w = mountPager({ page: 2, total: 45 })
    const btns = w.findAll('.p-btn')
    await btns[0].trigger('click')
    expect(w.emitted('change')?.[0]).toEqual([1, 20])
  })

  it('改每页条数回到第 1 页（emit change(1, size)）', async () => {
    const w = mountPager({ page: 2, total: 45 })
    const select = w.find('select.pager-select')
    await select.setValue('50')
    expect(w.emitted('change')?.[0]).toEqual([1, 50])
  })

  it('跳至输入框回车跳到指定页，超界夹到末页', async () => {
    const w = mountPager({ total: 45 })
    const input = w.find('.p-jump input')
    await input.setValue('3')
    await input.trigger('keyup.enter')
    expect(w.emitted('change')?.[0]).toEqual([3, 20])

    const w2 = mountPager({ total: 45 })
    const input2 = w2.find('.p-jump input')
    await input2.setValue('99')
    await input2.trigger('blur')
    expect(w2.emitted('change')?.[0]).toEqual([3, 20])
  })

  it('页数 > 7 时折叠为「首 … 当前±1 … 末」', () => {
    const w = mountPager({ page: 5, pageSize: 10, total: 200 })
    const texts = w.findAll('.p-btn').map((b) => b.text())
    expect(texts[0]).toBe('')
    expect(texts.filter((t) => /^\d+$/.test(t))).toEqual(['1', '4', '5', '6', '20'])
    expect(w.findAll('.p-gap').length).toBe(2)
  })
})
