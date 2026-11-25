<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    :fill="filled ? 'currentColor' : 'none'"
    :stroke="filled ? 'none' : 'currentColor'"
    :stroke-width="filled ? undefined : 2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="inner"
  />
</template>

<script lang="ts">
/**
 * 设计稿 stroke 图标单点（mockup-parity-standard）：
 * 内部标记取自 docs/ui/Live-Artifact-5/proposal-c/nodes.html 原始 SVG（12/13px stroke 线稿风）。
 * 静态字面量经 v-html 注入 <svg>（无外部输入，无注入面）；antd 圈形图标不再用于三页行内/批量动作。
 *
 * 实心例外：`dots`（设计 .op-btn 的三圆横排）为 fill=currentColor + stroke=none 的实心图形，
 * 见 FILLED_ICONS——其余图标一律 stroke 线稿。
 */
const ICON_PATHS = {
  play: '<path d="M7 4l13 8-13 8z" />',
  pause: '<rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />',
  rotate: '<path d="M21 12a9 9 0 11-2.64-6.36" /><path d="M21 3v6h-6" />',
  pulse: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />',
  upload: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M7 9l5-5 5 5" /><path d="M12 4v10" />',
  // 页头操作：备份下载（设计 central.html/clusters.html .page-header-actions 原 path）
  download: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M7 10l5 5 5-5M12 15V3" />',
  plus: '<path d="M12 5v14M5 12h14" />',
  sliders:
    '<line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />',
  chevronDown: '<polyline points="6 9 12 15 18 9" />',
  // 分页条 prev/next（mockup .p-btn 内 12×12 chevron，mockup-parity-standard r4-⑤）
  chevronLeft: '<polyline points="15 6 9 12 15 18" />',
  chevronRight: '<polyline points="9 6 15 12 9 18" />',
  // 操作列「更多」三圆横排（设计 .menu-anchor svg：cx 5/12/19, cy 12, r 1.7；r5-①）
  dots: '<circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" />',
  // 列配置提示行图标（设计 .pop-hint：左右双箭头 + 中横线，r6-③-1）
  resizeH:
    '<polyline points="18 8 22 12 18 16" /><polyline points="6 8 2 12 6 16" /><line x1="2" y1="12" x2="22" y2="12" />',
  // 分组批量折叠（r5-④）：双线 chevron 向外=展开、向内=收起
  expandAll: '<polyline points="7 9 12 4 17 9" /><polyline points="7 15 12 20 17 15" />',
  collapseAll: '<polyline points="7 4 12 9 17 4" /><polyline points="7 20 12 15 17 20" />',
  // 批量删除（设计 .l5-batchbar 的批量删除图标：垃圾桶轮廓）
  trash: '<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />',
  // 插件开关工具条「全部启用/全部禁用」（设计稿原 path，批 7 bug3）
  check: '<path d="M20 6 9 17l-5-5" />',
  minus: '<line x1="5" y1="12" x2="19" y2="12" />',
  // 字段「常用参数速查」清单（Ansible 高级连接变量：点击弹出可选值表，行可点复制）
  list: '<path d="M4 7h16M4 12h16M4 17h16" />',
  // 空态图标（components/EmptyState.vue 默认 icon；设计原语 .empty5 的 52px 虚线圆内图形）
  inbox:
    '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11 2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z" />',
  // 警示三角（四档警示语义：危险 = 实心三角 + 感叹号，设计 .lp-notice .n-ico）
  warning:
    '<path d="M12 3.2 21.4 20H2.6L12 3.2z" fill="currentColor" stroke="none" /><path d="M12 9.4v4M12 16.6v.1" stroke="#fff" stroke-width="2" stroke-linecap="round" />',
  // ── 工具箱工作台（tools-page-restyle，取自 proposal-c/tools.html 工具栏原 path） ──
  code: '<polyline points="8 6 3 12 8 18" /><polyline points="16 6 21 12 16 18" />',
  link: '<path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7" />',
  braces:
    '<path d="M8 3H7a2 2 0 00-2 2v4a2 2 0 01-2 2 2 2 0 012 2v4a2 2 0 002 2h1" /><path d="M16 3h1a2 2 0 012 2v4a2 2 0 002 2 2 2 0 00-2 2v4a2 2 0 01-2 2h-1" />',
  lock: '<rect x="4" y="11" width="16" height="9" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" />',
  blocks:
    '<rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />',
  fileText:
    '<path d="M6 2h9l5 5v13a1 1 0 01-1 1H6a1 1 0 01-1-1V3a1 1 0 011-1z" /><path d="M14 2v5h5" /><path d="M9 13h6M9 17h6" />',
  columns: '<rect x="3" y="4" width="7" height="16" rx="1" /><rect x="14" y="4" width="7" height="16" rx="1" />',
  clock: '<circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />',
  key: '<circle cx="8" cy="15" r="4" /><path d="M11 12L20 3M16 7l3 3" />',
  swap: '<path d="M4 7h13M13 3l4 4-4 4" /><path d="M20 17H7M11 21l-4-4 4-4" />',
  fileDiff: '<path d="M6 2h9l5 5v13a1 1 0 01-1 1H6a1 1 0 01-1-1V3a1 1 0 011-1z" /><path d="M12 10v6M9 13h6" />',
  globe: '<circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />',
  shieldCheck: '<path d="M12 2l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5l8-3z" /><path d="M9 11l2 2 4-4" />',
  server:
    '<rect x="3" y="4" width="18" height="6" rx="1" /><rect x="3" y="14" width="18" height="6" rx="1" /><path d="M7 7h.01M7 17h.01" />',
  // 帮助按钮（工具面板头「帮助」accent 弱底按钮内 13px 问号圆）
  help: '<circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 015 .5c0 1.5-2.5 2-2.5 3.5M12 17h.01" />',
  // 描边警示三角（工具箱黄色警示条/黄字提醒：非阻断语义与实心 danger 三角区分）
  warnOutline: '<path d="M12 3L2 20h20L12 3z" /><path d="M12 10v4M12 17h.01" />',
} as const

/** 实心图标集合（fill=currentColor，无描边） */
const FILLED_ICONS = new Set<string>(['dots'])

/** 图标名联合类型（模块作用域导出：供 EmptyState 等转发 name 的组件复用，避免 string 透传丢类型） */
export type StrokeIconName = keyof typeof ICON_PATHS
</script>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    name: StrokeIconName
    size?: number
  }>(),
  { size: 12 },
)

const inner = computed(() => ICON_PATHS[props.name])
const filled = computed(() => FILLED_ICONS.has(props.name))
</script>
