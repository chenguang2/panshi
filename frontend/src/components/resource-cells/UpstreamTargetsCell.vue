<template>
  <!-- 面板（compact）：前 2 个 + `+N`，类名与解剖照抄 ClusterUpstreams 的 .target-list / .target-tag 族
       （面板侧这些样式是 scoped 的，故在本组件内同值重声明一遍，接线时观感不变）。 -->
  <div v-if="variant === 'compact'" class="targets-cell">
    <div v-if="targets.length > 0" class="target-list">
      <span v-for="t in compactPreview" :key="t.target" class="target-tag">
        {{ t.target }}
        <span v-if="t.weight !== undefined" class="weight">({{ t.weight }})</span>
      </span>
      <span v-if="targets.length > COMPACT_LIMIT" class="target-more">+{{ targets.length - COMPACT_LIMIT }}</span>
    </div>
    <span v-else class="target-empty">—</span>
  </div>

  <!-- 页面（detailed）：逐个 chip（全局 .tg-chip 族）+ 末尾健康摘要。
       权重条 / 占比（utils/upstreamTargets）本批不复制，B4 接线时再接。 -->
  <div v-else class="targets-cell is-detailed">
    <div v-if="targets.length > 0" class="tg-list">
      <div class="tg-row">
        <span v-for="t in targets" :key="t.target" class="tg-chip">
          {{ t.target }}
          <span v-if="t.weight !== undefined" class="tg-w">{{ t.weight }}</span>
        </span>
      </div>
      <span v-if="health" class="tg-sum" :title="healthTitle">
        <b>{{ targets.length }}</b> 目标 ·
        <template v-if="health.allHealthy"><b>全部健康</b></template>
        <span v-else class="tg-sum-pending"
          ><b>{{ health.pendingCount }}</b> 项待验证</span
        >
      </span>
    </div>
    <span v-else class="target-empty">—</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/** compact 变体固定折叠阈值（与 ClusterUpstreams 现实现一致） */
const COMPACT_LIMIT = 2

const props = withDefaults(
  defineProps<{
    /** 目标列表（Edge 侧 `UpstreamTarget[]` 的子集形状，避免 import 业务类型） */
    targets?: { target: string; weight?: number }[]
    /** compact = 面板（前 2 + N）/ detailed = 页面（逐个 chip + 健康摘要） */
    variant?: 'compact' | 'detailed'
    /** 发布态健康近似（`utils/upstreamTargets.summarizeTargetHealth` 的结果）；缺省不渲染摘要 */
    health?: { allHealthy: boolean; pendingCount: number }
    /** 摘要行的悬停解释（B4 接页面时传 `targetDot(record).title`）；缺省无 title */
    healthTitle?: string
  }>(),
  { targets: () => [], variant: 'compact', health: undefined, healthTitle: undefined },
)

const compactPreview = computed(() => props.targets.slice(0, COMPACT_LIMIT))
</script>

<style scoped>
/* ── 目标节点列（compact，与 ClusterUpstreams.vue 4.2 同值） ── */
.target-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.target-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  background: var(--bg);
  border: 1px solid var(--border);
  font-family: var(--font-mono);
}
.target-tag .weight {
  color: var(--muted);
  font-size: 11px;
}
.target-more {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  color: var(--muted);
  background: var(--bg);
  border: 1px solid var(--border);
}
.target-empty {
  color: var(--muted);
  font-size: 12px;
}
</style>
