import { describe, it, expect } from 'vitest'
import { splitSniTags } from '../sniTags'

describe('splitSniTags', () => {
  it('splits comma-separated values', () => {
    expect(splitSniTags('a.com,b.com,c.com')).toEqual(['a.com', 'b.com', 'c.com'])
  })

  it('splits mixed separators (comma, space, newline)', () => {
    expect(splitSniTags('a.com b.com\nc.com,1.2.3.4')).toEqual(['a.com', 'b.com', 'c.com', '1.2.3.4'])
  })

  it('splits Chinese comma', () => {
    expect(splitSniTags('a.com，b.com')).toEqual(['a.com', 'b.com'])
  })

  it('strips surrounding whitespace', () => {
    expect(splitSniTags('  a.com  ,  b.com  ')).toEqual(['a.com', 'b.com'])
  })

  it('returns empty array for blank input', () => {
    expect(splitSniTags('')).toEqual([])
    expect(splitSniTags('   ')).toEqual([])
    expect(splitSniTags(' , ，\n ')).toEqual([])
  })
})
