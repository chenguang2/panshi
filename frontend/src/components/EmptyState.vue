<template>
  <div class="empty5">
    <div class="e-icon"><StrokeIcon :name="icon" :size="20" /></div>
    <div class="e-title">{{ title }}</div>
    <div v-if="description" class="e-sub">{{ description }}</div>
    <div v-if="hasActions" class="e-actions"><slot /></div>
  </div>
</template>

<script setup lang="ts">
import { computed, useSlots } from 'vue'
import StrokeIcon, { type StrokeIconName } from './StrokeIcon.vue'

/**
 * 全站空态单点（central-management-parity 批次 C）。
 *
 * 解剖 = 设计原语 `.empty5`（docs/ui/Live-Artifact-5/proposal-c/theme.css:2345-2349）：
 * 52px 虚线圆图标 → 13px/600 标题 → 12px muted 说明 → 动作区（gap 8）。
 * **数值不在本组件重复声明**——`src/style.css` 的 `.empty5` 是该原语的唯一实现
 * （独立列表页 NodeList/UpstreamList/RouteList 已在消费），此处只补两处组件级差异：
 * ① 占满空态容器（卡片网格 / 表格占位格）；② 图标颜色取 `var(--muted)`。
 * 设计页暂不画空态（各页展示为有数据态），新增页面直接引本组件。
 */
withDefaults(
  defineProps<{
    /** 标题（必填）：说明「这里没有什么」 */
    title: string
    /** 说明：一句话讲清为什么为空 / 下一步做什么 */
    description?: string
    /** 图标名（StrokeIcon 既有图标名，默认 inbox） */
    icon?: StrokeIconName
  }>(),
  { icon: 'inbox' },
)

const slots = useSlots()

/**
 * 动作区「有内容」判定：过滤注释/空白文本 vnode（两者 type 均为 symbol）。
 * 仅凭 `$slots.default` 存在性判断会在「插槽里只有注释」时渲染出空的动作容器，
 * 多出 8px gap 的空白（#55 同源坑：模板层的条件必须按实际渲染内容判）。
 */
const hasActions = computed(() => (slots.default?.() ?? []).some((vnode) => typeof vnode.type !== 'symbol'))
</script>

<style scoped>
/* 空态原语数值单一来源 = src/style.css 的 .empty5/.e-*（见上方注释），这里只做组件级补丁 */
.empty5 {
  width: 100%;
}

.empty5 .e-icon {
  color: var(--muted);
}
</style>
