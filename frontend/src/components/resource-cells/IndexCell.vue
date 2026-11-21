<template>
  <!-- 表格序号列（#59 表格解剖）：后端分页跨页连续 = (page-1)*pageSize + 行内 0 基序号 + 1 -->
  <span class="c-idx">{{ label }}</span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/**
 * 纯展示：只算序号，不读分页状态来源。
 *
 * `page` / `pageSize` 缺省值与 `rowIndexLabel`（ClusterNodes 等）及 `ListPager` 一致
 * （1 / 20），故未加载时也不会出现 `-19` 之类的负号。
 */
const props = withDefaults(
  defineProps<{
    page?: number
    pageSize?: number
    /** 行在本页的 0 基下标（a-table 的 `index`） */
    index: number
  }>(),
  { page: 1, pageSize: 20 },
)

const label = computed(() => ((props.page || 1) - 1) * (props.pageSize || 20) + props.index + 1)
</script>
