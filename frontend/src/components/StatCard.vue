<template>
  <div class="stat-card" :class="accent ? 'accent-' + accent : ''">
    <div class="stat-card-inner">
      <div class="stat-card-icon-row">
        <slot name="icon" />
      </div>
      <div class="stat-card-value">{{ value }}</div>
      <div class="stat-card-label">{{ label }}</div>
      <div v-if="subtitle" class="stat-card-sub">{{ subtitle }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  value: string | number
  label: string
  subtitle?: string
  accent?: string
}>()
</script>

<style scoped>
.stat-card {
  position: relative;
  overflow: hidden;
  background: var(--p-bg-glass);
  border: 1px solid var(--p-glass-border);
  border-radius: var(--p-radius-lg);
  box-shadow: var(--p-shadow-glass);
  transition: transform 0.25s, box-shadow 0.25s;
}

.stat-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--p-shadow-lg);
  border-color: var(--p-color-primary);
}

.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  border-radius: var(--p-radius-lg) var(--p-radius-lg) 0 0;
}

.stat-card.accent-cluster::before { background: var(--p-color-primary); }
.stat-card.accent-route::before { background: var(--p-color-success); }
.stat-card.accent-upstream::before { background: var(--p-color-warning); }
.stat-card.accent-node::before { background: var(--p-color-info); }
.stat-card.accent-user::before { background: var(--p-color-danger); }
.stat-card.accent-plugin::before { background: #7c3aed; }
.stat-card.accent-global::before { background: #52c41a; }

.stat-card-inner {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 20px 24px 24px;
}

.stat-card-icon-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.stat-card-value {
  font-family: var(--font-mono, var(--p-mono));
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--p-text-primary);
  line-height: 1.1;
}

.stat-card-label {
  font-size: 12px;
  color: var(--p-text-tertiary);
  font-weight: 500;
  letter-spacing: 0.02em;
}

.stat-card-sub {
  font-size: 10px;
  color: var(--p-text-tertiary);
  opacity: 0.6;
  margin-top: -2px;
}
</style>
