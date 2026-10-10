<script setup lang="ts">
import { computed } from 'vue'
import { formatPublishDateTime } from '@/utils/format'

const props = withDefaults(
  defineProps<{
    /** 已发布版本号（null/undefined 视为未发布） */
    version?: number | null
    /** 最近发布时间（ISO 字符串） */
    publishedAt?: string | null
    /** 待发布（后端 pending_publish 推导，消费方显式传入）；undefined = 该资源未接入四态 */
    pending?: boolean
    /** 上次发布状态（'partial' = 发布未完全生效） */
    lastPublishStatus?: string | null
  }>(),
  // 关键：Boolean 类型 prop 缺省时 Vue 会强转为 false（boolean casting），
  // 显式 default: undefined 关闭该行为，保住「未传 = undefined」的兼容判定
  { pending: undefined },
)

const published = computed(() => props.version !== null && props.version !== undefined)
// 四态感知：任一新 props 显式传入即启用；两新 props 均未传（或 lastPublishStatus 为 null）时
// 保持既有三分支，未接入的资源类型零变化（「vX · 未同步」分支仅为这些资源保留）
const pendingAware = computed(() => props.pending !== undefined || props.lastPublishStatus != null)
const isPartial = computed(() => props.lastPublishStatus === 'partial')
const dateText = computed(() => formatPublishDateTime(props.publishedAt ?? null))
</script>

<template>
  <span v-if="!published" class="ps-tag ps-unpublished">未发布</span>
  <span v-else-if="pendingAware && isPartial" class="ps-tag ps-partial" title="上次发布存在未生效节点，请重新发布"
    >⚠ v{{ version }} · 发布未完全生效</span
  >
  <span v-else-if="pendingAware && pending" class="ps-tag ps-pending" title="配置已修改，发布后生效">待发布</span>
  <span v-else-if="pendingAware" class="publish-status">
    <span class="ps-tag ps-published">v{{ version }}</span>
    <span v-if="publishedAt" class="ps-date" :title="`发布时间: ${dateText}`">{{ dateText }}</span>
  </span>
  <span v-else-if="publishedAt" class="publish-status">
    <span class="ps-tag ps-published">v{{ version }}</span>
    <span class="ps-date" :title="`发布时间: ${dateText}`">{{ dateText }}</span>
  </span>
  <span v-else class="ps-tag ps-published">v{{ version }} · 未同步</span>
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
.ps-pending {
  border: 1px solid #fa8c16;
  color: #fa8c16;
  background: #fff7e6;
}
.ps-partial {
  border: 1px solid #fa541c;
  color: #fa541c;
  background: #fff2e8;
}
.ps-date {
  font-size: 11px;
  color: #666;
  margin-left: 4px;
  cursor: help;
  white-space: nowrap;
}
</style>
