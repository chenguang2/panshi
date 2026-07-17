<template>
  <Teleport to="body">
  <div class="modal-overlay" :style="{ display: visible ? 'flex' : 'none' }">
    <div class="modal modal-wide" style="max-width:860px;">
      <div class="modal-header">
        <h2>{{ title || '执行结果' }}</h2>
        <div class="modal-header-extra">
          <button class="btn btn-ghost btn-sm" @click="copyAll" :disabled="logs.length === 0">复制日志</button>
          <button class="modal-close" :disabled="installing" @click="onClose">&times;</button>
        </div>
      </div>
      <div class="modal-body" style="max-height:80vh;overflow-y:auto;">
        <!-- Progress bar -->
        <div style="margin-bottom:16px;">
          <div class="progress-bar-wrap">
            <div class="progress-bar" :class="'progress-' + progress.status" :style="{ width: progress.percent + '%' }"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-top:4px;">
            <span>{{ progress.percent }}%</span>
            <span>
              <template v-if="elapsed !== null">已用 {{ elapsed }} 秒</template>
              <template v-else-if="streamStatus === 'connecting'">连接中...</template>
              <template v-else>等待中...</template>
            </span>
          </div>
        </div>

        <!-- Error banner -->
        <div v-if="streamError" style="margin-bottom:12px;padding:10px 14px;background:oklch(55% 0.18 28 / 8%);border:1px solid oklch(55% 0.18 28 / 25%);border-radius:6px;color:var(--danger);font-size:13px;">
          ❌ {{ streamError }}
        </div>

        <!-- Tabs -->
        <div class="ner-tabs">
          <div class="ner-tab-headers">
            <span class="ner-tab" :class="{ active: activeTab === 'summary' }" @click="activeTab = 'summary'">📋 关键信息</span>
            <span class="ner-tab" :class="{ active: activeTab === 'stdout' }" @click="activeTab = 'stdout'">📄 stdout</span>
            <span v-if="result && result.stderr" class="ner-tab" :class="{ active: activeTab === 'stderr' }" @click="activeTab = 'stderr'">❌ stderr</span>
            <span class="ner-tab" :class="{ active: activeTab === 'command' }" @click="activeTab = 'command'">💻 命令</span>
          </div>
          <div class="ner-tab-content">
            <!-- Summary tab -->
            <div v-show="activeTab === 'summary'" class="tab-body">
              <!-- Install operation summary -->
              <template v-if="title && title.startsWith('安装')">
                <div v-if="result && result.rc !== null" style="margin-bottom:12px;">
                  <div v-if="result.rc === 0" class="result-badge result-success">✅ 安装成功</div>
                  <div v-else class="result-badge result-fail">❌ 安装失败 (rc: {{ result.rc }})</div>
                </div>
                <div v-else style="margin-bottom:12px;">
                  <div class="result-badge" style="background:oklch(56% 0.16 210 / 10%);color:var(--accent);">⏳ 安装中...</div>
                </div>
                <div style="color:var(--muted);font-size:12px;">请在「stdout」标签页查看实时安装日志。</div>
              </template>

              <!-- Nginx operation summary (start/stop/status) -->
              <template v-else>
                <div v-if="result && result.rc !== null" style="margin-bottom:12px;">
                  <div v-if="result.rc === 0" class="result-badge result-success">✅ 成功</div>
                  <div v-else class="result-badge result-fail">❌ 失败 (rc: {{ result.rc }})</div>
                </div>
                <div v-if="result && result.rc !== null && result.rc !== 0 && result.stderr" class="error-text">
                  {{ result.stderr }}
                </div>

                <!-- Nginx status card -->
                <div v-if="nginxStatus.known" class="ner-card" :class="nginxStatus.running ? 'card-success' : 'card-fail'">
                  <div class="ner-card-title">
                    <span :style="{ color: nginxStatus.running ? 'var(--success)' : 'var(--danger)' }">
                      {{ nginxStatus.running ? '●' : '○' }}
                    </span>
                    Nginx 进程: {{ nginxStatus.running ? '运行中' : '未运行' }}
                  </div>
                  <div v-if="nginxStatus.pid" class="ner-card-detail">PID: {{ nginxStatus.pid }}</div>
                </div>
                <div v-else-if="result && result.rc !== null && result.rc !== 0" class="ner-card card-warn">
                  <div class="ner-card-title">
                    <span style="color:var(--warning);">○</span>
                    Nginx 进程: 未查询到（操作未成功执行）
                  </div>
                </div>

                <!-- Highlights -->
                <div v-if="highlights.length > 0" style="margin-bottom:12px;">
                  <div class="section-label">关键信息</div>
                  <div class="log-box">
                    <div v-for="(line, i) in highlights" :key="i" style="color:var(--success);">{{ line }}</div>
                  </div>
                </div>

                <!-- Statistics -->
                <div v-if="statistics && Object.keys(statistics).length > 0" style="margin-bottom:12px;">
                  <div class="section-label">节点统计信息</div>
                  <div class="stat-grid">
                    <div v-for="(val, key) in statistics" :key="key" class="stat-item">
                      <span class="stat-label">{{ statLabels[key] || key }}</span>
                      <span class="stat-value">{{ val }}</span>
                    </div>
                  </div>
                </div>

                <div v-if="result" style="color:var(--muted);font-size:12px;">返回码 (rc): {{ result.rc }}</div>
              </template>

              <div v-if="logs.length > 0" style="margin-top:12px;">
                <div class="section-label">执行日志</div>
                <div class="log-box">
                  <div v-for="(line, i) in logs" :key="i" style="white-space:pre-wrap;" v-html="ansiToHtml(line)"></div>
                </div>
              </div>
            </div>

            <!-- stdout tab -->
            <div v-show="activeTab === 'stdout'" class="tab-body">
              <div v-if="logs.length > 0" ref="stdoutLogBox" class="log-box full-width" style="overflow-y:auto;max-height:50vh;">
                <pre style="margin:0;white-space:pre-wrap;word-break:break-all;" v-html="ansiToHtml(logs.join('\n'))"></pre>
              </div>
              <div v-else-if="result && result.stdout" class="log-box full-width">
                <pre style="margin:0;white-space:pre-wrap;word-break:break-all;" v-html="ansiToHtml(result.stdout)"></pre>
              </div>
              <div v-else style="color:var(--muted);">无输出</div>
            </div>

            <!-- stderr tab -->
            <div v-show="activeTab === 'stderr'" class="tab-body">
              <div v-if="result && result.stderr" class="log-box full-width" style="border-color:var(--danger);">
                <pre style="margin:0;white-space:pre-wrap;word-break:break-all;color:var(--danger);">{{ result.stderr }}</pre>
              </div>
            </div>

            <!-- command tab -->
            <div v-show="activeTab === 'command'" class="tab-body">
              <div v-if="result && result.command" class="log-box full-width">
                <pre style="margin:0;white-space:pre-wrap;word-break:break-all;">{{ result.command }}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button v-if="installing" class="btn btn-danger" @click="onCancel">取消安装</button>
        <button v-else class="btn btn-secondary" @click="onClose">关闭</button>
      </div>
    </div>
  </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { message } from 'ant-design-vue'
