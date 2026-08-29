<script setup lang="ts">
import { computed } from 'vue'
import { formatPublishDateTime } from '@/utils/format'

const props = defineProps<{
  /** 已发布版本号（null/undefined 视为未发布） */
  version?: number | null
  /** 最近发布时间（ISO 字符串） */
  publishedAt?: string | null
}>()

const published = computed(() => props.version !== null && props.version !== undefined)
const dateText = computed(() => formatPublishDateTime(props.publishedAt ?? null))
</script>

<template>
  <span v-if="published && publishedAt" class="publish-status">
    <span class="ps-tag ps-published">v{{ version }}</span>
    <span class="ps-date" :title="`发布时间: ${dateText}`">{{ dateText }}</span>
  </span>
  <span v-else-if="published" class="ps-tag ps-published">v{{ version }} · 未同步</span>
  <span v-else class="ps-tag ps-unpublished">未发布</span>
</template>

<style scoped>
.publish-status {
  display: inline-flex;
  align-items: baseline;
}
.ps-tag {
  display: inline-block;
  font-size: 12px;
  line-height: 18px;
  padding: 0 6px;
  border-radius: 3px;
  font-weight: 500;
}
.ps-published {
  border: 1px solid #52c41a;
  color: #52c41a;
  background: #f6ffed;
}
.ps-unpublished {
  border: 1px solid #d9d9d9;
  color: #999;
  background: #fafafa;
}
.ps-date {
  font-size: 11px;
  color: #666;
  margin-left: 4px;
  cursor: help;
  white-space: nowrap;
}
</style>