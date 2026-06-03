<template>
  <span class="filter-chip" :class="{ active }">
    {{ label }}
  </span>
</template>

<script setup lang="ts">
defineProps<{
  label: string
  active?: boolean
}>()
</script>

<style scoped>
.filter-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 14px;
  font-size: 12px;
  cursor: pointer;
  border: 1px solid var(--p-border-default);
  background: var(--p-bg-container);
  color: var(--p-text-tertiary);
  user-select: none;
  transition: all 0.15s;
}

.filter-chip:hover {
  border-color: var(--p-color-primary);
  color: var(--p-color-primary);
}

.filter-chip.active {
  background: color-mix(in srgb, var(--p-color-primary) 10%, transparent);
  border-color: var(--p-color-primary);
  color: var(--p-color-primary);
}
</style>
