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
  font-family: var(--font-mono, var(--font-mono));
  background: var(--bg);
  border: 1px solid var(--border);
}

.method-tag.GET { border-color: color-mix(in srgb, var(--success) 30%, transparent); color: var(--success); }
.method-tag.POST { border-color: color-mix(in srgb, var(--accent) 30%, transparent); color: var(--accent); }
.method-tag.PUT { border-color: color-mix(in srgb, var(--warning) 30%, transparent); color: var(--warning); }
.method-tag.DELETE { border-color: color-mix(in srgb, var(--danger) 30%, transparent); color: var(--danger); }
.method-tag.PATCH { border-color: color-mix(in srgb, var(--info) 30%, transparent); color: var(--info); }
</style>
