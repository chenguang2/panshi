<script setup lang="ts">
/**
 * 集群分组带（卡片页「分组」视图）——filter-architecture，2026-11-18。
 *
 * 契约（AGENTS #87 / CARD-PAGES-DESIGN-BRIEF §七）：
 * - 只报「集群名 + 分组徽标 + N 个X + 一个次要指标 + 折叠控制」，**不放状态计数**
 *   （状态分布归顶部状态 chips 行，避免同一组数字出现第三次）；
 * - 整条可点开合（`role=button` + `aria-expanded`），chevron 单击不触发两次；
 * - 批量态下右侧可提供「全选本组 / 取消本组」与「已选 k / N」。
 */
import StrokeIcon from '@/components/StrokeIcon.vue'

withDefaults(
  defineProps<{
    /** 集群名 */
    name: string
    /** 集群分组徽标（可空） */
    group?: string
    /** 规模文案：「10 个四层代理」 */
    countLabel: string
    /** 次要指标文案（band 右端），如「目标 12 个」 */
    secondary?: string
    /** 集群色相类（cluster-c1..c8） */
    hueClass?: string
    /** 是否已折叠 */
    folded?: boolean
    /** 批量态：显示「全选本组 / 取消本组」 */
    batch?: boolean
    /** 批量态：本组已选 / 总数 */
    selectedCount?: number
  }>(),
  { group: '', secondary: '', hueClass: 'cluster-c1', folded: false, batch: false, selectedCount: 0 },
)

const emit = defineEmits<{
  (e: 'toggle'): void
  (e: 'toggle-select'): void
}>()

/** chevron 自己吞掉冒泡，避免「整条可点 + chevron 可点」触发两次 */
function onChevron(event: Event): void {
  event.stopPropagation()
  emit('toggle')
}

function onSelect(event: Event): void {
  event.stopPropagation()
  emit('toggle-select')
}
</script>

<template>
  <div
    class="l5-band"
    :class="hueClass"
    role="button"
    tabindex="0"
    :aria-expanded="folded ? 'false' : 'true'"
    @click="emit('toggle')"
    @keydown.enter.prevent="emit('toggle')"
    @keydown.space.prevent="emit('toggle')"
  >
    <button class="g-chev" type="button" :aria-expanded="folded ? 'false' : 'true'" @click="onChevron">
      <StrokeIcon :name="folded ? 'chevronRight' : 'chevronDown'" :size="13" />
    </button>
    <span class="b-name">{{ name }}</span>
    <span v-if="group" class="lp-tag group">{{ group }}</span>
    <span class="b-count">{{ countLabel }}</span>
    <span class="b-spacer"></span>
    <template v-if="batch">
      <span class="b-selcount">已选 {{ selectedCount }} / {{ countLabel.split(' ')[0] }}</span>
      <button class="band-select" type="button" @click="onSelect">
        {{ selectedCount > 0 ? '取消本组' : '全选本组' }}
      </button>
    </template>
    <span v-if="secondary" class="b-hint">{{ secondary }}</span>
  </div>
</template>
