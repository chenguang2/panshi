import { describe, it, expect } from 'vitest'
import { autostartUrl } from '../edgeAutostart'

describe('edgeAutostart api', () => {
  it('builds autostart SSE url from node id', () => {
    expect(autostartUrl(10)).toBe('/nodes/10/autostart')
    expect(autostartUrl(1)).toBe('/nodes/1/autostart')
  })
})
