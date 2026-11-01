<script setup lang="ts">
import { computed } from 'vue'

/**
 * 节点任务分段进度（node-task-ux-optimization D6 6.4）
 *
 * 旧实现只有红/绿两态、按 success/total 取宽度，导致：
 * 失败任务显示空灰条（看着像没开始）、部分成功显示整条暗红。
 * 这里按「成功 / 失败 / 跳过 / 取消 / 执行中剩余」分段着色，
 * 百分比取完成度（已结束节点 / 总数），不是成功率。
 */
const props = withDefaults(
  defineProps<{
    success: number
    failed: number
    skipped?: number
    cancelled?: number
    total: number
    /** 任务是否执行中：剩余份额渲染为主色条纹动画 */
    running?: boolean
    /** 是否展示下方计数与百分比文案 */
    showText?: boolean
  }>(),
  { skipped: 0, cancelled: 0, running: false, showText: true },
)

const counts = computed(() => ({
  success: Math.max(0, props.success || 0),
  failed: Math.max(0, props.failed || 0),
  skipped: Math.max(0, props.skipped || 0),
  cancelled: Math.max(0, props.cancelled || 0),
}))

const total = computed(() => Math.max(0, props.total || 0))
const done = computed(() => counts.value.success + counts.value.failed + counts.value.skipped + counts.value.cancelled)
const remaining = computed(() => Math.max(0, total.value - done.value))
const percent = computed(() => (total.value > 0 ? Math.round((done.value / total.value) * 100) : 0))

/** 保留两位小数的百分比宽度（1/3 这类不产生浮点长串） */
function pct(n: number): string {
  return `${Math.round((n / total.value) * 10000) / 100}%`
}

const segments = computed(() => {
  const c = counts.value
  return [
    { key: 'success', count: c.success },
    { key: 'failed', count: c.failed },
    { key: 'skipped', count: c.skipped },
    { key: 'cancelled', count: c.cancelled },
  ]
    .filter((s) => s.count > 0)
    .map((s) => ({ ...s, width: pct(s.count) }))
})

const countText = computed(() => {
  const c = counts.value
  const parts = [`成功 ${c.success}`, `失败 ${c.failed}`]
  if (c.skipped > 0) parts.push(`跳过 ${c.skipped}`)
  if (c.cancelled > 0) parts.push(`取消 ${c.cancelled}`)
  return parts.join(' · ')
})
</script>

<template>
  <div class="tpb" :title="`${countText}（共 ${total} 个节点）`">
    <div class="tpb-track" :class="{ 'tpb-track-empty': total === 0 }">
      <div
        v-for="seg in segments"
        :key="seg.key"
        class="tpb-seg"
        :class="'tpb-seg-' + seg.key"
        :style="{ width: seg.width }"
      ></div>
      <div v-if="running && remaining > 0" class="tpb-seg tpb-seg-running" :style="{ width: pct(remaining) }"></div>
    </div>
    <div v-if="showText" class="tpb-text">
      <span v-if="total > 0" class="tpb-counts">{{ countText }}</span>
      <span v-else class="tpb-counts tpb-placeholder">暂无节点</span>
      <span class="tpb-percent">{{ total > 0 ? percent + '%' : '—' }}</span>
    </div>
  </div>
</template>

<style scoped>
.tpb {
  min-width: 140px;
}
.tpb-track {
  display: flex;
  width: 100%;
  height: 8px;
  background: oklch(88% 0.008 240);
  border-radius: 4px;
  overflow: hidden;
}
/* 对齐 progress 语义：无节点时只留空轨道 */
.tpb-track-empty {
  opacity: 0.6;
}
.tpb-seg {
  height: 100%;
  flex: 0 0 auto;
  transition: width 0.3s ease;
  /* 极小份额（如 200 台里失败 1 台）也要看得见 */
  min-width: 3px;
}
.tpb-seg-success {
  background: var(--success, oklch(55% 0.15 145));
}
.tpb-seg-failed {
  background: var(--danger, oklch(55% 0.18 28));
}
.tpb-seg-skipped {
  background: oklch(70% 0.012 250);
}
.tpb-seg-cancelled {
  background: oklch(58% 0.014 250);
}
/* 执行中剩余：主色条纹动画 */
.tpb-seg-running {
  background: repeating-linear-gradient(45deg, oklch(56% 0.16 210 / 55%) 0 4px, oklch(56% 0.16 210 / 22%) 4px 8px);
  animation: tpb-stripes 1.2s linear infinite;
}
@keyframes tpb-stripes {
  from {
    background-position: 0 0;
  }
  to {
    background-position: 16px 0;
  }
}

.tpb-text {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--muted, oklch(50% 0.018 240));
  white-space: nowrap;
}
.tpb-percent {
  font-variant-numeric: tabular-nums;
  flex: 0 0 auto;
}
</style>
