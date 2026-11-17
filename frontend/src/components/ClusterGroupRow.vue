<template>
  <div class="l5-group-inner" data-test="cluster-group-row" @click="emit('toggle')">
    <button
      type="button"
      class="g-chev"
      :class="{ folded: row.folded }"
      :aria-expanded="!row.folded"
      :title="row.folded ? '展开该组' : '折叠该组'"
      @click.stop="emit('toggle')"
    >
      <CaretDownOutlined />
    </button>
    <span class="g-name">{{ row.label }}</span>
    <span v-if="row.chips.length" class="g-meta">
      <span v-for="(chip, i) in row.chips" :key="`${chip.label}-${i}`" class="g-chip" :class="chip.tone || ''">{{
        chip.label
      }}</span>
    </span>
    <span class="g-spacer"></span>
    <span v-if="$slots.note" class="g-note"><slot name="note" /></span>
  </div>
</template>

<script setup lang="ts">
import { CaretDownOutlined } from '@ant-design/icons-vue'
import type { GroupHeaderRow } from '@/composables/useListClusterGrouping'

/**
 * a-table 组标记行内容（list-pages-console-restyle 共享层，contract §10.6）。
 *
 * 渲染位置：页面把本组件放进「首列 customCell」，该 td 返回 `{ colSpan: 可见列数 }`，其余列
 * `{ class: 'l5-group-cell-hidden' }`（样式见 style.css `.l5-group-row` 段），整行加 `class="l5-group-row"`。
 * 视觉基准：docs/ui/Live-Artifact-5/proposal-c/nodes.html 的 `.l5-group-inner`——accent 左条（::before）+
 * 浅底通栏 + 折叠箭头 + 集群名 + 统计芯片（首个=数量芯片，其余按 tone 上色）。
 * 形状唯一事实源 = composables/useListClusterGrouping.ts 的 GroupHeaderRow（勿在此另造字段）。
 */
defineProps<{
  row: GroupHeaderRow
}>()

const emit = defineEmits<{
  (e: 'toggle'): void
}>()
</script>
