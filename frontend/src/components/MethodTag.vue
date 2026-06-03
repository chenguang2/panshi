<template>
  <span class="method-tag" :class="method">{{ method }}</span>
</template>

<script setup lang="ts">
defineProps<{
  method: string
}>()
</script>

<style scoped>
.method-tag {
  display: inline-block;
  padding: 0 5px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 600;
  font-family: var(--font-mono, var(--p-mono));
  background: var(--p-bg-page);
  border: 1px solid var(--p-border-default);
}

.method-tag.GET { border-color: color-mix(in srgb, var(--p-color-success) 30%, transparent); color: var(--p-color-success); }
.method-tag.POST { border-color: color-mix(in srgb, var(--p-color-primary) 30%, transparent); color: var(--p-color-primary); }
.method-tag.PUT { border-color: color-mix(in srgb, var(--p-color-warning) 30%, transparent); color: var(--p-color-warning); }
.method-tag.DELETE { border-color: color-mix(in srgb, var(--p-color-danger) 30%, transparent); color: var(--p-color-danger); }
.method-tag.PATCH { border-color: color-mix(in srgb, var(--p-color-info) 30%, transparent); color: var(--p-color-info); }
</style>
