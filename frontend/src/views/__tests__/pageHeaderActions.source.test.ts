import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

/**
 * 页头动作区 / 主操作按钮守卫（openspec page-header-actions-standard，2026-11-21）
 *
 * 规范（design.md D2–D9）：
 * ① 主操作（`.btn-primary` / `a-button type="primary"`，含页头与空态 CTA）文案禁 `+` / `＋` 前缀
 *    —— 页头加号由 StrokeIcon 的 plus 承担；表单内逐行/逐项「添加」（ghost/link 按钮）不受此限；
 * ② 页头动作区每页至多一颗 primary；设计稿覆盖的 14 页要求 primary 位于动作区末尾；
 * ③ 页头按钮禁止 inline margin（间距由容器提供）；
 * ④ 页头按钮图标必须来自 StrokeIcon，禁止内联 <svg>；
 * ⑤ 设计页 HTML 的页头按钮集必须与本页实现一一对应（数量一致，且设计页同样无前缀）。
 */

const REPO = resolve(__dirname, '../../../..')
const SRC = resolve(__dirname, '../..')
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
  ['EdgeEnv.vue', 'edge-env.html'],
  ['Tools.vue', 'tools.html'],
  ['EdgeAutostart.vue', 'edge-autostart.html'],
]

function read(file: string): string {
  return readFileSync(file, 'utf8')
}

/** 递归收集 .vue 文件 */
function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      if (name === '__tests__') continue
      out.push(...walk(full))
    } else if (name.endsWith('.vue')) {
      out.push(full)
    }
  }
  return out
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

interface Btn {
  raw: string
  text: string
}

/** 抽取块内的原生按钮与 a-button（保留原文与去标签后的文本） */
function buttons(block: string): Btn[] {
  const out: Btn[] = []
  const re = /<(button|a-button)\b[\s\S]*?<\/\1>/g
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

/** 主操作按钮：原生 .btn-primary（字面 class，动态 :class 不计）或 a-button type="primary" */
function isPrimary(raw: string): boolean {
  return /(?<!:)class="[^"]*\bbtn-primary\b/.test(raw) || /<a-button[^>]*\btype="primary"/.test(raw)
}

const VUE_FILES = walk(VIEWS)
const HEADER_FILES = VUE_FILES.filter((f) => read(f).includes('<template #actions>'))

describe('主操作按钮守卫 · 全站（含页头与空态 CTA）', () => {
  for (const file of VUE_FILES) {
    const rel = file.slice(SRC.length + 1)
    it(`${rel}：primary 按钮文案不带 + / ＋ 前缀`, () => {
      const bad = buttons(read(file)).filter(
        (b) => isPrimary(b.raw) && (b.text.startsWith('+') || b.text.startsWith('＋')),
      )
      expect(
        bad.map((b) => b.text),
        '主操作按钮仍带加号前缀',
      ).toEqual([])
    })
  }
})

describe('页头动作区守卫 · 实现侧', () => {
  for (const file of HEADER_FILES) {
    const rel = file.slice(SRC.length + 1)
    const act = implActions(read(file))
    const btns = buttons(act)

    it(`${rel}：按钮不带 inline margin`, () => {
      for (const b of btns) {
        expect(/style="[^"]*margin-(left|right)/.test(b.raw), `「${b.text}」用了 inline margin`).toBe(false)
      }
    })

    it(`${rel}：图标来自 StrokeIcon（无内联 svg）`, () => {
      expect(act).not.toContain('<svg')
    })

    it(`${rel}：primary 至多一颗`, () => {
      expect(btns.filter((b) => isPrimary(b.raw)).length).toBeLessThanOrEqual(1)
    })
  }
})

describe('页头动作区守卫 · 设计稿覆盖页（主操作在最右）', () => {
  for (const [file] of PAGES) {
    const btns = buttons(implActions(read(resolve(VIEWS, file))))
    it(`${file}：主操作在最右`, () => {
      const idx = btns.map((b, i) => ({ i, primary: isPrimary(b.raw) })).filter((x) => x.primary)
      if (idx.length === 1 && btns.length > 1) expect(idx[0].i, '主操作不是最后一颗').toBe(btns.length - 1)
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

describe('页头统计徽标守卫 · 设计页与实现一致', () => {
  /** 设计页 header 区域（标题 + 描述 + 统计徽标），截到动作区之前 */
  function designHeader(html: string): string {
    const at = html.indexOf('class="page-header"')
    if (at < 0) return ''
    const seg = html.slice(at, at + 2000)
    const cut = seg.indexOf('page-header-actions')
    return cut > 0 ? seg.slice(0, cut) : seg
  }

  for (const [file, html] of PAGES) {
    const designHasBadge = designHeader(read(resolve(DESIGN, html))).includes('ph-inline')
    const implHasBadge = read(resolve(VIEWS, file)).includes('PageStatBadges')
    it(`${file} ↔ ${html}：页头徽标两侧一致（设计 ${designHasBadge ? '有' : '无'} / 实现 ${implHasBadge ? '有' : '无'}）`, () => {
      expect(implHasBadge).toBe(designHasBadge)
    })
  }

  it('概览页两侧都不放页头徽标（数字已由统计卡承担）', () => {
    expect(designHeader(read(resolve(DESIGN, 'overview.html')))).not.toContain('ph-inline')
    expect(read(resolve(VIEWS, 'Dashboard.vue'))).not.toContain('PageStatBadges')
  })
})
