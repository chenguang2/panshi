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

.badge-online { color: var(--p-color-success); }
.badge-offline { color: var(--p-color-danger); }
.badge-warning { color: var(--p-color-warning); }
.badge-info { color: var(--p-color-info); }

.status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.online { background: var(--p-color-success); box-shadow: 0 0 6px color-mix(in srgb, var(--p-color-success) 50%, transparent); }
.status-dot.offline { background: var(--p-color-danger); box-shadow: 0 0 6px color-mix(in srgb, var(--p-color-danger) 50%, transparent); }
.status-dot.warning { background: var(--p-color-warning); box-shadow: 0 0 6px color-mix(in srgb, var(--p-color-warning) 50%, transparent); }
.status-dot.info { background: var(--p-color-info); box-shadow: 0 0 6px color-mix(in srgb, var(--p-color-info) 50%, transparent); }
</style>
