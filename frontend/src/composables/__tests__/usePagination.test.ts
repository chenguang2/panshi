import { describe, it, expect } from 'vitest'
import { paginationProps } from '../usePagination'

// 既有标准（#54 全站分页）回归锚点 + mockup-parity r3-3 overrides 扩展
describe('paginationProps - 标准配置（#54）', () => {
  it('机制字段齐备：sizeChanger/快速跳页/showTotal，选项为全局统一档位', () => {
    const props = paginationProps({ page: 2, pageSize: 20, total: 61 }, '个节点')
    expect(props.current).toBe(2)
    expect(props.pageSize).toBe(20)
    expect(props.total).toBe(61)
    expect(props.showSizeChanger).toBe(true)
    expect(props.showQuickJumper).toBe(true)
    expect(props.pageSizeOptions).toEqual(['10', '20', '50', '100'])
    expect(props.showTotal?.(61, 0)).toBe('共 61 个节点')
  })

  it('state 为 undefined 时仍返回结构完整配置', () => {
    const props = paginationProps(undefined)
    expect(props.total).toBeUndefined()
    expect(props.showSizeChanger).toBe(true)
    expect(props.showTotal?.(0, 0)).toBe('共 0 条')
  })
})

describe('paginationProps - overrides（mockup-parity r3-3）', () => {
  it('overrides 合并在标准配置之后（页面级 opt-in，不传零影响）', () => {
    const base = paginationProps({ page: 1, pageSize: 20, total: 27 }, '个节点')
    expect((base as Record<string, unknown>).buildOptionText).toBeUndefined()

    const over = paginationProps({ page: 1, pageSize: 20, total: 27 }, '个节点', {
      buildOptionText: (opt: { value: number | string }) => `${opt.value} 条`,
    })
    // 标准字段不丢
    expect(over.showSizeChanger).toBe(true)
    expect(over.showQuickJumper).toBe(true)
    expect(over.showTotal?.(27, 0)).toBe('共 27 个节点')
    // 覆盖生效（设计读感「20 条」而非「20 条/页」）
    expect((over.buildOptionText as (opt: { value: number | string }) => string)?.({ value: 20 })).toBe('20 条')
  })
})
