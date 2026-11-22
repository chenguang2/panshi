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
function collectDeclaredZIndexes(): { file: string; value: number }[] {
  const files = [...walk('src')].filter((f) => /\.(vue|ts)$/.test(f) && !/__tests__|\.test\.|\.spec\./.test(f))
  const found: { file: string; value: number }[] = []
  for (const file of files) {
    const text = read(file)
    for (const m of text.matchAll(/z-index:\s*(\d+)/g)) found.push({ file, value: Number(m[1]) })
    // 内联 style 对象形态（如 :style="{ zIndex: 2000 }"）
    for (const m of text.matchAll(/zIndex:\s*(\d+)/g)) found.push({ file, value: Number(m[1]) })
  }
  return found
}

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
