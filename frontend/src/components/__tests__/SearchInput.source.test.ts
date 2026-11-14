// ux-review 搜索框一致性（2026-11-11）源码守卫：
// 全站搜索框统一走 components/SearchInput.vue（放大镜恒在右、单色、有输入时换清空按钮）。
// 禁止页面再内联 .search-input-wrap 手写输入框或使用彩色 emoji 放大镜（🔍 U+1F50D），
// 也禁止再用 antd a-input-search（放大镜在右侧变成灰色按钮，是第三种造型）。
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { relative, resolve, join } from 'node:path'

const SRC = resolve(process.cwd(), 'src')

function vueFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue
      out.push(...vueFiles(full, out))
    } else if (entry.endsWith('.vue')) {
      out.push(full)
    }
  }
  return out
}

const files = vueFiles(SRC)
const sourceOf = (f: string): string => readFileSync(f, 'utf-8')

describe('搜索框统一（源码守卫）', { timeout: 30000 }, () => {
  it('共享组件 SearchInput.vue 存在', () => {
    expect(() => sourceOf(join(SRC, 'components', 'SearchInput.vue'))).not.toThrow()
  })

  it('没有页面再内联 .search-input-wrap 手写输入框', () => {
    const offenders = files
      .filter((f) => !f.endsWith('components/SearchInput.vue'))
      .filter((f) => /<div[^>]*class="[^"]*search-input-wrap/.test(sourceOf(f)))
      .map((f) => relative(SRC, f))
    expect(offenders, `以下文件绕过 SearchInput 手写了搜索框：${offenders.join(', ')}`).toEqual([])
  })

  it('没有彩色 emoji 放大镜（🔍）', () => {
    const offenders = files.filter((f) => sourceOf(f).includes('🔍')).map((f) => relative(SRC, f))
    expect(offenders, `以下文件使用 emoji 放大镜：${offenders.join(', ')}`).toEqual([])
  })

  it('没有 antd a-input-search（第三种搜索框造型）', () => {
    const offenders = files.filter((f) => sourceOf(f).includes('<a-input-search')).map((f) => relative(SRC, f))
    expect(offenders, `以下文件使用 a-input-search：${offenders.join(', ')}`).toEqual([])
  })
})
