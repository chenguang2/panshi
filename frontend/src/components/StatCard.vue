<template>
  <component :is="to ? 'router-link' : 'div'" :to="to" class="stat-card" :class="accent ? 'accent-' + accent : ''">
    <div class="stat-card-inner">
      <div class="stat-card-icon-row">
        <slot name="icon" />
      </div>
      <div class="stat-card-value">{{ value }}</div>
      <div class="stat-card-label">{{ label }}</div>
      <div v-if="subtitle" class="stat-card-sub">{{ subtitle }}</div>
    </div>
  </component>
</template>

<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

defineProps<{
  value: string | number
  label: string
  subtitle?: string
  accent?: string
  to?: RouteLocationRaw
}>()
</script>

<style scoped>
.stat-card {
  position: relative;
  overflow: hidden;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  transition: transform 0.25s, box-shadow 0.25s;
}

.stat-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-lg);
  border-color: var(--accent);
}

.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}

.stat-card.accent-cluster::before { background: var(--accent); }
.stat-card.accent-route::before { background: var(--success); }
.stat-card.accent-upstream::before { background: var(--warning); }
.stat-card.accent-node::before { background: var(--info); }
.stat-card.accent-user::before { background: var(--danger); }
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
  font-family: var(--font-mono, var(--font-mono));
  font-size: 28px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--fg);
  line-height: 1.1;
}

.stat-card-label {
  font-size: 12px;
  color: var(--muted);
  font-weight: 500;
  letter-spacing: 0.02em;
}

.stat-card-sub {
  font-size: 10px;
  color: var(--muted);
  opacity: 0.6;
  margin-top: -2px;
}
</style>
