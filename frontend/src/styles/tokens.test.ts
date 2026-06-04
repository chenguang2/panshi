import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('theme.css design tokens', () => {
  const cssPath = path.resolve(__dirname, 'theme.css')
  const css = fs.readFileSync(cssPath, 'utf-8')

  it('should declare OKLCH background token', () => {
    expect(css).toContain('--bg')
    expect(css).toContain('oklch')
  })

  it('should declare --surface token', () => {
    expect(css).toContain('--surface')
  })

  it('should declare --accent token', () => {
    expect(css).toContain('--accent')
  })

  it('should declare --font-mono token', () => {
    expect(css).toContain('--font-mono')
  })

  it('should declare shadow tokens', () => {
    expect(css).toContain('--shadow-sm')
    expect(css).toContain('--shadow-md')
    expect(css).toContain('--shadow-lg')
  })
})
