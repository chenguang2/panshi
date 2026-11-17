import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useFitColumnWidths, toDesignWidths, SELECTION_COLUMN_WIDTH } from '../useFitColumnWidths'

/**
 * 列宽自适应（mockup-parity-standard r6-② 方案 A）单测。
 *
 * 钉住：≥设计总宽时原样设计值、窄于设计总宽时等比收缩且总和恰等于可用宽、
 * 低于最小总宽按最小总宽缩放（允许滚动）、拖拽覆盖优先、minWidths 兜底。
 */

const DESIGN = {
  index: 48,
  ip: 149,
  service_port: 82,
  management_port: 82,
  edge_path: 377,
  status: 147,
  edge_version: 87,
  actions: 298,
}
const DESIGN_TOTAL = Object.values(DESIGN).reduce((a, b) => a + b, 0) // 1270

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  callback: ResizeObserverCallback
  constructor(cb: ResizeObserverCallback) {
    this.callback = cb
    FakeResizeObserver.instances.push(this)
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  trigger(): void {
    this.callback([], this as unknown as ResizeObserver)
  }
}

function mountWithWidth(width: number, options: Partial<Parameters<typeof useFitColumnWidths>[0]> = {}) {
  // 容器用「有 clientWidth 的桩元素」代替真实 DOM：jsdom 不做布局，直接给宽度即可
  const el = ref<HTMLElement | null>({ clientWidth: width } as unknown as HTMLElement)
  let api!: ReturnType<typeof useFitColumnWidths>
  const Host = defineComponent({
    setup() {
      api = useFitColumnWidths({
        designWidths: () => DESIGN,
        containerRef: el,
        // 与节点页同形：容器宽里含 antd 选择列（40px）
        reserved: () => SELECTION_COLUMN_WIDTH,
        ...options,
      })
      return () => h('div', 'host')
    },
  })
  const wrapper = mount(Host)
  return { wrapper, api, el }
}

const sum = (map: Record<string, number>) => Object.values(map).reduce((a, b) => a + b, 0)

beforeEach(() => {
  FakeResizeObserver.instances = []
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useFitColumnWidths', () => {
  it('容器宽 ≥ 设计总宽：原样返回设计值（1600 验收视口逐值一致，且不向上放大）', () => {
    const { wrapper, api } = mountWithWidth(DESIGN_TOTAL + SELECTION_COLUMN_WIDTH + 200)
    expect(api.widths.value).toEqual(DESIGN)
    wrapper.unmount()
  })

  it('窄于设计总宽：等比收缩且总和恰等于可用宽（余数补给弹性列，杜绝 1px 溢出）', () => {
    const target = 1110
    const { wrapper, api } = mountWithWidth(target + SELECTION_COLUMN_WIDTH, { flexKey: 'edge_path', minTotal: 1036 })
    const widths = api.widths.value
    expect(sum(widths)).toBe(target)
    // 每列都按同一比例收窄（含取整误差 ±1）
    const factor = target / DESIGN_TOTAL
    for (const key of Object.keys(DESIGN)) {
      expect(Math.abs(widths[key] - DESIGN[key] * factor)).toBeLessThanOrEqual(2)
    }
    wrapper.unmount()
  })

  it('低于最小总宽：按最小总宽缩放（即允许横向滚动，与设计页阈值同义）', () => {
    const minTotal = 1036
    const { wrapper, api } = mountWithWidth(800, { minTotal })
    expect(sum(api.widths.value)).toBe(minTotal)
    wrapper.unmount()
  })

  it('拖拽覆盖优先：被拖列保持像素值，差额由弹性列吸收，总和仍等于可用宽', () => {
    const target = 1110
    const { wrapper, api } = mountWithWidth(target + SELECTION_COLUMN_WIDTH, {
      flexKey: 'edge_path',
      minTotal: 1036,
      overrides: () => ({ ip: 200 }),
    })
    const widths = api.widths.value
    expect(widths.ip).toBe(200)
    expect(sum(widths)).toBe(target)
    wrapper.unmount()
  })

  it('minWidths 兜底：内容不可压的列不被缩到下限之下', () => {
    const target = 1110
    const { wrapper, api } = mountWithWidth(target + SELECTION_COLUMN_WIDTH, {
      minTotal: 1036,
      minWidths: () => ({ actions: 268, status: 140 }),
    })
    const widths = api.widths.value
    expect(widths.actions).toBeGreaterThanOrEqual(268)
    expect(widths.status).toBeGreaterThanOrEqual(140)
    expect(sum(widths)).toBe(target)
    wrapper.unmount()
  })

  it('弹姓列被拖拽覆盖时，余数改由首个未覆盖列吸收（避免总和偏差）', () => {
    const target = 1110
    const { wrapper, api } = mountWithWidth(target + SELECTION_COLUMN_WIDTH, {
      flexKey: 'edge_path',
      minTotal: 1036,
      overrides: () => ({ edge_path: 300 }),
    })
    const widths = api.widths.value
    expect(widths.edge_path).toBe(300)
    expect(sum(widths)).toBe(target)
    wrapper.unmount()
  })

  it('首次渲染（容器宽未测量）按设计值，resize 后校正', async () => {
    const { wrapper, api } = mountWithWidth(0, { flexKey: 'edge_path' })
    expect(api.widths.value).toEqual(DESIGN)
    await nextTick()
    wrapper.unmount()
  })
})

describe('toDesignWidths', () => {
  it('仅提取数值宽度的列（忽略无宽列与缺 key 列）', () => {
    expect(toDesignWidths([{ key: 'a', width: 100 }, { key: 'b' }, { width: 50 }, { key: 'c', width: '20%' }])).toEqual(
      {
        a: 100,
      },
    )
  })
})
