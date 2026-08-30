import { describe, it, expect } from 'vitest'
import { ansiToHtml, stripAnsi } from '../ansi'

describe('ansiToHtml', () => {
  it('converts full ANSI escape sequences to colored spans', () => {
    const html = ansiToHtml('\x1b[0;32mok\x1b[0m')
    expect(html).toContain('color:#859900')
    expect(html).toContain('ok')
    expect(html).not.toContain('\x1b[')
  })

  it('removes visible [0m without ESC char (JSON transport may drop ESC)', () => {
    // The user-reported case: visible "[0m" residues like "[0mTASK ...[0m"
    const html = ansiToHtml('[0mTASK [edge : run][0m')
    expect(html.includes('[0m')).toBe(false)
    expect(html.includes('TASK [edge : run]')).toBe(true)
  })

  it('escapes HTML to prevent XSS', () => {
    const html = ansiToHtml('<script>alert(1)</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('balances span tags', () => {
    const html = ansiToHtml('\x1b[0;32ma\x1b[0;31mb\x1b[0m')
    const open = (html.match(/<span /g) || []).length
    const close = (html.match(/<\/span>/g) || []).length
    expect(open).toBe(close)
  })

  it('does not convert plain bracket content like [192.168.100.42]', () => {
    const html = ansiToHtml('TASK [edge : run] on [192.168.100.42]')
    expect(html.indexOf('[192.168.100.42]')).toBeGreaterThan(-1)
    expect(html.indexOf('[edge : run]')).toBeGreaterThan(-1)
  })
})

describe('stripAnsi', () => {
  it('removes both full and visible ANSI sequences', () => {
    const text = stripAnsi('\x1b[0;32mok\x1b[0m [0mline[0m')
    expect(text).toBe('ok line')
  })
})

describe('escapeHtml', () => {
  it('escapes all HTML-significant characters', async () => {
    const { escapeHtml } = await import('../ansi')
    expect(escapeHtml(`<script>"x" & 'y'</script>`)).toBe(
      '&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;',
    )
  })
  it('leaves plain text untouched', async () => {
    const { escapeHtml } = await import('../ansi')
    expect(escapeHtml('nginx-upstream 集群A')).toBe('nginx-upstream 集群A')
  })
})
