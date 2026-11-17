<template>
  <span class="badge-status" :class="'badge-' + status">
    <span class="status-dot" :class="status"></span>
    <span class="status-text">{{ text }}</span>
  </span>
</template>

<script setup lang="ts">
defineProps<{
  text: string
  status: 'online' | 'offline' | 'warning' | 'info' | 'neutral'
}>()
</script>

<style scoped>
/* 胶囊解剖（list-pages-console-restyle contract §6；取值照抄 mockup .pill）：
   20px 高、999px 圆角、11px/600、0 8px 内距、5px 圆点。类名与 props 契约不变，
   17 个消费方零改动（仅观感变化）。 */
.badge-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 20px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.01em;
  white-space: nowrap;
}

.badge-online {
  color: var(--success);
  background: var(--success-bg);
}
.badge-offline {
  color: var(--danger);
  background: var(--danger-bg);
}
.badge-warning {
  color: var(--warning);
  background: oklch(65% 0.15 85 / 14%);
}
.badge-info {
  color: var(--info);
  background: oklch(55% 0.12 240 / 12%);
}
/* 中性灰：未知/未检测等「非健康也非故障」的第三态（概览页节点未检测，overview-page-ux D2/D5） */
.badge-neutral {
  color: var(--muted);
  background: oklch(50% 0.018 240 / 8%);
}

/* 状态点：mockup .pill .dot 为 6px 实心圆、无发光；胶囊底色已承担层次，故去掉旧 glow */
.status-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.online {
  background: var(--success);
}
.status-dot.offline {
  background: var(--danger);
}
.status-dot.warning {
  background: var(--warning);
}
.status-dot.info {
  background: var(--info);
}
.status-dot.neutral {
  background: oklch(50% 0.018 240 / 55%);
}
</style>
