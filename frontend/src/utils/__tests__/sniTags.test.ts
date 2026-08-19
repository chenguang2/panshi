import { describe, it, expect } from 'vitest'
import { splitSniTags, splitSniString, isReservedSni, mergeReservedDnsTags } from '../sniTags'

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

describe('splitSniString', () => {
  it('splits comma-separated sni field values', () => {
    expect(splitSniString('edge.local,api.example.com')).toEqual(['edge.local', 'api.example.com'])
  })

  it('trims whitespace and drops empty entries', () => {
    expect(splitSniString(' edge.local , api.example.com ,')).toEqual(['edge.local', 'api.example.com'])
  })

  it('returns empty array for empty input', () => {
    expect(splitSniString('')).toEqual([])
    expect(splitSniString(null as unknown as string)).toEqual([])
  })
})

describe('isReservedSni', () => {
  it('matches edge.local exactly', () => {
    expect(isReservedSni('edge.local')).toBe(true)
  })

  it('matches case-insensitively', () => {
    expect(isReservedSni('EDGE.LOCAL')).toBe(true)
    expect(isReservedSni('Edge.Local')).toBe(true)
  })

  it('rejects other domains', () => {
    expect(isReservedSni('api.example.com')).toBe(false)
    expect(isReservedSni('example.com')).toBe(false)
  })

  it('handles surrounding whitespace', () => {
    expect(isReservedSni(' edge.local ')).toBe(true)
  })
})

describe('mergeReservedDnsTags', () => {
  it('returns only edge.local for empty input', () => {
    expect(mergeReservedDnsTags([])).toEqual(['edge.local'])
  })

  it('prepends edge.local to user tags', () => {
    expect(mergeReservedDnsTags(['example.com'])).toEqual(['edge.local', 'example.com'])
  })

  it('dedups case-insensitively', () => {
    expect(mergeReservedDnsTags(['EDGE.LOCAL'])).toEqual(['edge.local'])
    expect(mergeReservedDnsTags(['Edge.Local', 'edge.local'])).toEqual(['edge.local'])
  })

  it('normalizes user tags to lowercase and trims', () => {
    expect(mergeReservedDnsTags([' Example.COM '])).toEqual(['edge.local', 'example.com'])
  })

  it('preserves user tag order', () => {
    expect(mergeReservedDnsTags(['b.com', 'a.com'])).toEqual(['edge.local', 'b.com', 'a.com'])
  })
})
