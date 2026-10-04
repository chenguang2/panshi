// ux-review-2026-10-04 M 批次源码守卫（M1/M2/M3/M4/M6/M7/M8/M9）
// M5（SSL 信息行分行）为挂载测试，见 SslList.test.ts
// M8「双入口」与 M10「审计无展开」经代码核实为评审误报（各页仅单一入口；审计格已有 tooltip+抽屉），已勘误不修
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

function src(...parts: string[]): string {
  return readFileSync(resolve(process.cwd(), 'src', ...parts), 'utf-8')
}

describe('M1 四层代理权重语法与上游统一', () => {
  it('权重显示为全角括号（100）而非 :100', () => {
    const s = src('views', 'StreamProxyList.vue')
    expect(s).toContain('（{{ t.weight }}）')
    expect(s).not.toContain(':{{ t.weight }}')
  })
})

describe('M2 列表空态带引导 CTA', () => {
  it('静态资源空态提供添加引导按钮', () => {
    const s = src('views', 'StaticResourceList.vue')
    expect(s).toMatch(/sr-empty[\s\S]{0,400}?openAddModal/)
  })
  it('DNS 查询路由空态提供新建引导', () => {
    const s = src('views', 'DnsQueryList.vue')
    expect(s).toMatch(/dq-empty[\s\S]{0,400}?openCreateForm/)
  })
  it('Edge 直连空结果给出排查引导', () => {
    const s = src('views', 'EdgeClient.vue')
    expect(s).toContain('#emptyText')
  })
})

describe('M3 edge.env 初始态引导', () => {
  it('编辑器空内容时显示获取模板引导', () => {
    const s = src('views', 'EdgeEnv.vue')
    expect(s).toContain('ee-empty-hint')
    expect(s).toMatch(/ee-empty-hint[\s\S]*?获取配置模板/)
  })
})

describe('M4 新建集群表单不含状态字段', () => {
  it('状态字段仅在编辑模式渲染', () => {
    const s = src('components', 'ClusterFormModal.vue')
    const m = s.match(/<div class="form-group"[^>]*>\s*<label class="form-label">状态[\s\S]*?<\/div>\s*<\/div>/)
    expect(m, '需存在状态表单组').toBeTruthy()
    expect(m![0]).toMatch(/v-if="editingCluster"/)
  })
})

describe('M6 上游版本空值显示未发布', () => {
  it('版本列空值渲染「未发布」而非 v-', () => {
    const s = src('views', 'UpstreamList.vue')
    expect(s).toContain("record.current_version ? 'v' + record.current_version : '未发布'")
    expect(s).not.toContain("v{{ record.current_version || '-' }}")
  })
})

describe('M7 未分组术语统一', () => {
  it('views 目录零「未分类」残留', () => {
    const dir = resolve(process.cwd(), 'src/views')
    const offenders = readdirSync(dir, { recursive: true })
      .filter((f) => String(f).endsWith('.vue'))
      .map((f) => [String(f), readFileSync(resolve(dir, String(f)), 'utf-8')] as const)
      .filter(([, c]) => c.includes('未分类'))
      .map(([f]) => f)
    expect(offenders, `未分类残留: ${offenders.join(', ')}`).toEqual([])
  })
})

describe('M8 连接新建动词统一', () => {
  it('数据库管理与 CK 配置统一「+ 新建连接」', () => {
    expect(src('views', 'DatabaseManagement.vue')).toContain('+ 新建连接')
    expect(src('views', 'ClickHouseConfig.vue')).toContain('+ 新建连接')
  })
})

describe('M9 路由方法徽章超过 3 个收敛', () => {
  it('方法徽章渲染 slice(0, 3) + 溢出计数', () => {
    const s = src('views', 'RouteList.vue')
    expect(s).toContain('slice(0, 3)')
    expect(s).toContain('method-more')
  })
})
