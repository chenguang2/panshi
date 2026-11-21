/**
 * 卡片类四页 ⋯ 菜单三栏构建器单一来源守卫（AGENTS #81① + #88）。
 *
 * 背景：表格类页（上游/路由）的 ⋯ 菜单自 B3 起由 utils/resourceActionMenu.buildResourceActionMenu
 * 构建（CRUD → 危险 → 动作，危险项独占一栏并常驻解释），而卡片类四页（插件组 / 插件元数据 /
 * 全局规则 / 静态资源）仍是手写 HTML 的两栏结构（查看/编辑/版本管理 → 分隔线 → 删除）。
 * 本守卫钉住：① 四页菜单条目一律来自构建器，模板内不得再出现手写条目文案；
 * ② 分组顺序与栏间分隔线只由遍历序号决定；③ 全站构建器消费方集合稳定（新增/删除须同步本清单）。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { resolve } from 'node:path'

const SRC = resolve(process.cwd(), 'src')
const CARD_PAGES = ['PluginConfigList.vue', 'PluginMetadataList.vue', 'GlobalRuleList.vue', 'StaticResourceList.vue']

function read(rel: string): string {
  return readFileSync(resolve(SRC, rel), 'utf-8')
}

/** 取出 `.l5-menu` 弹层块（卡片页菜单的唯一渲染容器） */
function menuBlock(s: string, file: string): string {
  const start = s.indexOf('<div class="l5-menu"')
  expect(start, `${file} 应渲染 .l5-menu 弹层`).toBeGreaterThan(-1)
  const end = s.indexOf('</div>', s.indexOf('</template>', start))
  const block = s.slice(start, end > start ? end : s.length)
  expect(block.length, `${file} 的 .l5-menu 块应可定位`).toBeGreaterThan(50)
  return block
}

/** 收集 src 下所有 .vue / .ts 源文件（排除测试与定义模块） */
function sourceFiles(dir = SRC): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__') continue
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.(vue|ts)$/.test(entry)) continue
    out.push(full)
  }
  return out
}

