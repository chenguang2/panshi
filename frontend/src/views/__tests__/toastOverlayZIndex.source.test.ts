/**
 * Toast 层级守卫（toast-overlay-zindex）。
 *
 * 背景（2026-11-22 用户实测）：`.modal-overlay` 基础 z-index 1000，但多个调用点用内联
 * `z-index: 2000`（`BatchActionProgressModal.vue`、`useOverlayModal.ts`、NodeTaskCenter
 * 的程序化弹窗），而 antd message 默认 1010（cssinjs 以 `.ant-message` 类规则注入，
 * 非内联样式）→ 弹窗打开期间弹出的 toast 被整块盖住，既看不见也点不到。
 *
 * 修复是 style.css 的**单点**规则（`.ant-message { z-index: 3000 !important }`）。
 * 本守卫锁三件事：
 * ① 该规则存在且是 3000 + `!important`（cssinjs 的类规则无 !important，靠它压过）；
 * ② 源码里没有任何自绘层级超过 toast 档位（否则新弹窗会重新把 toast 盖住）；
 * ③ e2e 行为断言没被删（`e2e/relay-config-push.spec.ts` 的 elementFromPoint 用例）。
 *
 * 行为断言本体在 e2e（真实渲染 + 命中测试），vitest/jsdom 不跑样式层叠，故此处只做源码守卫。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const css = readFileSync(resolve(root, 'src/style.css'), 'utf-8')
const read = (rel: string) => readFileSync(resolve(root, rel), 'utf-8')

/** 从 style.css 取 toast 档位（单一事实源：守卫与被守卫对象同源，避免两处漂移） */
function toastZIndex(): number {
  const match = /\.ant-message\s*\{\s*[^}]*?z-index:\s*(\d+)\s*!important/.exec(css)
  if (!match) throw new Error('style.css 缺少 `.ant-message { z-index: <N> !important }` 规则')
  return Number(match[1])
}

/** 收集源码里出现的自绘 z-index / zIndex 数值（.vue 的 <style> 与 ts 的内联 style 都算） */
function collectDeclaredZIndexes(): { file: string; value: number; line: string }[] {
  const files = [...walk('src')].filter((f) => /\.(vue|ts)$/.test(f) && !/__tests__|\.test\.|\.spec\./.test(f))
  const found: { file: string; value: number; line: string }[] = []
  for (const file of files) {
    for (const line of read(file).split('\n')) {
      // 属性名之后到下一条语句（`;`）之间的数字：既覆盖 `z-index: 2000` / `zIndex: 2000`，
      // 也覆盖三元形态 `zIndex: pendingFilesSelectMode ? 1100 : undefined`
      for (const m of line.matchAll(/(?:z-index|zIndex):\s*([^;}]*)/g)) {
        for (const n of m[1].matchAll(/\b(\d{3,4})\b/g)) {
          found.push({ file, value: Number(n[1]), line: line.trim() })
        }
      }
    }
  }
  return found
}

/** 浮层阶梯四档（与 style.css「浮层层级阶梯」块同源，改档必须同改两处） */
const LADDER = { selfDrawnBase: 1000, basic: 2000, popup: 2100, toast: 3000 }

/**
 * 1001–2999 = 浮层专用区间：任何数值都必须能对上下面的档位语义。
 * 新增例外前先问「能不能用 2000/2100 档」，能就别加白名单。
 */
const FLOAT_BAND_WHITELIST: { file: string; value: number; reason: string }[] = [
  {
    file: 'src/components/MigrationLockBanner.vue',
    value: 1050,
    reason: '非交互顶条：语义上必须被弹窗/抽屉压住（只压头部与自绘遮罩基础档）',
  },
  {
    file: 'src/views/NodeTaskCenter.vue',
    value: 1100,
    reason: '自绘嵌套层：「选择暂存文件」面板压在「新建任务」模态(1000)之上',
  },
  {
    file: 'src/components/NodeTaskLogDrawer.vue',
    value: 1200,
    reason: '自绘嵌套层：节点任务日志抽屉压过页面与自绘遮罩基础档(1000)',
  },
  {
    file: 'src/components/GlobalSearch.vue',
    value: 2100,
    reason: '全屏命令面板：语义上压过 antd 弹窗(2000)，取 antd 弹层档（面板内无 antd 浮层）',
  },
]

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(resolve(root, dir))) {
    const rel = `${dir}/${entry}`
    if (statSync(resolve(root, rel)).isDirectory()) yield* walk(rel)
    else yield rel
  }
}

describe('Toast 必须压过自绘遮罩（style.css 单点）', () => {
  it('`.ant-message` 抬到 3000 且带 !important（cssinjs 类规则无 !important）', () => {
    expect(toastZIndex()).toBe(3000)
    // 必须带 !important：否则被 cssinjs 注入的 `.ant-message{z-index:1010}` 按注入顺序压掉
    expect(css).toMatch(/\.ant-message\s*\{\s*[^}]*z-index:\s*3000\s*!important/)
  })

  it('notification 同档（antd 默认同为 1010，将来接入不得再踩）', () => {
    expect(css).toMatch(/\.ant-notification\s*\{\s*[^}]*z-index:\s*3000\s*!important/)
  })

  it('源码内不存在高于 toast 档位的自绘层级（新增弹窗不得把 toast 重新盖住）', () => {
    const limit = toastZIndex()
    const offenders = collectDeclaredZIndexes().filter((r) => r.value > limit)
    expect(
      offenders,
      `以下自绘层级超过 ${limit}，会重新盖住 toast：${offenders.map((r) => `${r.file}:${r.value}`).join('、')}`,
    ).toEqual([])
  })

  it('e2e 行为断言仍在（真实渲染下 elementFromPoint 命中 toast）', () => {
    const spec = read('e2e/relay-config-push.spec.ts')
    expect(spec).toContain('elementFromPoint')
    expect(spec).toContain('.ant-message')
    expect(spec).toContain('toBeGreaterThan(2000)')
  })
})

