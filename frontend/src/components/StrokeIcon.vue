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

<script setup lang="ts">
import { computed } from 'vue'

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
  // 警示三角（四档警示语义：危险 = 实心三角 + 感叹号，设计 .lp-notice .n-ico）
  warning:
    '<path d="M12 3.2 21.4 20H2.6L12 3.2z" fill="currentColor" stroke="none" /><path d="M12 9.4v4M12 16.6v.1" stroke="#fff" stroke-width="2" stroke-linecap="round" />',
} as const

/** 实心图标集合（fill=currentColor，无描边） */
const FILLED_ICONS = new Set<string>(['dots'])

const props = withDefaults(
  defineProps<{
    name: keyof typeof ICON_PATHS
    size?: number
  }>(),
  { size: 12 },
)

const inner = computed(() => ICON_PATHS[props.name])
const filled = computed(() => FILLED_ICONS.has(props.name))
</script>
