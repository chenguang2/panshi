<script setup lang="ts">
import { computed } from 'vue'

/**
 * 节点任务状态标签（node-task-ux-optimization D6）
 *
 * 全站唯一状态呈现实现：列表行、任务详情页头、节点结果行都渲染本组件，
 * 禁止在别处再写一份状态色映射（色值语义一改就会漂移）。
 *
 * 色相刻意拉开：部分成功走琥珀（~85°），失败走饱和红（~28°）并加细红边，
 * 色相 + 形状双重区分，12px 下也能一眼分开。
 */
const KNOWN_STATUSES = ['pending', 'running', 'success', 'partial', 'failed', 'cancelled', 'skipped'] as const
type KnownStatus = (typeof KNOWN_STATUSES)[number]
type TaskStatusState = KnownStatus | 'cancelling' | 'unknown'

function isKnownStatus(s: string): s is KnownStatus {
  return (KNOWN_STATUSES as readonly string[]).includes(s)
}

const props = withDefaults(
  defineProps<{
    /** 后端任务/子项状态值 */
    status: string
    /** 已请求取消（后端 cancel_requested）：running 自动呈现「取消中」 */
    cancelRequested?: boolean
    /** 是否展示图标（纯表格窄列可关掉） */
    showIcon?: boolean
  }>(),
  { cancelRequested: false, showIcon: true },
)

const LABELS: Record<TaskStatusState, string> = {
  pending: '待执行',
  running: '执行中',
  cancelling: '取消中',
  success: '成功',
  partial: '部分成功',
  failed: '失败',
  cancelled: '已取消',
  skipped: '跳过',
  unknown: '',
}

/** 图标用字形（执行中/取消中使用 CSS 转圈，不引入 a-spin 大组件） */
const GLYPHS: Record<Exclude<TaskStatusState, 'running' | 'cancelling'>, string> = {
  pending: '○',
  success: '✓',
  partial: '⚠',
  failed: '✕',
  cancelled: '⊘',
  skipped: '⊘',
  unknown: '○',
}

const state = computed<TaskStatusState>(() => {
  if (props.cancelRequested && props.status === 'running') return 'cancelling'
  return isKnownStatus(props.status) ? props.status : 'unknown'
})

const label = computed(() => (state.value === 'unknown' ? props.status : LABELS[state.value]))
const isSpinner = computed(() => state.value === 'running' || state.value === 'cancelling')
const glyph = computed(() => (isSpinner.value ? '' : GLYPHS[state.value as keyof typeof GLYPHS]))
</script>

<template>
  <span class="status-tag" :class="'status-' + state" :data-status="state">
    <span v-if="showIcon && isSpinner" class="status-spinner" aria-hidden="true"></span>
    <span v-else-if="showIcon" class="status-icon" aria-hidden="true">{{ glyph }}</span>
    <span class="status-label">{{ label }}</span>
  </span>
</template>

<style scoped>
.status-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  border-radius: 10px;
  /* 统一透明边框：失败态的细红边不至于把行高撑得比别人高 */
  border: 1px solid transparent;
  font-size: 12px;
  line-height: 18px;
  white-space: nowrap;
  vertical-align: middle;
}

.status-icon {
  font-size: 11px;
  line-height: 1;
}

/* 执行中/取消中：CSS 转圈（1.5px 描边 + 单边透明） */
.status-spinner {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid currentColor;
  border-right-color: transparent;
  animation: task-status-spin 0.8s linear infinite;
  flex: 0 0 auto;
}
@keyframes task-status-spin {
  to {
    transform: rotate(360deg);
  }
}

/* ── 中性态：待执行 / 已取消 / 跳过 / 未知 ── */
.status-tag.status-pending,
.status-tag.status-cancelled,
.status-tag.status-skipped,
.status-tag.status-unknown {
  color: var(--muted, oklch(50% 0.018 240));
  background: oklch(50% 0.018 240 / 8%);
}

/* ── 执行中：主色 ── */
.status-tag.status-running {
  color: var(--accent, oklch(56% 0.16 210));
  background: var(--accent-bg, oklch(56% 0.16 210 / 10%));
}

/* ── 取消中：琥珀（与失败红拉开） ── */
.status-tag.status-cancelling {
  color: oklch(48% 0.13 70);
  background: oklch(75% 0.15 85 / 20%);
}

/* ── 成功：绿 ── */
.status-tag.status-success {
  color: oklch(45% 0.13 148);
  background: oklch(70% 0.15 148 / 16%);
}

/* ── 部分成功：琥珀（无描边） ── */
.status-tag.status-partial {
  color: oklch(47% 0.13 72);
  background: oklch(75% 0.15 85 / 22%);
  font-weight: 500;
}

/* ── 失败：饱和红 + 细红边（形状差异，与部分成功区分） ── */
.status-tag.status-failed {
  color: oklch(47% 0.2 25);
  background: oklch(55% 0.18 28 / 12%);
  border-color: oklch(55% 0.18 28 / 55%);
  font-weight: 500;
}
</style>
