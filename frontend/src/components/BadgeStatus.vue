<template>
  <span class="badge-status" :class="'badge-' + status">
    <span class="status-dot" :class="status"></span>
    <span class="status-text">{{ text }}</span>
  </span>
</template>

<script setup lang="ts">
defineProps<{
  text: string
  status: 'online' | 'offline' | 'warning' | 'info'
}>()
</script>

<style scoped>
.badge-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
}

.badge-online { color: var(--success); }
.badge-offline { color: var(--danger); }
.badge-warning { color: var(--warning); }
.badge-info { color: var(--info); }

.status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.online { background: var(--success); box-shadow: 0 0 6px color-mix(in srgb, var(--success) 50%, transparent); }
.status-dot.offline { background: var(--danger); box-shadow: 0 0 6px color-mix(in srgb, var(--danger) 50%, transparent); }
.status-dot.warning { background: var(--warning); box-shadow: 0 0 6px color-mix(in srgb, var(--warning) 50%, transparent); }
.status-dot.info { background: var(--info); box-shadow: 0 0 6px color-mix(in srgb, var(--info) 50%, transparent); }
</style>
