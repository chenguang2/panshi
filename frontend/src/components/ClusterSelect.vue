<template>
  <a-select
    class="cluster-select"
    :value="displayValue"
    :placeholder="placeholder"
    :disabled="disabled"
    :show-search="true"
    :filter-option="filterClusterOption"
    @change="onChange"
    @blur="onBlur"
  >
    <a-select-option v-if="allowAll" value="">全部集群</a-select-option>
    <a-select-opt-group v-for="group in clusterGroups" :key="group.label" :label="group.label">
      <a-select-option v-for="cluster in group.clusters" :key="cluster.id" :value="cluster.id">
        {{ clusterLabel(cluster) }}
      </a-select-option>
    </a-select-opt-group>
  </a-select>
</template>

<script setup lang="ts">
import { computed } from 'vue'

/** 组件仅消费这 4 个字段；消费方可传全量 Cluster 或轻量结构 */
interface ClusterOption {
  id: number
  name: string
  display_name?: string
  group_name?: string
}

/**
 * 全站共享集群选择控件（cluster-select-unification）：
 * - 分组 optGroup 展示（具名分组按名称排序、未分组兜底末尾、组内按显示名排序）
 * - show-search：命中 display_name / name（大小写不敏感），与 EdgeEnv 原实现同语义
 * - allowAll：筛选模式首选项「全部集群」（value ''，即「未选具体集群=跨集群展示」既有契约）
 * - 默认必选模式：无「全部集群」项、不可清空，placeholder「请选择集群」
 * - 组件自身不发请求，clusters 由消费方注入（数据加载归属各页）
 */
const props = withDefaults(
  defineProps<{
    clusters?: ClusterOption[]
    modelValue?: number | string | null
    allowAll?: boolean
    placeholder?: string
    disabled?: boolean
  }>(),
  {
    clusters: () => [],
    modelValue: '',
    allowAll: false,
    placeholder: '请选择集群',
    disabled: false,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: number | string): void
  (e: 'change', value: number | string): void
  (e: 'blur'): void
}>()

function clusterLabel(cluster: ClusterOption): string {
  return cluster.display_name || cluster.name
}

/** 分组展示（与 EdgeEnv.vue clusterGroups 同语义；组内按显示名排序） */
const clusterGroups = computed(() => {
  const named = new Map<string, ClusterOption[]>()
  const ungrouped: ClusterOption[] = []
  for (const c of props.clusters) {
    if (c.group_name) {
      if (!named.has(c.group_name)) named.set(c.group_name, [])
      named.get(c.group_name)!.push(c)
    } else {
      ungrouped.push(c)
    }
  }
  const byLabel = (a: ClusterOption, b: ClusterOption) => clusterLabel(a).localeCompare(clusterLabel(b))
  const groups = Array.from(named.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, cs]) => ({ label, clusters: [...cs].sort(byLabel) }))
  if (ungrouped.length) groups.push({ label: '未分组', clusters: [...ungrouped].sort(byLabel) })
  return groups
})

const clusterById = computed(() => new Map(props.clusters.map((c) => [c.id, c])))

/**
 * 传给 a-select 的显示值：allowAll 模式原样透传（'' 命中「全部集群」选项）；
 * 必选模式 '' 转 undefined（antd 以 undefined 触发 placeholder 显示）
 */
const displayValue = computed(() => {
  if (props.allowAll) return props.modelValue
  return props.modelValue === '' || props.modelValue === null || props.modelValue === undefined
    ? undefined
    : props.modelValue
})

/** show-search 过滤：命中 display_name 或集群标识 name（与 EdgeEnv.vue filterClusterOption 同语义） */
function filterClusterOption(input: string, option: { value?: number | string } | undefined): boolean {
  const c = clusterById.value.get(Number(option?.value))
  if (!c) return false
  const q = input.toLowerCase()
  return [c.display_name, c.name].some((s) => (s || '').toLowerCase().includes(q))
}

function onChange(value: number | string): void {
  // 先值后事件：v-model 更新完成后，消费方 @change 副作用（如联动重置）读到的是新值
  emit('update:modelValue', value)
  emit('change', value)
}

function onBlur(): void {
  emit('blur')
}
</script>
