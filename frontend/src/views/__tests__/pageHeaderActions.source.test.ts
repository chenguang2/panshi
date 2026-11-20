import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 页头动作区守卫（openspec page-header-actions-standard，2026-11-21）
 *
 * 规范约束（design.md D2–D9）：
 * ① 页头按钮文案禁止 `+` / `＋` 前缀（加号由 StrokeIcon 的 plus 承担）；
 * ② 每页页头至多一颗 `.btn-primary`，且是动作区最后一颗；
 * ③ 页头按钮禁止 inline margin（间距由容器提供）；
 * ④ 页头按钮图标必须来自 StrokeIcon，禁止内联 <svg>；
 * ⑤ 设计页 HTML 的页头按钮集必须与本页实现一一对应（数量一致，且设计页同样无前缀）。
 */

const REPO = resolve(__dirname, '../../../..')
const VIEWS = resolve(__dirname, '..')
const DESIGN = resolve(REPO, 'docs/ui/Live-Artifact-5/proposal-c')

/** 页面视图 ↔ 设计页 HTML（两张 demo 页不参与） */
const PAGES: Array<[string, string]> = [
  ['NodeList.vue', 'nodes.html'],
  ['UpstreamList.vue', 'upstreams.html'],
  ['RouteList.vue', 'routes.html'],
  ['StreamProxyList.vue', 'stream-proxies.html'],
  ['DnsUdpProxyList.vue', 'dns-udp-proxies.html'],
  ['DnsQueryList.vue', 'dns-http-proxies.html'],
  ['PluginConfigList.vue', 'plugin-groups.html'],
  ['PluginMetadataList.vue', 'plugin-metadata.html'],
  ['GlobalRuleList.vue', 'global-rules.html'],
  ['StaticResourceList.vue', 'static-resources.html'],
  ['CaCertList.vue', 'ca-certs.html'],
  ['ServerCertList.vue', 'server-certs.html'],
  ['CentralList.vue', 'central.html'],
  ['ClusterList.vue', 'clusters.html'],
]

function read(file: string): string {
  return readFileSync(file, 'utf8')
}

/** 取 Vue 模板里的 `#actions` 槽内容 */
function implActions(source: string): string {
  const start = source.indexOf('<template #actions>')
  if (start < 0) return ''
  const end = source.indexOf('</template>', start)
  return source.slice(start, end)
}

/** 取设计页 `div.page-header-actions` 的完整内容（按 div 配对扫描） */
function designActions(html: string): string {
  const marker = 'class="page-header-actions"'
  const at = html.indexOf(marker)
  if (at < 0) return ''
  const start = html.lastIndexOf('<div', at)
  let depth = 0
  let i = start
  while (i < html.length) {
    const open = html.indexOf('<div', i)
    const close = html.indexOf('</div>', i)
    if (close < 0) break
    if (open >= 0 && open < close) {
      depth += 1
      i = open + 4
    } else {
      depth -= 1
      i = close + 6
      if (depth === 0) return html.slice(start, i)
    }
  }
  return ''
}

/** 抽取块内的按钮（原文 + 去标签后的文本） */
function buttons(block: string): Array<{ raw: string; text: string }> {
  const out: Array<{ raw: string; text: string }> = []
  const re = /<button\b[\s\S]*?<\/button>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(block)) !== null) {
    const raw = m[0]
    const text = raw
      .replace(/<svg[\s\S]*?<\/svg>/g, '')
      .replace(/<[^>]+>/g, '')
      .trim()
    out.push({ raw, text })
  }
  return out
}

describe('页头动作区守卫 · 实现侧', () => {
  for (const [file] of PAGES) {
    const source = read(resolve(VIEWS, file))
    const act = implActions(source)
    const btns = buttons(act)

    it(`${file}：按钮文案不带 + / ＋ 前缀`, () => {
      for (const b of btns) {
        expect(b.text.startsWith('+') || b.text.startsWith('＋'), `「${b.text}」带加号前缀`).toBe(false)
      }
    })

    it(`${file}：主操作唯一且在最右`, () => {
      const primaries = btns.map((b, i) => ({ i, primary: /class="[^"]*\bbtn-primary\b/.test(b.raw) }))
      const hits = primaries.filter((x) => x.primary)
      expect(hits.length, '页头主操作超过 1 颗').toBeLessThanOrEqual(1)
      if (hits.length === 1 && btns.length > 1) {
        expect(hits[0].i, '主操作不是最后一颗').toBe(btns.length - 1)
      }
    })

    it(`${file}：按钮不带 inline margin`, () => {
      for (const b of btns) {
        expect(/style="[^"]*margin-(left|right)/.test(b.raw), `「${b.text}」用了 inline margin`).toBe(false)
      }
    })

    it(`${file}：图标来自 StrokeIcon（无内联 svg）`, () => {
      expect(act).not.toContain('<svg')
    })
  }
})

describe('页头动作区守卫 · 设计页与实现一一对应', () => {
  for (const [file, html] of PAGES) {
    it(`${file} ↔ ${html}：按钮数量一致且设计页无加号前缀`, () => {
      const impl = buttons(implActions(read(resolve(VIEWS, file))))
      const design = buttons(designActions(read(resolve(DESIGN, html))))
      expect(design.length, `${html} 页头按钮数与实现不一致（设计 ${design.length} / 实现 ${impl.length}）`).toBe(
        impl.length,
      )
      for (const b of design) {
        expect(b.text.startsWith('+') || b.text.startsWith('＋'), `${html}「${b.text}」带加号前缀`).toBe(false)
      }
    })
  }
})
