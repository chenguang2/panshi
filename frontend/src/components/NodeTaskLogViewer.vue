<template>
  <div class="ner-tabs">
    <div class="ner-tab-headers">
      <span class="ner-tab" :class="{ active: activeTab === 'stdout' }" @click="activeTab = 'stdout'">📄 stdout</span>
      <span v-if="stderr" class="ner-tab" :class="{ active: activeTab === 'stderr' }" @click="activeTab = 'stderr'">❌ stderr</span>
      <span v-if="command" class="ner-tab" :class="{ active: activeTab === 'command' }" @click="activeTab = 'command'">💻 命令</span>
      <span v-if="logs.length > 0" class="ner-tab" :class="{ active: activeTab === 'logs' }" @click="activeTab = 'logs'">📋 实时日志</span>
    </div>
    <div class="ner-tab-content">
      <div v-show="activeTab === 'stdout'" class="tab-body">
        <div v-if="logs.length > 0" class="log-box full-width" style="overflow-y:auto;max-height:50vh;">
          <pre style="margin:0;white-space:pre-wrap;word-break:break-all;" v-html="ansiToHtml(logs.join('\n'))"></pre>
        </div>
        <div v-else-if="stdout" class="log-box full-width">
          <pre style="margin:0;white-space:pre-wrap;word-break:break-all;" v-html="ansiToHtml(stdout)"></pre>
        </div>
        <div v-else style="color:var(--muted);">无输出</div>
      </div>

      <div v-show="activeTab === 'stderr'" class="tab-body">
        <div v-if="stderr" class="log-box full-width" style="border-color:var(--danger);">
          <pre style="margin:0;white-space:pre-wrap;word-break:break-all;color:var(--danger);">{{ stderr }}</pre>
        </div>
        <div v-else style="color:var(--muted);">无输出</div>
      </div>

      <div v-show="activeTab === 'command'" class="tab-body">
        <div v-if="command" class="log-box full-width">
          <pre style="margin:0;white-space:pre-wrap;word-break:break-all;">{{ command }}</pre>
        </div>
        <div v-else style="color:var(--muted);">无输出</div>
      </div>

      <div v-show="activeTab === 'logs'" class="tab-body">
        <div v-if="logs.length > 0" class="log-box full-width" style="overflow-y:auto;max-height:50vh;">
          <pre style="margin:0;white-space:pre-wrap;word-break:break-all;" v-html="ansiToHtml(logs.join('\n'))"></pre>
        </div>
        <div v-else style="color:var(--muted);">无输出</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ansiToHtml } from '@/utils/ansi'

const props = defineProps<{
  logs: string[]
  stdout?: string
  stderr?: string
  command?: string
}>()

const activeTab = ref<'stdout' | 'stderr' | 'command' | 'logs'>('stdout')

watch(
  () => props.stderr,
  (v) => {
    if (v && activeTab.value === 'stdout') activeTab.value = 'stderr'
  },
)
</script>