import { ansiToHtml, stripAnsi } from '@/utils/ansi'

const props = defineProps<{
  visible: boolean
  title: string
  progress: { percent: number; status: 'active' | 'success' | 'exception' }
  logs: string[]
  elapsed: number | null
  result: { stdout: string; stderr: string; command: string; rc: number } | null
  highlights: string[]
  statistics: Record<string, string> | null
  installing?: boolean
  streamError?: string | null
  streamStatus?: string
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'cancel': []
}>()

const activeTab = ref('summary')
const stdoutLogBox = ref<HTMLElement | null>(null)

function allLines(): string[] {
  const lines = [...props.highlights]
  if (props.result?.stdout) {
    for (const l of props.result.stdout.split('\n')) {
      const t = l.trim()
      if (t && !lines.includes(t)) lines.push(t)
    }
  }
  return lines
}

const nginxStatus = computed(() => {
  const lines = allLines()
  if (lines.length === 0) {
    return { known: false, running: false, pid: null }
  }
  const hasRunning = (l: string) => /\b(running|started|reloaded)\b/i.test(l) && /nginx/i.test(l)
  const hasPid = lines.some(l => /PID\s*:\s*\d+/i.test(l))
  const running = lines.some(hasRunning) || hasPid
  const pidLine = lines.find(l => /PID\s*:\s*\d+/i.test(l))
  const pid = pidLine ? (pidLine.match(/PID\s*:\s*(\d+)/i)?.[1] || null) : null
  return { known: true, running, pid }
})

const statLabels: Record<string, string> = {
  cpu_usage: 'CPU 使用率 (Nginx)',
  memory_usage: '内存使用率 (Nginx)',
  system_cpu_usage: 'CPU 使用率 (系统)',
  system_memory_usage: '内存使用率 (系统)',
  edge_version: 'Edge 版本',
}

