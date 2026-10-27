<template>
  <div v-if="visible" class="ck-source-banner" role="alert">
    <span class="banner-mark">⚠</span>
    <span class="banner-text">
      指标数据源不可用：无法连接 ClickHouse<template v-if="target">（{{ target }}）</template
      >，图表显示为空。配置修复后自动恢复。
    </span>
    <router-link to="/clickhouse-config" class="banner-link">查看 ClickHouse 配置</router-link>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

// 数据源不可用横幅（clickhouse-config-ux-review-fixes 决策 5A）：
// prop 驱动——两页各自传自家 store 的 sourceOk（总览页 metricsDashboard store、查询页 metrics store）；
// 仅明确 false 时出现，恢复后随各自刷新周期自动消失
const props = defineProps<{
  sourceOk: boolean | null
  target?: string
}>()

const visible = computed(() => props.sourceOk === false)
</script>

<style scoped>
.ck-source-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  background: oklch(85% 0.12 85 / 25%);
  border: 1px solid oklch(70% 0.14 80 / 60%);
  color: oklch(45% 0.12 70);
}
.banner-mark {
  flex-shrink: 0;
}
.banner-text {
  flex: 1;
}
.banner-link {
  flex-shrink: 0;
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
}
.banner-link:hover {
  text-decoration: underline;
}
</style>