describe('#81① 卡片页 ⋯ 菜单由 buildResourceActionMenu 单一构建', () => {
  it('四页均导入并使用构建器（不再手写菜单项）', () => {
    for (const f of CARD_PAGES) {
      const s = read(`views/${f}`)
      expect(s, f).toContain("from '@/utils/resourceActionMenu'")
      expect(s, f).toContain('buildResourceActionMenu({')
    }
  })

  it('四页菜单模板按分组遍历渲染，且不含手写条目文案', () => {
    for (const f of CARD_PAGES) {
      const block = menuBlock(read(`views/${f}`), f)
      // 分组遍历：`v-for="(group, gi) in <菜单组标识>"`（静态资源按记录构建，故为 menuGroups(sr)）
      expect(block, f).toMatch(/v-for="\(group, gi\) in [A-Za-z_$][\w$]*(?:\([^)]*\))?"/)
      // 条目遍历：button 的标题/解释来自条目元数据（v-for + 插值），不是写死的中文
      expect(block, f).toMatch(/<span class="mi-main">\{\{ [a-z]+\.title \}\}<\/span>/)
      expect(block, f).toMatch(/<span v-if="[a-z]+\.desc" class="mi-sub">\{\{ [a-z]+\.desc \}\}<\/span>/)
      // 危险态/禁用态也由元数据驱动
      expect(block, f).toContain(':class="{ danger: ')
      expect(block, f).toContain(':disabled="')
      // 点击按条目 key 分发（业务函数不外泄到模板硬编码）
      expect(block, f).toMatch(/@click="handleMenu\([a-z]+\.key, /)
      // 手写条目：菜单块内不得再出现字面量主文案 / 硬编码 danger 类
      for (const label of ['查看', '编辑', '删除', '版本管理', '上传 ZIP', '替换 ZIP'])
        expect(block, `${f} 菜单块内不应写死「${label}」`).not.toMatch(new RegExp(`>${label}<`))
      expect(block, f).not.toContain('class="mi danger"')
    }
  })

  it('栏间分隔线只声明一次，位置由遍历序号决定（首栏不画、空栏被构建器剔除）', () => {
    for (const f of CARD_PAGES) {
      const block = menuBlock(read(`views/${f}`), f)
      const dividers = [...block.matchAll(/<hr v-if="gi > 0" class="menu-sep" \/>/g)]
      expect(dividers, `${f} 只应有一条栏间分隔线声明`).toHaveLength(1)
    }
  })

  it('三栏顺序：crud → danger → actions（构建器按此顺序输出，页面按顺序书写配置）', () => {
    for (const f of ['PluginConfigList.vue', 'PluginMetadataList.vue', 'GlobalRuleList.vue']) {
      const s = read(`views/${f}`)
      const crudAt = s.indexOf('crud: [')
      const dangerAt = s.indexOf('danger: [')
      const actionsAt = s.indexOf('actions: [')
      expect(crudAt, f).toBeGreaterThan(-1)
      expect(dangerAt, f).toBeGreaterThan(crudAt)
      expect(actionsAt, f).toBeGreaterThan(dangerAt)
      expect(s.slice(crudAt, dangerAt), f).toContain('查看')
      expect(s.slice(dangerAt, actionsAt), f).toContain('danger: true')
      expect(s.slice(actionsAt), f).toContain('版本管理')
    }
    // 静态资源按记录构建（broken 分支先行、danger 条目提为共享常量），顺序语义相同：
    // crud 在 actions 之前，danger 元数据以 `danger: true` 声明并经 `danger,` 传入两处调用
    const sr = read('views/StaticResourceList.vue')
    expect(sr.indexOf('const danger = [')).toBeGreaterThan(-1)
    expect(sr).toMatch(/desc: '删平台配置，可同步删 Edge 已分发文件（弹窗可选）',\s*\n\s*danger: true,/)
    expect(sr.match(/^\s+danger,$/gm)?.length ?? 0).toBe(2)
    expect(sr.indexOf('crud: [', sr.indexOf('return buildResourceActionMenu'))).toBeLessThan(sr.indexOf('actions: ['))
  })

  it('危险项解释逐字保留（各页现有文案，勿改写）', () => {
    const expected: Record<string, string> = {
      'PluginConfigList.vue': '删平台配置，可同步删 Edge 插件组（弹窗可选）',
      'PluginMetadataList.vue': '删平台配置，可同步删 Edge 已发布配置（弹窗可选）',
      'GlobalRuleList.vue': '删平台配置，可同步删 Edge 全局规则（弹窗可选）',
      'StaticResourceList.vue': '删平台配置，可同步删 Edge 已分发文件（弹窗可选）',
    }
    for (const [f, desc] of Object.entries(expected)) {
      const s = read(`views/${f}`)
      expect(s, f).toContain(`desc: '${desc}'`)
      expect(s, f).toContain("desc: '历史版本查看与回滚'")
    }
  })

  it('全站构建器消费方 = 6 处（上游 / 路由 + 卡片四页）；节点页由 useClusterNodes 配置驱动', () => {
    const consumers = sourceFiles()
      .filter((p) => !p.endsWith('utils/resourceActionMenu.ts'))
      .filter((p) => readFileSync(p, 'utf-8').includes('buildResourceActionMenu('))
      .map((p) => p.slice(SRC.length + 1).replace(/\\/g, '/'))
      .sort()
    expect(consumers).toEqual([
      'views/GlobalRuleList.vue',
      'views/PluginConfigList.vue',
      'views/PluginMetadataList.vue',
      'views/RouteList.vue',
      'views/StaticResourceList.vue',
      'views/UpstreamList.vue',
    ])
    // 节点页菜单是配置驱动（useClusterNodes 的 danger/desc 元数据 + 模板按分组渲染），不走构建器
    const nodeCfg = read('composables/useClusterNodes.ts')
    expect(nodeCfg).toContain("key: 'delete',")
    expect(nodeCfg).toContain('danger: true,')
  })
})

describe('#81① 设计页示例菜单同步三栏顺序（#82/#90 设计页 ↔ 实现一一对应）', () => {
  const DESIGN = resolve(process.cwd(), '../docs/ui/Live-Artifact-5/proposal-c')
  // 四张卡片页设计稿 + 统一管理面板（对应 Tab 的示例菜单，此前仍是两栏）
  const FILES = [
    'plugin-groups.html',
    'plugin-metadata.html',
    'global-rules.html',
    'static-resources.html',
    'central.html',
  ]

  function menuBlocks(file: string): string[] {
    const html = readFileSync(resolve(DESIGN, file), 'utf-8')
    return [...html.matchAll(/<div class="l5-menu"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => m[1])
  }

  for (const f of FILES) {
    it(`${f}: 版本管理归末位动作栏，删除独占危险栏且两侧有分隔线`, () => {
      const blocks = menuBlocks(f)
      expect(blocks.length, `${f} 应有示例菜单`).toBeGreaterThan(0)
      let withVersion = 0
      for (const block of blocks) {
        const delAt = block.indexOf('mi danger')
        if (delAt > -1) {
          // 危险栏之前必须有分隔线（CRUD 与危险分栏）
          expect(block.slice(0, delAt).lastIndexOf('<hr class="menu-sep">'), `${f} 删除前应有分隔线`).toBeGreaterThan(
            -1,
          )
        }
        const verAt = block.indexOf('版本管理')
        if (verAt === -1) continue
        withVersion++
        // 三栏顺序：版本管理（动作栏）必须在危险栏之后，且中间有分隔线
        expect(delAt, `${f} 版本管理前应有危险栏`).toBeGreaterThan(-1)
        expect(verAt, `${f} 版本管理应在删除之后`).toBeGreaterThan(delAt)
        const between = block.slice(delAt, verAt)
        expect(between, `${f} 危险栏与动作栏之间应有分隔线`).toContain('<hr class="menu-sep">')
      }
      expect(withVersion, `${f} 至少一个菜单含版本管理（卡片页四页）`).toBeGreaterThan(0)
    })
  }
})
