<script setup lang="ts">
import { computed } from 'vue'

// 发布差异预览入口按钮（publish-diff-preview；批 7 用户裁决 C）：置于 PublishStatusTag
// 右侧的「差异」文字胶囊——下箭头圆钮曾被误读为「收起卡片」。显隐自判（待发布 /
// 发布未完全生效两态），不侵入共享状态组件本体（PublishStatusTag 为 15+ 处消费的
// 纯展示组件，#217）。
const props = defineProps<{
  /** 后端 pending_publish 推导（true = 待发布） */
  pending?: boolean
  /** 上次发布状态（'partial' = 发布未完全生效） */
  lastPublishStatus?: string | null
}>()

defineEmits<{ (e: 'click', event: Event): void }>()

const visible = computed(() => props.pending === true || props.lastPublishStatus === 'partial')
</script>

<template>
  <button
    v-if="visible"
    class="diff-preview-btn"
    type="button"
    title="查看与 Edge 节点的差异"
    @click.stop="$emit('click', $event)"
  >
    差异
  </button>
</template>

<style scoped>
/* 批 7（用户裁决 C）：下箭头圆钮与「收起」隐喻冲突 → 文字胶囊「差异」。
   高 20 不变、宽随文字（~42px）；accent 描边淡底与原圆钮同族。列表行内
   发布状态列预算已同步放宽（RouteList/UpstreamList 220 + minWidths）。 */
.diff-preview-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 20px;
  padding: 0 9px;
  border: 1px solid oklch(56% 0.16 210 / 30%);
  border-radius: 999px;
  background: var(--accent-bg, oklch(56% 0.16 210 / 10%));
  color: var(--accent);
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.12s;
}
.diff-preview-btn:hover {
  background: oklch(56% 0.16 210 / 20%);
}
</style>
