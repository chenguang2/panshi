<template>
  <a-drawer :open="visible" :title="`查看插件组 - ${config?.name}`" width="600" @update:open="$emit('update:visible', $event)" @close="$emit('update:visible', false)">
    <div v-if="config">
      <a-descriptions :column="1" bordered :label-style="{ width: '140px' }">
        <a-descriptions-item label="名称">{{ config.name }}</a-descriptions-item>
        <a-descriptions-item label="描述">{{ config.description || '-' }}</a-descriptions-item>
        <a-descriptions-item label="状态">
          <a-tag v-if="config.current_version" color="green">已发布</a-tag>
          <a-tag v-else color="orange">未发布</a-tag>
        </a-descriptions-item>
        <a-descriptions-item label="版本" v-if="config.current_version">v{{ config.current_version }}</a-descriptions-item>
      </a-descriptions>
      <a-divider>插件配置</a-divider>
      <pre class="config-preview">{{ JSON.stringify(config.plugins, null, 2) }}</pre>
    </div>
  </a-drawer>
</template>

<script setup lang="ts">
defineProps<{
  visible: boolean
  config: any | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()
</script>

<style scoped>
.config-preview {
  font-size: 12px;
  white-space: pre-wrap;
  background: var(--bg);
  padding: 12px;
  border-radius: var(--radius-sm);
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid var(--border);
  font-family: var(--font-mono);
}
</style>
