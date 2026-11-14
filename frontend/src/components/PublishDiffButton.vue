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
    <span class="tri">▾</span>
  </button>
</template>

<style scoped>
.diff-preview-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  margin-left: 5px;
  padding: 0;
  border: 1px solid var(--border-strong, #bfbfbf);
  border-radius: 4px;
  background: var(--surface, #fff);
  color: var(--muted, #999);
  font-size: 10px;
  cursor: pointer;
  vertical-align: middle;
}
.diff-preview-btn:hover {
  border-color: #fa8c16;
  color: #fa8c16;
  background: #fff7e6;
}
.diff-preview-btn .tri {
  display: inline-block;
  line-height: 1;
}
</style>
