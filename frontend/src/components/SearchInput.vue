<template>
  <div class="search-input-wrap" :class="{ 'search-input-wrap--sm': size === 'small' }">
    <input
      :value="modelValue"
      type="text"
      class="form-input"
      :style="width ? { width: typeof width === 'number' ? `${width}px` : width } : undefined"
      :placeholder="placeholder"
      :data-test="dataTest"
      @input="onInput"
      @keyup.enter="onEnter"
    />
    <button v-if="modelValue" class="search-clear" title="清空搜索" @click="onClear">&times;</button>
    <SearchOutlined v-else class="search-icon" />
  </div>
</template>

<script setup lang="ts">
import { SearchOutlined } from '@ant-design/icons-vue'

/**
 * 全站统一搜索框（ux-review 搜索框一致性修复，2026-11-11）：
 * - 放大镜**统一在右**、单色（var(--muted)），有输入时换成清空按钮（统一 allow-clear 语义）
 * - 样式单一来源 src/style.css 的 .search-input-wrap / .search-icon / .search-clear，页面不再自建
 * - 组件只负责输入与事件，过滤/防抖/请求由消费方处理（emit input / search / clear）
 */
const props = withDefaults(
  defineProps<{
    modelValue?: string
    placeholder?: string
    /** 输入框宽度（数字=px；不传则沿用全局 200px，聚焦 240px 的既有动画） */
    width?: number | string
    /** 透传到内层 input 的 data-test（测试定位用） */
    dataTest?: string
    /** compact 工具条（antd size="small" 的替代）：26px 高、小字号 */
    size?: 'default' | 'small'
  }>(),
  {
    modelValue: '',
    placeholder: '搜索',
    width: undefined,
    dataTest: undefined,
    size: 'default',
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'input', value: string): void
  (e: 'search', value: string): void
  (e: 'clear'): void
}>()

function onInput(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  emit('update:modelValue', value)
  emit('input', value)
}

/** 回车即搜（对齐 antd a-input-search 的 @search 语义） */
function onEnter(): void {
  emit('search', props.modelValue)
}

function onClear(): void {
  emit('update:modelValue', '')
  emit('input', '')
  emit('clear')
}
</script>
