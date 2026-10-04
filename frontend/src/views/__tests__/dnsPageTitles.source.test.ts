// ux-review-2026-10-04 H3 源码守卫：
// 侧边栏菜单为「DNS代理[UDP]/DNS代理[HTTP]」，页面标题却分别是
// 「DNS 代理」/「DNS 查询」——落地页应确认用户的点击，术语必须对齐。
// 注：vitest(jsdom) 下 import.meta.url 为 http 协议，文件定位用 process.cwd()（vitest 从 frontend/ 运行）
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function src(name: string): string {
  return readFileSync(resolve(process.cwd(), 'src/views', name), 'utf-8')
}

describe('DNS 页面标题与菜单术语一致（ux-review H3）', () => {
  it('两页 PageHeader 标题与菜单（DNS代理[UDP]/[HTTP]）对齐', () => {
    expect(src('DnsUdpProxyList.vue')).toContain('title="DNS 代理（UDP）"')
    expect(src('DnsQueryList.vue')).toContain('title="DNS 代理（HTTP）"')
  })
})
