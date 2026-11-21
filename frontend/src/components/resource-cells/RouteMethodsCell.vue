<template>
  <!-- 请求方法列（Edge 侧是逗号分隔字符串）：大写化 → 前 N 枚胶囊，title 给全量。
       `.method-cell` / `.m-tag` 都是既有类名（全局 style.css + 面板 `.max-panel .dbody .method-cell`
       布局），本组件不自带布局样式，接线时观感与现实现逐像素一致。
       空值时输出 `.dim` 的「—」（与 ClusterRoutes 现实现同形；该类在全站本就无样式定义）。 -->
  <span class="method-cell" :title="titleText">
    <span v-for="m in preview" :key="m" class="m-tag" :class="m">{{ m }}</span>
    <span v-if="methodList.length === 0" class="dim">—</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 逗号分隔的方法串（如 `get,post`） */
    methods?: string
    /** 单行最多展示几枚（面板 2 / 页面 3） */
    maxVisible?: number
  }>(),
  { methods: '', maxVisible: 2 },
)

/** 归一：切分 → 去空白 → 大写 → 去空项（逻辑照抄 ClusterRoutes.methodList） */
const methodList = computed(() =>
  (props.methods || '')
    .split(',')
    .map((m) => m.trim().toUpperCase())
    .filter(Boolean),
)

const preview = computed(() => methodList.value.slice(0, props.maxVisible))

/** 全量提示（`A、B、C`，与 methodTitle 一致；空串时 title 为空） */
const titleText = computed(() => methodList.value.join('、'))
</script>
