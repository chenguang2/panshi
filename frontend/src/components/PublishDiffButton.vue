<script setup lang="ts">
import { computed } from 'vue'

// 发布差异预览入口按钮（publish-diff-preview）：置于 PublishStatusTag 右侧的
// 小三角按钮。显隐自判（待发布 / 发布未完全生效两态），不侵入共享状态组件本体
// （PublishStatusTag 为 15+ 处消费的纯展示组件，#217）。
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
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  </button>
</template>

<style scoped>
/* mockup-parity-standard r7：对齐设计 .diff-btn —— 20×20 圆形、accent 淡底 + accent 30% 描边 +
   11px chevron；间距由父容器 gap 6px 承担（不再自带 margin）。 */
.diff-preview-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid oklch(56% 0.16 210 / 30%);
  border-radius: 999px;
  background: var(--accent-bg, oklch(56% 0.16 210 / 10%));
  color: var(--accent);
  cursor: pointer;
  transition: all 0.12s;
}
.diff-preview-btn:hover {
  background: oklch(56% 0.16 210 / 20%);
}
.diff-preview-btn svg {
  width: 11px;
  height: 11px;
}
</style>
