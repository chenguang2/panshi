<template>
  <div v-if="buckets.length" class="bucket-strip">
    <span class="strip-caption">
      耗时区间分布
      <a-tooltip :title="hintText">
        <InfoCircleOutlined class="strip-info" />
      </a-tooltip>
    </span>
    <span class="chip-row">
      <a-tooltip v-for="b in buckets" :key="b.label" :title="b.tip">
        <span class="bucket-chip" :class="{ dimmed: b.dimmed }">
          <span class="dot" :style="{ background: b.color }" />
          <span class="bucket-label">{{ b.label }}</span>
          <span class="bucket-pct">{{ b.pctText }}%</span>
        </span>
      </a-tooltip>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { InfoCircleOutlined } from '@ant-design/icons-vue'
import type { FastRatioBucketStats } from '@/api/metrics'

const props = defineProps<{
  /** 各桶区间占比/计数（metrics-fast-ratio-card D9）；null = 窗口无请求 → 整块不渲染（D12） */
  stats: FastRatioBucketStats | null
}>()

/** 边界标签：自然去尾零（10 → '10'，0.5 → '0.5'），与阈值下拉 `${b}ms` 同款（文案表 #12） */
function fmtBound(b: number): string {
  return `${b}`
}

/** 色点按桶序绿→红插值，标识区间次序（D10：占比饱和跨数量级，不用宽度/色阶编码占比） */
function dotColor(i: number, n: number): string {
  const stops: Array<[number, number, number]> = [
    [82, 196, 26], // #52c41a
    [250, 173, 20], // #faad14
    [245, 34, 45], // #f5222d
  ]
  const t = n <= 1 ? 0 : i / (n - 1)
  const seg = t < 0.5 ? 0 : 1
  const local = t < 0.5 ? t * 2 : (t - 0.5) * 2
  const from = stops[seg]
  const to = stops[seg + 1]
  const c = from.map((v, k) => Math.round(v + (to[k] - v) * local))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

interface BucketChip {
  label: string
  pctText: string
  tip: string
  color: string
  dimmed: boolean
}

/** 全 N+1 桶无条件渲染（0.00% 桶置灰）——行数稳定不跳动（AGENTS #54 行高一致精神，D10） */
const buckets = computed<BucketChip[]>(() => {
  const s = props.stats
  if (!s || !s.bounds || s.bounds.length === 0) return []
  const n = s.bounds.length + 1
  const last = s.bounds[s.bounds.length - 1]
  const out: BucketChip[] = []
  for (let i = 0; i < n; i++) {
    const label =
      i === 0
        ? `≤${fmtBound(s.bounds[0])}ms`
        : i === n - 1
          ? `>${fmtBound(last)}ms`
          : `${fmtBound(s.bounds[i - 1])}–${fmtBound(s.bounds[i])}ms`
    const pct = s.ratios[i] ?? 0
    const count = s.counts[i] ?? 0
    out.push({
      label,
      pctText: pct.toFixed(2),
      tip: `${label}：${count} 次（${pct.toFixed(2)}%）`,
      color: dotColor(i, n),
      dimmed: count === 0,
    })
  }
  return out
})

/** 口径提示（文案表 #11）：左开右闭 + 以首两边界举例 + 窗口总量 */
const hintText = computed(() => {
  const s = props.stats
  const sample =
    s && s.bounds.length >= 2
      ? `如 ${fmtBound(s.bounds[0])}–${fmtBound(s.bounds[1])}ms 表示 ${fmtBound(s.bounds[0])} < 耗时 ≤ ${fmtBound(s.bounds[1])} ms`
      : '如 10–20ms 表示 10 < 耗时 ≤ 20 ms'
  return `按采集桶边界精确统计，区间为左开右闭（${sample}）；窗口内共 ${s?.total ?? 0} 次请求`
})
</script>

<style scoped>
.bucket-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.strip-caption {
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.strip-info {
  font-size: 11px;
  color: var(--muted);
  cursor: help;
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  min-width: 0;
}

.bucket-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--fg);
  white-space: nowrap;
}

.bucket-chip.dimmed {
  opacity: 0.45;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: none;
}

.bucket-label {
  color: var(--muted);
}

.bucket-pct {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
}
</style>
