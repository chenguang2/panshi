<template>
  <div class="page-header">
    <div class="page-header-info">
      <div class="page-header-title-row">
        <h1>{{ title }}</h1>
        <slot name="stats" />
      </div>
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

/* 标题行：h1 与 #stats 徽标同处一行（list-pages-console-restyle）；无 slot 内容时只有 h1，
   零额外视觉影响。gap 14px 对应 mockup 的 .ph-inline { margin-left: 14px }。 */
.page-header-title-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}

.page-header-info h1 {
  font-size: 22px;
  font-weight: 700;
  color: var(--fg);
  margin: 0;
  line-height: 1.3;
}

.page-header-info p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.5;
}

.page-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
</style>
