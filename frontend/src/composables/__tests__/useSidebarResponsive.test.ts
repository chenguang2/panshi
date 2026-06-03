import { describe, it, expect } from 'vitest'
import { checkSidebarBreakpoint } from '../useSidebarResponsive'

describe('checkSidebarBreakpoint', () => {
  it('returns true when width is below 992', () => {
    expect(checkSidebarBreakpoint(800)).toBe(true)
    expect(checkSidebarBreakpoint(991)).toBe(true)
  })

  it('returns false when width is 992 or above', () => {
    expect(checkSidebarBreakpoint(992)).toBe(false)
    expect(checkSidebarBreakpoint(1200)).toBe(false)
  })
})
