<template>
  <div v-if="visible" class="gs-overlay" @mousedown.self="close">
    <div class="gs-panel">
      <div class="gs-input-row">
        <SearchOutlined class="gs-input-icon" />
        <input
          ref="inputRef"
          v-model="query"
          class="gs-input"
          type="text"
          placeholder="搜索页面：名称 / 分组 / 路径…"
          @keydown.down.prevent="move(1)"
          @keydown.up.prevent="move(-1)"
          @keydown.enter.prevent="go(activeIndex)"
          @keydown.esc.prevent="close"
        />
        <span class="gs-esc-hint">Esc</span>
      </div>
      <div ref="listRef" class="gs-results">
        <button
          v-for="(item, i) in results"
          :key="item.name"
          type="button"
          class="gs-item"
          :class="{ 'gs-item-active': i === activeIndex }"
          @mouseenter="activeIndex = i"
          @click="go(i)"
        >
          <span class="gs-item-title">{{ item.title }}</span>
          <span v-if="item.section" class="gs-item-section">{{ item.section }}</span>
        </button>
        <div v-if="!results.length" class="gs-empty">无匹配页面</div>
      </div>
      <div class="gs-footer">↑↓ 选择 · Enter 跳转 · Ctrl+K 呼出/关闭</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { SearchOutlined } from '@ant-design/icons-vue'
import { collectNavEntries, filterNavEntries, type NavEntry } from '@/router/navMeta'

const router = useRouter()
const visible = ref(false)
const query = ref('')
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLElement | null>(null)

const allEntries = collectNavEntries(router)
const results = computed<NavEntry[]>(() =>
  query.value.trim() ? filterNavEntries(allEntries, query.value) : allEntries,
)

watch(results, () => {
  activeIndex.value = 0
})

watch(visible, async (v) => {
  if (v) {
    await nextTick()
    inputRef.value?.focus()
  }
})

function open(): void {
  query.value = ''
  activeIndex.value = 0
  visible.value = true
}

function close(): void {
  visible.value = false
}

function move(delta: number): void {
  const len = results.value.length
  if (!len) return
  activeIndex.value = (activeIndex.value + delta + len) % len
  nextTick(() => {
    const el = listRef.value?.querySelector<HTMLElement>('.gs-item-active')
    el?.scrollIntoView({ block: 'nearest' })
  })
}

function go(index: number): void {
  const item = results.value[index]
  if (!item) return
  close()
  void router.push(item.path)
}

function onGlobalKeydown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    if (visible.value) {
      close()
    } else {
      open()
    }
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown))

defineExpose({ open })
</script>

<style scoped>
.gs-overlay {
  position: fixed;
  inset: 0;
  z-index: 1100;
  background: oklch(0% 0 0 / 40%);
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
}

.gs-panel {
  width: min(560px, 92vw);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.gs-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  height: 48px;
  border-bottom: 1px solid var(--border);
}

.gs-input-icon {
  color: var(--muted);
  font-size: 15px;
}

.gs-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14px;
  color: var(--fg);
}

.gs-input::placeholder {
  color: var(--muted);
}

.gs-esc-hint {
  font-size: 11px;
  color: var(--muted);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 1px 6px;
}

.gs-results {
  max-height: 380px;
  overflow-y: auto;
  padding: 6px;
}

.gs-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  text-align: left;
}

.gs-item-active {
  background: var(--accent-bg);
}

.gs-item-title {
  font-size: 14px;
  color: var(--fg);
}

.gs-item-active .gs-item-title {
  color: var(--accent);
  font-weight: 500;
}

.gs-item-section {
  font-size: 11px;
  color: var(--muted);
  flex-shrink: 0;
}

.gs-empty {
  padding: 24px 0;
  text-align: center;
  font-size: 13px;
  color: var(--muted);
}

.gs-footer {
  padding: 8px 14px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--muted);
}
</style>
