<script setup lang="ts">
interface ColumnDef {
  key: string
  title: string
}

const props = defineProps<{
  allColumns: ColumnDef[]
  allActions: ColumnDef[]
  /** 开启「重置列宽」入口（cluster-tab-column-personalization）：仅接入了列宽个性化的表格开启 */
  widthResettable?: boolean
}>()

defineEmits<{
  (e: 'reset-widths'): void
}>()

const open = defineModel<boolean>('open', { required: true })
const columns = defineModel<string[]>('columns', { required: true })
const actions = defineModel<string[]>('actions', { required: true })
const searchVisible = defineModel<boolean>('search', { required: true })
</script>

<template>
  <a-popover v-model:open="open" trigger="click" placement="bottomRight">
    <template #title>选择显示列</template>
    <template #content>
      <div style="min-width: 400px">
        <div style="font-weight: 500; margin-bottom: 8px">列选择</div>
        <a-checkbox-group v-model:value="columns">
          <div style="display: flex; flex-wrap: wrap; gap: 8px">
            <div v-for="col in allColumns" :key="col.key" style="margin-bottom: 4px">
              <a-checkbox :value="col.key">{{ col.title }}</a-checkbox>
            </div>
          </div>
        </a-checkbox-group>
        <a-divider style="margin: 12px 0" />
        <div style="font-weight: 500; margin-bottom: 8px">操作按钮</div>
        <a-checkbox-group v-model:value="actions">
          <div style="display: flex; flex-wrap: wrap; gap: 8px">
            <div v-for="btn in allActions" :key="btn.key" style="margin-bottom: 4px">
              <a-checkbox :value="btn.key">{{ btn.title }}</a-checkbox>
            </div>
          </div>
        </a-checkbox-group>
        <a-divider style="margin: 12px 0" />
        <div style="font-weight: 500; margin-bottom: 8px">搜索</div>
        <a-checkbox v-model:checked="searchVisible">显示搜索框</a-checkbox>
        <template v-if="props.widthResettable">
          <a-divider style="margin: 12px 0" />
          <a-button size="small" block @click="$emit('reset-widths')">重置列宽</a-button>
        </template>
      </div>
    </template>
    <slot><a-button size="small">列配置</a-button></slot>
  </a-popover>
</template>