/**
 * 浮层层级阶梯守卫（z-index-ladder，2026-11-22）
 *
 * 背景：antd 默认 token `zIndexPopupBase = 1000` → 弹窗/抽屉 1000、下拉/气泡/日期 1050，
 * 而自绘 `.modal-overlay` 多个调用点用内联 2000 → antd 弹窗被自绘遮罩盖住、自绘弹窗里的
 * antd 下拉/日期/气泡被遮罩盖住（元素在 DOM 里但点不到）。
 *
 * 修复是 style.css 的**单点**阶梯（弹窗/抽屉 2000、antd 弹层 2100、toast 3000），
 * 本块锁四件事：
 * ① 四档规则在 style.css 存在且带 !important（antd 两种写入形态都要压过）；
 * ② 抽屉必须抬 level 上下文根 `.ant-drawer`（只抬 content-wrapper 无效——2026-11-22 实测：
 *    注入的 1000 自绘遮罩压住了抽屉）；
 * ③ 源码不再出现零散的浮层档数值（1001–2999 全量白名单化，含迁移横幅/嵌套自绘层/命令面板）；
 * ④ 自绘 `.modal-overlay` 的内联值不得越过 antd 弹层档（否则又回到「盖住下拉」）。
 */
describe('浮层层级阶梯（style.css 单点）', () => {
  it('antd 基础浮层（弹窗/抽屉）在 2000 档，且抽屉的层级上下文根一并登记', () => {
    const block = /\.ant-modal-wrap,[\s\S]*?\{[^}]*z-index:\s*2000\s*!important/.exec(css)
    expect(block, 'style.css 缺少 antd 基础浮层 2000 档规则').not.toBeNull()
    for (const sel of ['.ant-modal-mask', '.ant-drawer', '.ant-drawer-content-wrapper', '.ant-drawer-mask']) {
      expect(block![0], `2000 档规则缺选择器 ${sel}`).toContain(sel)
    }
    // `.ant-drawer`（fixed + z-index，是抽屉的实际层级上下文根）单独强调：缺它就整块失效
    expect(block![0], '抽屉上下文根 `.ant-drawer` 必须单独成项（只抬子元素无效）').toMatch(/\.ant-drawer\s*,/)
  })

  it('antd 弹层（下拉/菜单/气泡/日期/提示）在 2100 档，压过自绘遮罩与 antd 弹窗', () => {
    const block = /\.ant-select-dropdown,[\s\S]*?\{[^}]*z-index:\s*2100\s*!important/.exec(css)
    expect(block, 'style.css 缺少 antd 弹层 2100 档规则').not.toBeNull()
    for (const sel of ['.ant-dropdown', '.ant-popover', '.ant-picker-dropdown', '.ant-tooltip']) {
      expect(block![0], `2100 档规则缺选择器 ${sel}`).toContain(sel)
    }
    expect(LADDER.popup).toBeGreaterThan(LADDER.basic)
  })

  it('自绘遮罩基础档仍是 1000（antd 弹窗 2000 恒在其上）', () => {
    expect(css).toMatch(new RegExp(`\\.modal-overlay\\s*\\{[^}]*z-index:\\s*${LADDER.selfDrawnBase}\\b`))
    expect(LADDER.basic).toBeGreaterThan(LADDER.selfDrawnBase)
  })

  it('阶梯本身有注释文档（改档必须连同注释与守卫一起改）', () => {
    expect(css).toContain('浮层层级阶梯')
    expect(css).toContain('2100')
    expect(css).toContain('3000')
  })

  it('源码内 1001–2999 区间的浮层数值全部白名单化（不得自造零散档位）', () => {
    const allowed = new Set(FLOAT_BAND_WHITELIST.map((w) => `${w.file}#${w.value}`))
    const offenders = collectDeclaredZIndexes()
      .filter((r) => r.value > LADDER.selfDrawnBase && r.value < LADDER.toast)
      // 2000 = 阶梯基础档（自绘遮罩内联 / antd 弹窗），任意文件可用；其余须白名单
      .filter((r) => r.value !== LADDER.basic)
      .filter((r) => !allowed.has(`${r.file}#${r.value}`))
    expect(
      offenders,
      `以下浮层层级未登记到阶梯：${offenders
        .map((r) => `${r.file}:${r.value}（${r.line}）`)
        .join('、')}；可用档位 = 2000（自绘遮罩/antd 弹窗）与 2100（antd 弹层/命令面板），其余需在本守卫白名单写明语义`,
    ).toEqual([])
  })

  it('白名单条目必须真实存在（清理后不得留死条目）', () => {
    const declared = collectDeclaredZIndexes()
    for (const w of FLOAT_BAND_WHITELIST) {
      expect(
        declared.some((r) => r.file === w.file && r.value === w.value),
        `白名单条目 ${w.file}#${w.value}（${w.reason}）在源码中已不存在，请删除该条目`,
      ).toBe(true)
    }
  })

  it('自绘 `.modal-overlay` 的内联值不得越过 antd 弹层档', () => {
    const offenders = collectDeclaredZIndexes().filter(
      (r) => r.line.includes('modal-overlay') && r.value > LADDER.basic,
    )
    expect(
      offenders,
      `自绘遮罩内联层级超过 ${LADDER.basic}，会重新盖住 antd 下拉/日期/气泡：${offenders
        .map((r) => `${r.file}:${r.value}`)
        .join('、')}`,
    ).toEqual([])
  })
})
