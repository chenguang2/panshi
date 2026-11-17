<template>
  <div class="l5-toolbar" data-test="toolbar">
    <slot name="filters" />
    <span class="t-spacer"></span>
    <slot name="extra" />
    <span v-if="showCount" class="l5-count" data-test="toolbar-count"
      >共 <b>{{ count }}</b> {{ countUnit }}</span
    >
    <button
      type="button"
      class="tool-btn"
      data-test="toolbar-refresh"
      title="重新拉取列表"
      :disabled="refreshing"
      @click="emit('refresh')"
    >
      <ReloadOutlined :spin="refreshing" /> 刷新
    </button>
    <slot name="config" />
    <!-- 分组批量折叠（r5-④ 方案 A）：由消费页注入，仅在分组模式由消费页自行 v-if 控制 -->
    <slot name="mode-extra" />
    <div v-if="showMode" class="seg">
      <button
        type="button"
        class="seg-opt all"
        :class="{ active: mode === 'group' }"
        data-test="view-mode-group"
        :aria-pressed="mode === 'group'"
        @click="setMode('group')"
      >
        分组
      </button>
      <button
        type="button"
        class="seg-opt all"
        :class="{ active: mode === 'flat' }"
        data-test="view-mode-flat"
        :aria-pressed="mode === 'flat'"
        @click="setMode('flat')"
      >
        平铺
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ReloadOutlined } from '@ant-design/icons-vue'
import type { ListViewMode } from '@/composables/useListClusterGrouping'

/**
 * 列表页工具条（list-pages-console-restyle 共享层，取代 table-toolbar-ux 的「列配置靠左」旧序）。
 *
 * 顺序契约（contract §1）：`#filters（左） → 弹簧 → #extra → 计数 → 刷新 → #config → #mode-extra → 分组|平铺（最右）`。
 * 视觉基准：docs/ui/Live-Artifact-5/proposal-c/{nodes,upstreams,routes}.html 的 .l5-toolbar（32px 控件高度、
 * 12px 计数、.tool-btn / .seg 解剖）。样式单一来源 src/style.css 的「列表页控制台层」段落，组件内只做结构。
 * DOM 契约（测试依赖，勿改名）：toolbar / toolbar-count / toolbar-refresh / view-mode-group / view-mode-flat。
 */
const props = withDefaults(
  defineProps<{
    /** 计数数值（必填） */
    count: number | string
    /** 计数单位，如 '个节点' / '个上游' / '条路由' */
    countUnit: string
    /** 刷新按钮 loading（禁用 + 图标旋转） */
    refreshing?: boolean
    /** 是否渲染「分组|平铺」切换器（默认 true） */
    showMode?: boolean
    /** 是否渲染计数（默认 true；路由页 V2 双行结构计数在方法 chips 行右端，传 false） */
    showCount?: boolean
    /** 视图模式（v-model:mode，默认分组） */
    mode?: ListViewMode
  }>(),
  { refreshing: false, showMode: true, showCount: true, mode: 'group' },
)

const emit = defineEmits<{
  (e: 'refresh'): void
  (e: 'update:mode', mode: ListViewMode): void
}>()

/** 点已选中的模式不重复 emit（避免消费方无谓重算） */
function setMode(next: ListViewMode): void {
  if (next === props.mode) return
  emit('update:mode', next)
}
</script>
