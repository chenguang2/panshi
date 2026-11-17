<template>
  <div class="l5-pager">
    <span class="p-info">
      共 <b>{{ total }}</b> {{ unit }}
      <template v-if="showSizeChanger">
        · 每页
        <select class="pager-select" :value="pageSize" @change="onSizeChange">
          <option v-for="opt in sizeOptions" :key="opt" :value="opt">{{ opt }} 条</option>
        </select>
      </template>
    </span>
    <span class="p-nav">
      <button class="p-btn" :disabled="current <= 1" title="上一页" @click="go(current - 1)">
        <StrokeIcon name="chevronLeft" />
      </button>
      <template v-for="item in pageItems" :key="item.key">
        <span v-if="item.type === 'gap'" class="p-gap">…</span>
        <button
          v-else-if="item.type === 'page'"
          class="p-btn"
          :class="{ active: item.page === current }"
          @click="go(item.page)"
        >
          {{ item.page }}
        </button>
      </template>
      <button class="p-btn" :disabled="current >= totalPages" title="下一页" @click="go(current + 1)">
        <StrokeIcon name="chevronRight" />
      </button>
      <span v-if="showQuickJumper" class="p-jump">
        跳至
        <input v-model="jumpText" inputmode="numeric" @keyup.enter="applyJump" @blur="applyJump" />
        页
      </span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import StrokeIcon from './StrokeIcon.vue'
import { PAGE_SIZE_VALUES } from '@/composables/usePagination'

/**
 * 表格外置分页条（mockup-parity-standard r4-④⑤ 的设计单点）：
 *
 * 为什么不用 a-table 内置分页：antd 内置分页对 `dataSource` 做**客户端切片**
 * （`slice((current-1)*pageSize, ...)`），而分组列表的 dataSource 已注入组标记行 →
 * 组头行吃掉页容量，越靠后的页丢得越多（实测 40 节点/页 20：第 1 页 18 节点、第 2 页 5 节点）。
 * 页面因此一律 `:pagination="false"` + 本组件（服务端分页 / 已切页数据 + 独立分页条）。
 *
 * 解剖取自主设计稿 `.l5-pager`（左「共 N · 每页 [下拉]」、右「‹ 页码… › 跳至 [] 页」，
 * 当前页实心 accent，样式单一来源 = style.css 的 `.l5-pager` 段）。
 */
const props = withDefaults(
  defineProps<{
    page: number
    pageSize: number
    total: number
    /** 总数文案量词：'个节点' | '个上游' | '条路由' | '条' */
    unit?: string
    showSizeChanger?: boolean
    showQuickJumper?: boolean
    sizeOptions?: number[]
  }>(),
  {
    unit: '条',
    showSizeChanger: true,
    showQuickJumper: true,
    sizeOptions: () => PAGE_SIZE_VALUES,
  },
)

const emit = defineEmits<{ (e: 'change', page: number, pageSize: number): void }>()

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / Math.max(1, props.pageSize))))
const current = computed(() => Math.min(Math.max(1, props.page), totalPages.value))

interface PagerItem {
  key: string
  type: 'page' | 'gap'
  page: number
}

/** 页码窗口：≤7 页全列；更长则「首 / … / 当前±1 / … / 末」 */
const pageItems = computed<PagerItem[]>(() => {
  const last = totalPages.value
  const cur = current.value
  if (last <= 7) {
    return Array.from({ length: last }, (_, i) => ({ key: `p${i + 1}`, type: 'page' as const, page: i + 1 }))
  }
  const out: PagerItem[] = [{ key: 'p1', type: 'page', page: 1 }]
  const start = Math.max(2, cur - 1)
  const end = Math.min(last - 1, cur + 1)
  if (start > 2) out.push({ key: 'gapL', type: 'gap', page: 0 })
  for (let p = start; p <= end; p++) out.push({ key: `p${p}`, type: 'page', page: p })
  if (end < last - 1) out.push({ key: 'gapR', type: 'gap', page: 0 })
  out.push({ key: `p${last}`, type: 'page', page: last })
  return out
})

const jumpText = ref(String(current.value))
watch(current, (v) => {
  jumpText.value = String(v)
})

function go(target: number) {
  const next = Math.min(Math.max(1, target), totalPages.value)
  if (next === current.value) return
  emit('change', next, props.pageSize)
}

function onSizeChange(e: Event) {
  const size = Number((e.target as HTMLSelectElement).value)
  if (!size || size === props.pageSize) return
  // 改每页条数回到第 1 页（与 antd 内置分页同语义）
  emit('change', 1, size)
}

function applyJump() {
  const n = Number(jumpText.value)
  if (!Number.isFinite(n) || n < 1) {
    jumpText.value = String(current.value)
    return
  }
  const next = Math.min(Math.floor(n), totalPages.value)
  if (next !== current.value) emit('change', next, props.pageSize)
  jumpText.value = String(next)
}
</script>
