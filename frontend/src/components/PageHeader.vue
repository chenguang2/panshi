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
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  /* 设计稿基准（proposal-c 九页统一 20px；mockup-parity-standard 用户裁决全站单点） */
  margin-bottom: 20px;
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
  /* 设计稿基准 21px/600（proposal-c；mockup-parity-standard 用户裁决全站单点） */
  font-size: 21px;
  font-weight: 600;
  color: var(--fg);
  margin: 0;
  /* 设计稿 line-height 1.5（21 × 1.5 = 31.5px；r5-④-4.5 实测实现原为 1.3 = 27.3px） */
  line-height: 1.5;
}

.page-header-info p {
  /* 设计稿描述上距 2px（.page-header p；r5-④-4.5 实测实现原为 4px） */
  margin: 2px 0 0;
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
