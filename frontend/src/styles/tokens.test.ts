import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('CSS design tokens', () => {
  const tokensPath = path.resolve(__dirname, 'tokens.css')
  const tokens = fs.readFileSync(tokensPath, 'utf-8')

  it('should declare --font-display variable', () => {
    expect(tokens).toContain('--font-display')
  })

  it('should declare --font-mono variable', () => {
    expect(tokens).toContain('--font-mono')
  })
})

describe('theme-default.css', () => {
  const cssPath = path.resolve(__dirname, 'theme-default.css')
  const css = fs.readFileSync(cssPath, 'utf-8')

  it('should set --font-display value', () => {
    expect(css).toMatch(/--font-display\s*:/)
  })

  it('should set --font-mono value', () => {
    expect(css).toMatch(/--font-mono\s*:/)
  })
})

describe('theme-dark.css', () => {
  const cssPath = path.resolve(__dirname, 'theme-dark.css')
  const css = fs.readFileSync(cssPath, 'utf-8')

  it('should set --font-display value', () => {
    expect(css).toMatch(/--font-display\s*:/)
  })

  it('should set --font-mono value', () => {
    expect(css).toMatch(/--font-mono\s*:/)
  })
})
