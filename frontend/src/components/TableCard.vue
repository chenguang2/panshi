<template>
  <div class="table-card">
    <div v-if="$slots.header" class="table-card-header">
      <slot name="header" />
    </div>
    <div class="table-card-body">
      <a-table v-bind="$attrs">
        <template #bodyCell="args">
          <slot name="bodyCell" v-bind="args" />
        </template>
        <template #headerCell="args">
          <slot name="headerCell" v-bind="args" />
        </template>
        <template #customFilterDropdown="args">
          <slot name="customFilterDropdown" v-bind="args" />
        </template>
      </a-table>
    </div>
    <div v-if="$slots.footer" class="table-card-footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({ inheritAttrs: false })
</script>

<style scoped>
.table-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
}

.table-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
  font-weight: 600;
  color: var(--fg);
}

.table-card-body {
  position: relative;
}

.table-card-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 16px;
  border-top: 1px solid var(--border);
}

:deep(.ant-table) {
  background: transparent !important;
}

:deep(.ant-table-thead > tr > th) {
  background: oklch(56% 0.16 210 / 10%) !important;
  border-bottom: 1px solid var(--border) !important;
  color: var(--muted) !important;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 8px 14px !important;
}

:deep(.ant-table-thead > tr > th::before) {
  display: none !important;
}

:deep(.ant-table-tbody > tr > td) {
  padding: 10px 14px !important;
  border-bottom: 1px solid var(--border) !important;
  color: var(--muted);
  font-size: 13px;
}

:deep(.ant-table-tbody > tr:last-child > td) {
  border-bottom: none !important;
}

:deep(.ant-table-tbody > tr:hover > td) {
  background: var(--bg) !important;
}
</style>