// Auto-scroll stdout log box to bottom when new lines arrive
watch(() => props.logs.length, async () => {
  if (activeTab.value !== 'stdout') return
  await nextTick()
  if (stdoutLogBox.value) {
    stdoutLogBox.value.scrollTop = stdoutLogBox.value.scrollHeight
  }
})

watch(() => props.result, (r) => {
  if (r && r.rc !== 0 && r.stderr) {
    activeTab.value = 'stderr'
  }
})

function onClose() {
  emit('update:visible', false)
}
function onCancel() {
  emit('cancel')
}
function onOverlayClick() {
  if (props.installing) return // Don't close during installation
  onClose()
}

async function copyAll() {
  const text = stripAnsi(props.logs.join('\n'))
  try {
    await navigator.clipboard.writeText(text)
    message.success('已复制到剪贴板')
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    message.success('已复制到剪贴板')
  }
}
</script>

<style scoped>
/* ── Progress bar ── */
.progress-bar-wrap {
  width: 100%;
  height: 8px;
  background: oklch(88% 0.008 240);
  border-radius: 4px;
  overflow: hidden;
}
.progress-bar {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
  background: var(--accent);
}
.progress-bar.progress-success { background: var(--success); }
.progress-bar.progress-exception { background: var(--danger); }

/* ── Custom tabs ── */
.ner-tabs { margin-top: 8px; }
.ner-tab-headers {
  display: flex; gap: 2px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0;
  margin-bottom: 12px;
}
.ner-tab {
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
  color: var(--muted);
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 6px 6px 0 0;
  transition: all 0.15s;
  user-select: none;
}
.ner-tab:hover {
  color: var(--fg);
  background: oklch(50% 0 0 / 4%);
  border-color: var(--border);
}
.ner-tab.active {
  color: var(--accent);
  background: var(--surface);
  border-color: var(--border);
  border-bottom-color: var(--surface);
  margin-bottom: -1px;
  font-weight: 500;
}

/* ── Tab body ── */
.tab-body {
  min-height: 100px;
}

/* ── Log box ── */
.log-box {
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 10px;
  border-radius: 4px;
  font-family: 'Courier New', Courier, monospace;
  font-size: 12px;
  line-height: 1.6;
  border: 1px solid #333;
  max-height: 400px;
  overflow-y: auto;
}
.log-box::-webkit-scrollbar { width: 8px; }
.log-box::-webkit-scrollbar-thumb { background: #666; border-radius: 4px; }
.log-box::-webkit-scrollbar-track { background: #333; }
.log-box.full-width {
  max-height: calc(60vh - 20px);
}

/* ── Result badges ── */
.result-badge {
  font-size: 15px;
  font-weight: 600;
}
.result-success { color: var(--success); }
.result-fail { color: var(--danger); }

/* ── Error text ── */
.error-text {
  color: var(--danger);
  margin-bottom: 12px;
}

/* ── Cards ── */
.ner-card {
  padding: 10px 14px;
  border-radius: 6px;
  margin-bottom: 12px;
  border: 1px solid;
}
.card-success {
  background: oklch(55% 0.15 145 / 8%);
  border-color: oklch(55% 0.15 145 / 25%);
}
.card-fail {
  background: oklch(55% 0.18 28 / 8%);
  border-color: oklch(55% 0.18 28 / 25%);
}
.card-warn {
  background: oklch(65% 0.15 85 / 8%);
  border-color: oklch(65% 0.15 85 / 25%);
}
.ner-card-title {
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 4px;
}
.ner-card-detail {
  font-size: 13px;
  color: var(--muted);
}

/* ── Section label ── */
.section-label {
  font-weight: 500;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--fg);
}

/* ── Stats grid ── */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}
.stat-item {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 8px 12px;
}
.stat-label {
  display: block;
  font-size: 12px;
  color: var(--muted);
}
.stat-value {
  display: block;
  font-size: 14px;
  font-weight: 500;
  margin-top: 2px;
  color: var(--fg);
}

/* ── Empty state ── */
.ner-empty-state {
  color: var(--danger);
  padding: 8px;
  background: oklch(55% 0.18 28 / 8%);
  border-radius: 4px;
  border: 1px solid oklch(55% 0.18 28 / 25%);
}
.ner-empty-title {
  font-weight: 500;
  margin-bottom: 4px;
}

/* ── Modal header extra ── */
.modal-header-extra {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
