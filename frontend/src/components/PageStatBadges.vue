<template>
  <span v-if="items.length" class="ph-inline">
    <span v-for="(item, i) in items" :key="i" class="ph-lite" :class="toneClass(item.tone, i)" data-test="page-stat">
      <b>{{ item.value }}</b> {{ item.label }}
    </span>
  </span>
</template>

<script setup lang="ts">
/**
 * 页头轻统计徽标排（list-pages-console-restyle 共享层，由 PageHeader 的 #stats slot 承载）。
 *
 * 视觉基准：docs/ui/Live-Artifact-5/proposal-c/nodes.html 的 `.ph-inline > .ph-lite`——
 * 24px 胶囊、11.5px、首项 accent 主统计（`lite-accent`）。样式单一来源 src/style.css「列表页控制台层」。
 * 约束：内部不得出现 <p>（PageHeader 的测试用 `wrapper.find('p')` 断言描述行）；items 为空时不输出 DOM。
 * 数据由页面传（当前已加载数据集），本组件不发请求。
 */
interface PageStatItem {
  value: number | string
  label: string
  tone?: 'accent' | 'ok' | 'warn' | 'bad'
}

defineProps<{
  items: PageStatItem[]
}>()

/** 首项恒为 accent 主统计（数量），其余按 tone 上色；无 tone 保持默认灰白胶囊 */
function toneClass(tone: PageStatItem['tone'], index: number): string {
  const resolved: PageStatItem['tone'] = index === 0 ? 'accent' : tone
  return resolved ? `lite-${resolved}` : ''
}
</script>
