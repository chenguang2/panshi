<template>
  <div class="ner-tabs">
    <div class="ner-tab-headers" role="tablist">
      <button type="button" class="ner-tab" :class="{ active: activeTab === 'stdout' }" role="tab" :aria-selected="activeTab === 'stdout'" @click="activeTab = 'stdout'">📄 stdout</button>
      <button v-if="stderr" type="button" class="ner-tab" :class="{ active: activeTab === 'stderr' }" role="tab" :aria-selected="activeTab === 'stderr'" @click="activeTab = 'stderr'">❌ stderr</button>
      <button v-if="command" type="button" class="ner-tab" :class="{ active: activeTab === 'command' }" role="tab" :aria-selected="activeTab === 'command'" @click="activeTab = 'command'">💻 命令</button>
      <button v-if="logs.length > 0" type="button" class="ner-tab" :class="{ active: activeTab === 'logs' }" role="tab" :aria-selected="activeTab === 'logs'" @click="activeTab = 'logs'">📋 实时日志</button>
    </div>
    <div class="ner-tab-content">
      <div v-if="activeTab === 'stdout'" class="tab-body">
        <div v-if="logs.length > 0" class="log-box full-width log-scroll" ref="stdoutBox" @scroll="onScroll">
          <pre style="margin:0;white-space:pre-wrap;word-break:break-all;" v-html="renderedLogs"></pre>
        </div>
        <div v-else-if="stdout" class="log-box full-width">
          <pre style="margin:0;white-space:pre-wrap;word-break:break-all;" v-html="renderedStdout"></pre>
        </div>
        <div v-else style="color:var(--muted);">无输出</div>
      </div>

      <div v-if="activeTab === 'stderr'" class="tab-body">
        <div v-if="stderr" class="log-box full-width" style="border-color:var(--danger);">
          <pre style="margin:0;white-space:pre-wrap;word-break:break-all;color:var(--danger);">{{ stderr }}</pre>
        </div>
        <div v-else style="color:var(--muted);">无输出</div>
      </div>

      <div v-if="activeTab === 'command'" class="tab-body">
        <div v-if="command" class="log-box full-width">
          <pre style="margin:0;white-space:pre-wrap;word-break:break-all;">{{ command }}</pre>
        </div>
        <div v-else style="color:var(--muted);">无输出</div>
      </div>

      <div v-if="activeTab === 'logs'" class="tab-body">
        <div v-if="logs.length > 0" class="log-box full-width log-scroll" ref="logsBox" @scroll="onScroll">
          <pre style="margin:0;white-space:pre-wrap;word-break:break-all;" v-html="renderedLogs"></pre>
        </div>
        <div v-else style="color:var(--muted);">无输出</div>
      </div>
    </div>
    <button v-if="showBackToLatest" type="button" class="back-to-latest" @click="scrollToBottom">↓ 回到最新</button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { ansiToHtml } from '@/utils/ansi'

const props = defineProps<{
  logs: string[]
  stdout?: string
  stderr?: string
  command?: string
}>()

const activeTab = ref<'stdout' | 'stderr' | 'command' | 'logs'>('stdout')

const stdoutBox = ref<HTMLElement | null>(null)
const logsBox = ref<HTMLElement | null>(null)
const autoScroll = ref(true)
const showBackToLatest = ref(false)
const SCROLL_LEEWAY = 40

const renderedLogs = computed(() => ansiToHtml(props.logs.join('\n')))
const renderedStdout = computed(() => ansiToHtml(props.stdout || ''))

function activeBox(): HTMLElement | null {
  if (activeTab.value === 'stdout') return stdoutBox.value
  if (activeTab.value === 'logs') return logsBox.value
  return null
}

function isNearBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < SCROLL_LEEWAY
}

function scrollToBottom() {
  const el = activeBox()
  if (!el) return
  el.scrollTop = el.scrollHeight
  autoScroll.value = true
  showBackToLatest.value = false
}

function onScroll(e: Event) {
  const el = e.target as HTMLElement
  const nearBottom = isNearBottom(el)
  autoScroll.value = nearBottom
  showBackToLatest.value = !nearBottom
}

function watchAndAutoScroll() {
  if (!autoScroll.value) return
  void nextTick(() => {
    const el = activeBox()
    if (el && autoScroll.value) {
      el.scrollTop = el.scrollHeight
      showBackToLatest.value = false
    }
  })
}

watch(() => props.logs, watchAndAutoScroll)
watch(activeTab, () => {
  void nextTick(() => {
    if (autoScroll.value) {
      const el = activeBox()
      if (el) el.scrollTop = el.scrollHeight
    }
  })
})

watch(
  () => props.stderr,
  (v) => {
    if (v && activeTab.value === 'stdout') activeTab.value = 'stderr'
  },
)
</script>

<style scoped>
.ner-tabs { margin-top: 8px; }
.ner-tab-headers {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.ner-tab {
  padding: 5px 14px;
  font-size: 13px;
  line-height: 1.4;
  cursor: pointer;
  color: var(--muted, #666);
  background: var(--card-bg, #fff);
  border: 1px solid var(--border, #d9d9d9);
  border-radius: 6px;
  transition: all 0.15s;
  user-select: none;
  font-family: inherit;
}
.ner-tab:hover {
  color: var(--fg, #222);
  border-color: var(--accent, #2563eb);
}
.ner-tab.active {
  color: var(--accent, #2563eb);
  background: color-mix(in oklab, var(--accent, #2563eb) 8%, var(--card-bg, #fff));
  border-color: var(--accent, #2563eb);
  font-weight: 600;
}
.ner-tab:focus-visible {
  outline: 2px solid var(--accent, #2563eb);
  outline-offset: 1px;
}
.tab-body { min-height: 80px; }
.log-scroll {
  overflow-y: auto;
  max-height: 50vh;
  position: relative;
}
.log-box {
  background: #1e1e1e;
  color: #d4d4d4;
  border-radius: 6px;
  padding: 10px 12px;
}
.log-box.full-width { width: 100%; }
.back-to-latest {
  position: sticky;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  margin-top: -34px;
  padding: 4px 14px;
  font-size: 12px;
  cursor: pointer;
  color: var(--accent, #2563eb);
  background: var(--card-bg, #fff);
  border: 1px solid var(--accent, #2563eb);
  border-radius: 999px;
  box-shadow: 0 2px 8px rgb(0 0 0 / 15%);
  z-index: 5;
}
.back-to-latest:hover {
  background: color-mix(in oklab, var(--accent, #2563eb) 10%, var(--card-bg, #fff));
}
</style>
