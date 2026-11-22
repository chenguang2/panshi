/**
 * 源码守卫（B1 `BatchActionProgressModal` 字段改名）：共享批量进度弹窗的逐项身份字段是 `label`。
 *
 * 背景：该组件最初只服务节点批量动作，首列叫 `ip`；上游/路由复用后把资源**名称**塞进 `ip`，
 * 形成「名称装作地址」的语义错位。B1 把字段改为 `label`（节点域传 IP、上游/路由域传名称），
 * 本守卫钉住旧字段名不得回潮。
 *
 * 注意（AGENTS #93⑧）：断言的是「源码文本不含旧标识」，因此组件源码内注释也不得提及旧名。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf-8')

const COMPONENT = 'src/components/BatchActionProgressModal.vue'
const CONSUMERS = ['src/views/NodeList.vue', 'src/views/UpstreamList.vue', 'src/views/RouteList.vue']

describe('BatchActionProgressModal 源码守卫（B1 label 改名）', () => {
  it('组件内身份字段 = label，旧字段名（ip / expandedIp / expanded-ip）全部退场', () => {
    const src = read(COMPONENT)
    expect(src).toContain('label: string')
    expect(src).toContain('item.label')
    expect(src).toContain('expandedKey')
    // 身份列保持单一套 mono/110px 样式（节点 IP 与资源名称共用，不新增第二套分支）
    expect(src).toContain('font-family: var(--font-mono)')
    expect(src).toContain('min-width: 110px')
    expect(src).toContain('overflow-wrap: anywhere')
    expect(src).not.toContain('item.ip')
    expect(src).not.toContain('expandedIp')
    expect(src).not.toContain('expanded-ip')
    expect(src).not.toMatch(/\bip: string/)
  })

  it('三个入口都用 expanded-key 绑定，且不再出现旧 prop 名', () => {
    for (const page of CONSUMERS) {
      const src = read(page)
      expect(src).toContain(':expanded-key="batchProgressExpandedKey"')
      expect(src).not.toContain('expanded-ip')
      expect(src).not.toContain('batchProgressExpandedIp')
      expect(src).not.toContain('expandedIp:')
    }
  })

  it('进度项由 composable 构造为 label（上游/路由承载的是资源名称）', () => {
    const upstream = read('src/composables/useBatchUpstreamDelete.ts')
    const route = read('src/composables/useBatchRouteDelete.ts')
    const node = read('src/composables/useBatchNodeAction.ts')
    expect(upstream).toContain('label: u.name')
    expect(route).toContain('label: r.name')
    // 节点域仍是 IP，但同样走 label（节点 IP 作为身份标签）
    expect(node).toContain('label: n.ip')
    expect(node).toContain('expandedKey')
    // 上游/路由域不再以 ip 作为进度项字段键（名称不能再被塞进地址字段）
    expect(upstream).not.toMatch(/\bip:/)
    expect(route).not.toMatch(/\bip:/)
  })
})
