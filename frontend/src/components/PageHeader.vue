<template>
  <div class="page-header">
    <div class="page-header-info">
      <h1>{{ title }}</h1>
      <p v-if="description">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="page-header-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}

.page-header-info h1 {
  font-size: 22px;
  font-weight: 700;
  color: var(--p-text-primary);
  margin: 0;
  line-height: 1.3;
}

.page-header-info p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--p-text-tertiary);
  line-height: 1.5;
}

.page-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
</style>
